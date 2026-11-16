#!/usr/bin/env bash
# Production-деплой twomc.su на сервере (запускать из корня checkout на сервере).
#   infrastructure/deploy.sh            # деплой текущего main
#   infrastructure/deploy.sh rollback   # вернуть предыдущий релиз (только образы, схема БД не откатывается)
#
# Шаги: проверка чистого main → build образов с тегом git sha → снимок БД (pg_dump) →
# prisma migrate deploy (production-safe, без migrate dev / db push) → переключение контейнеров →
# health check → запись RELEASE в .release / .release.prev → очистка старых тегов образов.
#
# Порядок «снимок → миграция → переключение» и правило expand/contract: ADR-0158, docs/runbooks/deploy.md.
#
# Переменные окружения (все необязательные):
#   PREDEPLOY_BACKUP_DIR  каталог снимков БД, вне репозитория (по умолчанию $HOME/twomc-backups/predeploy)
#   PREDEPLOY_BACKUP_KEEP сколько последних снимков хранить (по умолчанию 7)
#   KEEP_RELEASES         сколько последних тегов образов api/web хранить (по умолчанию 3, минимум 2)
#   API_PORT, WEB_PORT    порты на 127.0.0.1 (4000 / 3000)
#   HEALTH_TRIES, HEALTH_INTERVAL  число попыток и пауза в секундах (20 / 3)
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE=(docker compose --env-file .env -f infrastructure/docker-compose.prod.yml)

API_HEALTH_URL="http://127.0.0.1:${API_PORT:-4000}/health"
WEB_HEALTH_URL="http://127.0.0.1:${WEB_PORT:-3000}/"
HEALTH_TRIES=${HEALTH_TRIES:-20}
HEALTH_INTERVAL=${HEALTH_INTERVAL:-3}
KEEP_RELEASES=${KEEP_RELEASES:-3}
PREDEPLOY_BACKUP_DIR=${PREDEPLOY_BACKUP_DIR:-$HOME/twomc-backups/predeploy}
PREDEPLOY_BACKUP_KEEP=${PREDEPLOY_BACKUP_KEEP:-7}

health() {
  local url=$1 tries=${2:-$HEALTH_TRIES}
  for _ in $(seq 1 "$tries"); do
    if curl -fsS -m 5 "$url" >/dev/null; then return 0; fi
    sleep "$HEALTH_INTERVAL"
  done
  return 1
}

# Обе проверки обязательны; провал любой даёт ненулевой код (без зависимости от set -e в &&-цепочках).
health_all() {
  health "$API_HEALTH_URL" || { echo "Health check не прошёл: api ($API_HEALTH_URL)"; return 1; }
  health "$WEB_HEALTH_URL" || { echo "Health check не прошёл: web ($WEB_HEALTH_URL)"; return 1; }
  return 0
}

# Откат образов на .release.prev. Схема БД НЕ откатывается (см. docs/runbooks/deploy.md).
rollback_release() {
  if [[ ! -f .release.prev ]]; then
    echo "Откат невозможен: нет предыдущего релиза (.release.prev) — это первый деплой."
    echo "Текущий релиз остаётся запущенным и может быть неработоспособным: остановите/почините вручную (docs/runbooks/deploy.md)."
    return 1
  fi
  local prev
  prev=$(cat .release.prev)
  echo "Откат образов на $prev"
  RELEASE=$prev "${COMPOSE[@]}" up -d --no-build api web || { echo "Откат НЕ выполнен: docker compose up завершился с ошибкой"; return 1; }
  health_all || { echo "Откат НЕ выполнен: релиз $prev не прошёл health check, нужно ручное вмешательство"; return 1; }
  mv .release.prev .release
  echo "Откат образов выполнен: $prev (схема БД откатом не менялась)"
  return 0
}

