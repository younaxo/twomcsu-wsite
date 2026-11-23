#!/usr/bin/env bash
# Сборка и запуск стенда НА СЕРВЕРЕ из выгруженного релиза (см. push-release.sh).
#   /srv/twomc-stand/ops/deploy-stand.sh <sha12>
# Порядок: проверки -> build (api, web, tools) -> postgres+redis -> prisma migrate deploy (ТОЛЬКО БД стенда) -> api+web -> health.
# Миграции выполняются на базе этого стенда (контейнер postgres проекта twomc-stand); production основного сайта не затрагивается.
# Откат образов: повторный запуск с предыдущим sha (его образы остаются, пока их не удалили вручную). Схема БД не откатывается.
set -euo pipefail

SHA="${1:?Укажите sha релиза (каталог в releases/)}"
STAND_ROOT="${STAND_ROOT:-/srv/twomc-stand}"
REL_DIR="$STAND_ROOT/releases/$SHA"
OPS_DIR="$STAND_ROOT/ops"
ENV_FILE="$STAND_ROOT/stand.env"
export RELEASE="${SHA:0:12}"
export STAND_ENV_FILE="$ENV_FILE"

[[ -d "$REL_DIR/infrastructure" ]] || { echo "Нет релиза $REL_DIR" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "Нет $ENV_FILE: сначала gen-env.sh" >&2; exit 1; }
[[ "$(stat -c %a "$ENV_FILE")" == "600" ]] || { echo "Права $ENV_FILE должны быть 600" >&2; exit 1; }
if grep -Eiq '^AUTH_TEST_OTP_ENABLED=("?)true' "$ENV_FILE"; then
  echo "В $ENV_FILE включён AUTH_TEST_OTP_ENABLED=true: тестовый OTP на стенде запрещён" >&2; exit 1
fi
# Один деплой одновременно (повторный запуск ждать не будет).
exec 9>"$STAND_ROOT/.deploy.lock"
flock -n 9 || { echo "Другой деплой уже выполняется (flock $STAND_ROOT/.deploy.lock)" >&2; exit 1; }

avail_mb="$(free -m | awk '/^Mem:/ {print $7}')"
disk_gb="$(df -BG --output=avail "$STAND_ROOT" | tail -1 | tr -dc '0-9')"
echo "Свободно: RAM ${avail_mb} МБ, диск ${disk_gb} ГБ"
if (( avail_mb < 3000 )) && [[ -z "$(swapon --show --noheadings)" ]]; then
  echo "Мало RAM и нет swap: добавьте swap-файл перед сборкой" >&2; exit 1
fi
(( disk_gb >= 8 )) || { echo "Мало места на диске (нужно >= 8 ГБ)" >&2; exit 1; }

# Секреты в вывод не попадают: config не печатается, только валидируется.
DC=(docker compose -p twomc-stand --env-file "$ENV_FILE" -f "$REL_DIR/infrastructure/docker-compose.prod.yml" -f "$OPS_DIR/docker-compose.stand.yml")
"${DC[@]}" config --quiet

echo "== build api, web"
"${DC[@]}" build api web
echo "== build tools (стадия build: ts-node, prisma CLI, исходники сидов)"
docker build --target build -f "$REL_DIR/infrastructure/api.Dockerfile" -t "twomc-stand-tools:$RELEASE" "$REL_DIR"

echo "== postgres, redis"
"${DC[@]}" up -d --wait postgres redis

echo "== prisma migrate deploy (БД стенда)"
docker run --rm --network twomc-stand_twomc --env-file "$ENV_FILE" -e NODE_ENV=development \
  -w /app "twomc-stand-tools:$RELEASE" pnpm --filter @twomc/api exec prisma migrate deploy

echo "== api, web"
"${DC[@]}" up -d api web

echo "== health"
api_port="$(grep -E '^API_PORT=' "$ENV_FILE" | cut -d= -f2)"; api_port="${api_port:-4000}"
web_port="$(grep -E '^WEB_PORT=' "$ENV_FILE" | cut -d= -f2)"; web_port="${web_port:-3000}"
ok=0
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://127.0.0.1:${api_port}/health" && curl -fsS -o /dev/null "http://127.0.0.1:${web_port}/"; then ok=1; break; fi
  sleep 4
done
if (( ok != 1 )); then
  echo "Health check не пройден. Логи: docker logs --tail=100 twomc-stand-api / twomc-stand-web" >&2
  exit 1
fi
echo "$SHA" > "$STAND_ROOT/.release.tmp"
[[ -f "$STAND_ROOT/.release" ]] && cp "$STAND_ROOT/.release" "$STAND_ROOT/.release.prev"
mv "$STAND_ROOT/.release.tmp" "$STAND_ROOT/.release"
echo "Стенд обновлён: релиз $SHA"
