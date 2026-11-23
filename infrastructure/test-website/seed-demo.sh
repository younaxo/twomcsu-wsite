#!/usr/bin/env bash
# Роли/права/bootstrap-аккаунты и демо-данные в БД стенда НА СЕРВЕРЕ. Guard демо-сида НЕ ослабляется:
# сид выполняется в одноразовом контейнере с --network host, а Postgres стенда опубликован на 127.0.0.1,
# поэтому условия guard (NODE_ENV=development, SEED_DEMO=1, DATABASE_URL на 127.0.0.1) выполняются честно.
#   /srv/twomc-stand/ops/seed-demo.sh [sha12]     (по умолчанию содержимое .release)
# Идемпотентно. Секреты не печатаются.
set -euo pipefail
STAND_ROOT="${STAND_ROOT:-/srv/twomc-stand}"
ENV_FILE="$STAND_ROOT/stand.env"
SHA="${1:-$(cat "$STAND_ROOT/.release")}"
IMAGE="twomc-stand-tools:${SHA:0:12}"

# DATABASE_URL для хоста собирается из значений env-файла (без печати).
envval() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2-; }  # env-файл не source-им: в DATABASE_URL есть '&'
LOCAL_DB_URL="postgresql://$(envval POSTGRES_USER):$(envval POSTGRES_PASSWORD)@127.0.0.1:$(envval STAND_PG_PORT)/$(envval POSTGRES_DB)"

run() {
  docker run --rm --network host --env-file "$ENV_FILE" \
    -e DATABASE_URL="$LOCAL_DB_URL" -e NODE_ENV=development "$@" \
    -w /app/apps/api "$IMAGE" pnpm exec ts-node "$SCRIPT"
}
SCRIPT=prisma/seed/index.ts run
SCRIPT=prisma/seed/demo/index.ts run -e SEED_DEMO=1
echo "Сид выполнен (роли, bootstrap, демо-данные)."