# Снимок БД перед миграцией. Любая ошибка останавливает деплой (возврат 1).
snapshot_db() {
  local dir=$PREDEPLOY_BACKUP_DIR repo_root file tmp
  repo_root=$(pwd -P)
  mkdir -p "$dir" || { echo "Не удалось создать каталог снимков"; return 1; }
  case "$(cd "$dir" && pwd -P)/" in
    "$repo_root"/*) echo "PREDEPLOY_BACKUP_DIR внутри репозитория — запрещено (снимок содержит ПДн)"; return 1 ;;
  esac
  file="$dir/twomc-${RELEASE}-$(date +%Y%m%dT%H%M%S).dump"
  tmp="$file.partial"
  echo "→ снимок БД → $file"
  # umask 077: файл доступен только владельцу. Креды берутся из окружения контейнера postgres.
  # shellcheck disable=SC2016  # $POSTGRES_* раскрываются внутри контейнера, а не на хосте
  if ! ( umask 077; "${COMPOSE[@]}" exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$tmp" ); then
    rm -f "$tmp"
    echo "Снимок БД не удался (pg_dump) — деплой остановлен, миграции не применялись"
    return 1
  fi
  if [[ ! -s "$tmp" ]]; then
    rm -f "$tmp"
    echo "Снимок БД пуст — деплой остановлен, миграции не применялись"
    return 1
  fi
  if ! "${COMPOSE[@]}" exec -T postgres pg_restore --list < "$tmp" >/dev/null; then
    rm -f "$tmp"
    echo "Снимок БД не читается (pg_restore --list) — деплой остановлен, миграции не применялись"
    return 1
  fi
  mv "$tmp" "$file"
  chmod 600 "$file"
  echo "Снимок сохранён: $file"
  # Ротация: оставить PREDEPLOY_BACKUP_KEEP последних по времени изменения.
  # shellcheck disable=SC2012
  ls -1t "$dir"/twomc-*.dump 2>/dev/null | tail -n +"$((PREDEPLOY_BACKUP_KEEP + 1))" | while IFS= read -r old; do rm -f -- "$old"; done
  return 0
}

# Оставить KEEP_RELEASES последних тегов twomc-api/twomc-web (+ текущий и .release.prev), остальные удалить.
prune_old_tags() {
  local keep=$KEEP_RELEASES repo protect tag
  if ! [[ "$keep" =~ ^[0-9]+$ ]] || (( keep < 2 )); then
    echo "KEEP_RELEASES='$keep' некорректно (нужно число не меньше 2) — очистка образов пропущена"
    return 0
  fi
  protect=" $RELEASE "
  if [[ -f .release.prev ]]; then protect+="$(cat .release.prev) "; fi
  for repo in twomc-api twomc-web; do
    # Новые теги первыми; <none> и latest не трогаем.
    docker image ls "$repo" --format '{{.CreatedAt}}|{{.Tag}}' 2>/dev/null | sort -r | cut -d'|' -f2 \
      | grep -v -e '^<none>$' -e '^latest$' | tail -n +"$((keep + 1))" | while IFS= read -r tag; do
        if [[ "$protect" == *" $tag "* ]]; then continue; fi
        docker image rm "$repo:$tag" >/dev/null 2>&1 || echo "Не удалось удалить $repo:$tag (используется?) — пропущено"
      done
  done
  return 0
}

if [[ "${1:-}" == "rollback" ]]; then
  rollback_release || exit 1
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

# Снимок ДО миграции: при провале деплой останавливается, миграции не применяются.
snapshot_db || exit 1

# Миграции должны быть обратно совместимы с предыдущим релизом (expand/contract, ADR-0158).
echo "→ миграции (prisma migrate deploy)"
"${COMPOSE[@]}" run --rm --no-deps api sh -c "cd /app/apps/api && npx prisma migrate deploy" \
  || { echo "Миграции не применены — деплой остановлен, приложения не переключались. При частично применённой схеме см. runbook (восстановление из снимка)"; exit 1; }

echo "→ переключение приложений"
if [[ -f .release ]]; then
  cp .release .release.prev
else
  rm -f .release.prev   # первый деплой: устаревший .release.prev не должен вводить в заблуждение
fi
echo "$RELEASE" > .release
"${COMPOSE[@]}" up -d api web || { echo "docker compose up завершился с ошибкой — откат"; rollback_release || echo "Автооткат не выполнен"; exit 1; }

echo "→ health check"
if health_all; then
  echo "Деплой $RELEASE успешен"
  prune_old_tags
else
  echo "Релиз $RELEASE не прошёл health check — откат образов"
  rollback_release || echo "Автооткат не выполнен — деплой $RELEASE НЕ успешен"
  exit 1
fi
