#!/usr/bin/env bash
# Роли/права/bootstrap-аккаунты и демо-данные в БД стенда НА СЕРВЕРЕ. Guard демо-сида НЕ ослабляется:
# сид выполняется в одноразовом контейнере с --network host, а Postgres стенда опубликован на 127.0.0.1,
# поэтому условия guard (NODE_ENV=development, SEED_DEMO=1, DATABASE_URL на 127.0.0.1) выполняются честно.
#   /srv/twomc-stand/ops/seed-demo.sh [sha12]     (по умолчанию содержимое .release)
# Идемпотентно. Секреты не печатаются.
# Логин тестового игрока берётся из файла учётных данных (секция [игрок], строка «login: ...») и передаётся сиду как
# DEMO_STAND_PLAYER_USERNAME через env-файл 600 (не в argv, не печатается). Нет секции/логина - не передаётся (предупреждение).
# Сам файл учётных данных /home/twomc/test-website-credentials.txt этот скрипт только читает и не изменяет (правило стенда).
set -euo pipefail
STAND_ROOT="${STAND_ROOT:-/srv/twomc-stand}"
CREDENTIALS_FILE="${CREDENTIALS_FILE:-/home/twomc/test-website-credentials.txt}"
ENV_FILE="$STAND_ROOT/stand.env"
SHA="${1:-$(cat "$STAND_ROOT/.release")}"
IMAGE="twomc-stand-tools:${SHA:0:12}"

# DATABASE_URL для хоста собирается из значений env-файла и кладётся во временный env-файл 600 (не в argv: пароль не виден
# в ps/истории процессов). Файл удаляется trap-ом.
envval() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2-; }  # env-файл не source-им: в DATABASE_URL есть '&'
cred_player_login() {  # логин из секции [игрок]; пусто, если секции/строки нет
  awk 'BEGIN{s=0} /^[[:space:]]*\[/{s=($0 ~ /^[[:space:]]*\[(и|И)грок\][[:space:]]*\r?$/)} s && /^[[:space:]]*login[[:space:]]*:/{sub(/^[^:]*:[[:space:]]*/,""); sub(/\r$/,""); sub(/[[:space:]]+$/,""); print; exit}' "$CREDENTIALS_FILE" 2>/dev/null || true
}
umask 077
TMP_ENV="$(mktemp "$STAND_ROOT/.seed-env.XXXXXX")"
TMP_PLAYER="$(mktemp "$STAND_ROOT/.seed-player.XXXXXX")"
trap 'rm -f "$TMP_ENV" "$TMP_PLAYER"' EXIT
printf 'DATABASE_URL=postgresql://%s:%s@127.0.0.1:%s/%s
'   "$(envval POSTGRES_USER)" "$(envval POSTGRES_PASSWORD)" "$(envval STAND_PG_PORT)" "$(envval POSTGRES_DB)" > "$TMP_ENV"

PLAYER_ARGS=()
PLAYER_LOGIN="$(cred_player_login)"
# Допустимы только безопасные символы (значение попадает в env-файл построчно): буквы, цифры, _ . -
if [[ "$PLAYER_LOGIN" =~ ^[A-Za-z0-9_.-]{1,64}$ ]]; then
  printf 'DEMO_STAND_PLAYER_USERNAME=%s\n' "$PLAYER_LOGIN" > "$TMP_PLAYER"
  PLAYER_ARGS=(--env-file "$TMP_PLAYER")
else
  echo "Предупреждение: в файле учётных данных нет секции [игрок] с допустимой строкой login: DEMO_STAND_PLAYER_USERNAME не передаётся." >&2
fi
unset PLAYER_LOGIN

run() {  # run <script> [доп. аргументы docker]
  local script="$1"; shift
  docker run --rm --network host --env-file "$ENV_FILE" --env-file "$TMP_ENV" ${PLAYER_ARGS[@]+"${PLAYER_ARGS[@]}"} -e NODE_ENV=development "$@" \
    -w /app/apps/api "$IMAGE" pnpm exec ts-node "$script"
}
run prisma/seed/index.ts
run prisma/seed/demo/index.ts -e SEED_DEMO=1
echo "Сид выполнен (роли, bootstrap, демо-данные)."
