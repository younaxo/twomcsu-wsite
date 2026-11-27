#!/usr/bin/env bash
# Дымовая проверка стенда НА СЕРВЕРЕ: smoke.mjs запускается в одноразовом контейнере из api-образа стенда (node 20), сеть хоста (нужны loopback-порты api/web),
# от uid владельца файлов (stand.env и файл учёток имеют права 600). Секреты монтируются только для чтения и не печатаются.
# Песочница контейнера: --cap-drop ALL, no-new-privileges, --read-only (+ tmpfs /tmp), лимиты памяти/CPU/процессов, жёсткий тайм-аут; монтируются ТОЛЬКО три файла
# (smoke.mjs, stand.env, учётки). Файл учёток по умолчанию - окончательный /home/twomc/test-website-credentials.txt (docs/runbooks/test-website-stand.md, раздел 9); ACCOUNTS_FILE переопределяет.
# Обычно запускается ЛОКАЛЬНО через run-smoke.sh (скрипты едут по stdin одним SSH-сеансом); smoke.mjs ищется рядом или в SMOKE_MJS.
# Коды: 0 все пункты РАБОТАЕТ, 2 нет входного файла/релиза, иначе код smoke.mjs; 124 тайм-аут.
set -euo pipefail
STAND_ROOT="${STAND_ROOT:-/srv/twomc-stand}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="${SMOKE_MJS:-$HERE/smoke.mjs}"
ACCOUNTS="${ACCOUNTS_FILE:-$HOME/test-website-credentials.txt}"
STAND_ENV="$STAND_ROOT/stand.env"
# Без этих проверок `docker run -v <несуществующий путь>` молча создаёт КАТАЛОГ (от root) на месте файла.
for f in "$SCRIPT" "$STAND_ENV" "$ACCOUNTS"; do
  [[ -f "$f" && -r "$f" ]] || { echo "Нет обычного читаемого файла: $f" >&2; exit 2; }
done
[[ -f "$STAND_ROOT/.release" ]] || { echo "Нет $STAND_ROOT/.release" >&2; exit 2; }
SHA="$(cat "$STAND_ROOT/.release")"
[[ "$SHA" =~ ^[0-9a-f]{12,40}$ ]] || { echo "Недопустимый .release" >&2; exit 2; }
IMAGE="twomc-stand-api:${SHA:0:12}"
NAME="twomc-smoke-$$"
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
timeout --kill-after=20 "${SMOKE_TIMEOUT_SEC:-300}" docker run --rm --name "$NAME" --network host --user "$(id -u):$(id -g)" --entrypoint node \
  --cap-drop ALL --security-opt no-new-privileges --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --memory 256m --memory-swap 256m --cpus 1 --pids-limit 128 \
  -v "$SCRIPT:/s/smoke.mjs:ro" -v "$STAND_ENV:/in/stand.env:ro" -v "$ACCOUNTS:/in/accounts:ro" \
  "$IMAGE" /s/smoke.mjs
