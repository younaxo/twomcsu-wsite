#!/usr/bin/env bash
# Роли/права/bootstrap-аккаунты и демо-данные в БД стенда НА СЕРВЕРЕ. Guard демо-сида НЕ ослабляется:
# сид выполняется в одноразовом контейнере с --network host, а Postgres стенда опубликован на 127.0.0.1,
# поэтому условия guard (NODE_ENV=development, SEED_DEMO=1, DATABASE_URL на 127.0.0.1) выполняются честно.
#   /srv/twomc-stand/ops/seed-demo.sh [sha12]     (по умолчанию содержимое .release)
# Идемпотентно. Секреты не печатаются.
# Окончательный файл учётных данных /home/twomc/test-website-credentials.txt этот скрипт НЕ пишет и не изменяет (правило стенда).
set -euo pipefail
STAND_ROOT="${STAND_ROOT:-/srv/twomc-stand}"
ENV_FILE="$STAND_ROOT/stand.env"
SHA="${1:-$(cat "$STAND_ROOT/.release")}"
IMAGE="twomc-stand-tools:${SHA:0:12}"

# DATABASE_URL для хоста собирается из значений env-файла и кладётся во временный env-файл 600 (не в argv: пароль не виден
# в ps/истории процессов). Файл удаляется trap-ом.
envval() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2-; }  # env-файл не source-им: в DATABASE_URL есть '&'
umask 077
TMP_ENV="$(mktemp "$STAND_ROOT/.seed-env.XXXXXX")"
trap 'rm -f "$TMP_ENV"' EXIT
printf 'DATABASE_URL=postgresql://%s:%s@127.0.0.1:%s/%s
'   "$(envval POSTGRES_USER)" "$(envval POSTGRES_PASSWORD)" "$(envval STAND_PG_PORT)" "$(envval POSTGRES_DB)" > "$TMP_ENV"

run() {  # run <script> [доп. аргументы docker]
  local script="$1"; shift
  docker run --rm --network host --env-file "$ENV_FILE" --env-file "$TMP_ENV"     -e NODE_ENV=development "$@"     -w /app/apps/api "$IMAGE" pnpm exec ts-node "$script"
}
run prisma/seed/index.ts
run prisma/seed/demo/index.ts -e SEED_DEMO=1
echo "Сид выполнен (роли, bootstrap, демо-данные)."
