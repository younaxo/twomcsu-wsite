#!/usr/bin/env bash
# Дымовая проверка стенда НА СЕРВЕРЕ: smoke.mjs запускается в одноразовом контейнере из api-образа стенда (node 20), сеть хоста,
# от uid владельца файлов (stand.env и accounts имеют права 600). Секреты монтируются только для чтения и не печатаются.
# Обычно запускается ЛОКАЛЬНО через run-smoke.sh (скрипты едут по stdin одним SSH-сеансом); smoke.mjs ищется рядом или в SMOKE_MJS.
set -euo pipefail
STAND_ROOT="${STAND_ROOT:-/srv/twomc-stand}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="${SMOKE_MJS:-$HERE/smoke.mjs}"
[[ -f "$SCRIPT" ]] || { echo "Нет $SCRIPT" >&2; exit 2; }
SHA="$(cat "$STAND_ROOT/.release")"
IMAGE="twomc-stand-api:${SHA:0:12}"
ACCOUNTS="${ACCOUNTS_FILE:-$HOME/test-website-accounts.txt}"
exec docker run --rm --network host --user "$(id -u):$(id -g)" --entrypoint node \
  -v "$SCRIPT:/s/smoke.mjs:ro" -v "$STAND_ROOT/stand.env:/in/stand.env:ro" -v "$ACCOUNTS:/in/accounts:ro" \
  "$IMAGE" /s/smoke.mjs
