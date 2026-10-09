#!/usr/bin/env bash
# Production-деплой twomc.su на сервере (запускать из корня checkout на сервере).
#   infrastructure/deploy.sh            # деплой текущего main
#   infrastructure/deploy.sh rollback   # вернуть предыдущий релиз
#
# Шаги: проверка чистого main → build образов с тегом git sha → prisma migrate
# deploy (production-safe, без migrate dev / db push) → переключение контейнеров
# → health check → запись RELEASE в .release / .release.prev для отката.
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE=(docker compose --env-file .env -f infrastructure/docker-compose.prod.yml)

health() {
  local url=$1 tries=${2:-20}
  for _ in $(seq 1 "$tries"); do
    if curl -fsS -m 5 "$url" >/dev/null; then return 0; fi
    sleep 3
  done
  return 1
}

if [[ "${1:-}" == "rollback" ]]; then
  [[ -f .release.prev ]] || { echo "Нет предыдущего релиза (.release.prev)"; exit 1; }
  PREV=$(cat .release.prev)
  echo "Откат на $PREV"
  RELEASE=$PREV "${COMPOSE[@]}" up -d --no-build api web
  health "http://127.0.0.1:${API_PORT:-4000}/health" && health "http://127.0.0.1:${WEB_PORT:-3000}/"
  mv .release.prev .release
  echo "Откат выполнен: $PREV"
  exit 0
fi

[[ -f .env ]] || { echo ".env отсутствует — заполните по .env.example"; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo "Рабочая директория не чистая — деплой только из закоммиченного main"; exit 1; }
BRANCH=$(git rev-parse --abbrev-ref HEAD)
[[ "$BRANCH" == "main" ]] || { echo "Деплой только из main (сейчас: $BRANCH)"; exit 1; }
git pull --ff-only
RELEASE=$(git rev-parse --short HEAD)
export RELEASE
echo "Релиз $RELEASE"

echo "→ build образов"
"${COMPOSE[@]}" build api web

echo "→ инфраструктура (postgres, redis)"
"${COMPOSE[@]}" up -d postgres redis

echo "→ миграции (prisma migrate deploy)"
"${COMPOSE[@]}" run --rm --no-deps api sh -c "cd /app/apps/api && npx prisma migrate deploy"

echo "→ переключение приложений"
[[ -f .release ]] && cp .release .release.prev
echo "$RELEASE" > .release
"${COMPOSE[@]}" up -d api web

echo "→ health check"
if health "http://127.0.0.1:${API_PORT:-4000}/health" && health "http://127.0.0.1:${WEB_PORT:-3000}/"; then
  echo "Деплой $RELEASE успешен"
  docker image prune -f >/dev/null || true
else
  echo "Health check не прошёл — откат"
  "$0" rollback
  exit 1
fi
