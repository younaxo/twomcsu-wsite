#!/usr/bin/env bash
# Визуальная проверка стенда НА СЕРВЕРЕ: visual-check.mjs в одноразовом контейнере Playwright (headless Chromium).
# Обычно запускается ЛОКАЛЬНО через run-visual.sh (скрипты едут по stdin одним SSH-сеансом под блокировкой VDS).
# Песочница: --cap-drop ALL, no-new-privileges, --read-only (+ tmpfs /tmp), лимиты памяти/CPU/процессов, жёсткий тайм-аут;
# монтируются: visual-check.mjs и файл учёток (:ro) и каталог результатов (rw). Секреты не печатаются.
# Переменные: STAND_ROOT, ACCOUNTS_FILE, OUT_DIR (по умолчанию /srv/twomc-stand/qa/visual-<дата>), WIDTHS, BASE_URL,
# PW_VERSION (образ mcr.microsoft.com/playwright:v<версия>-jammy должен быть на сервере или доступен для pull), VISUAL_TIMEOUT_SEC.
# Коды: 0 выполнено, 2 нет входного файла, 124 тайм-аут, иначе код visual-check.mjs.
set -euo pipefail
STAND_ROOT="${STAND_ROOT:-/srv/twomc-stand}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="${VISUAL_MJS:-$HERE/visual-check.mjs}"
ACCOUNTS="${ACCOUNTS_FILE:-$HOME/test-website-credentials.txt}"
OUT_DIR="${OUT_DIR:-$STAND_ROOT/qa/visual-$(date +%F)}"
PW_VERSION="${PW_VERSION:-1.49.1}"
[[ "$PW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Недопустимый PW_VERSION" >&2; exit 2; }
[[ "$OUT_DIR" =~ ^/srv/twomc-stand[A-Za-z0-9._/-]*$ && "$OUT_DIR" != *..* ]] || { echo "OUT_DIR только под /srv/twomc-stand" >&2; exit 2; }
for f in "$SCRIPT" "$ACCOUNTS"; do
  [[ -f "$f" && -r "$f" ]] || { echo "Нет обычного читаемого файла: $f" >&2; exit 2; }
done
mkdir -p "$OUT_DIR"
IMAGE="mcr.microsoft.com/playwright:v${PW_VERSION}-jammy"
docker image inspect "$IMAGE" >/dev/null 2>&1 || docker pull -q "$IMAGE" >/dev/null
NAME="twomc-visual-$$"
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
timeout --kill-after=20 "${VISUAL_TIMEOUT_SEC:-1500}" docker run --rm --name "$NAME" --network host --user "$(id -u):$(id -g)" \
  --cap-drop ALL --security-opt no-new-privileges --read-only --tmpfs /tmp:rw,nosuid,size=768m --shm-size 1g \
  --memory 3g --memory-swap 3g --cpus 2 --pids-limit 512 \
  -e HOME=/tmp -e PW_DIR=/tmp/pw -e OUT_DIR=/out -e "WIDTHS=${WIDTHS:-360,390,1280}" -e "BASE_URL=${BASE_URL:-https://test-website.twomc.su}" \
  -v "$SCRIPT:/s/visual-check.mjs:ro" -v "$ACCOUNTS:/in/accounts:ro" -v "$OUT_DIR:/out" \
  --entrypoint bash "$IMAGE" -c "set -e; npm i --silent --no-audit --no-fund --prefix /tmp/pw playwright-core@${PW_VERSION} >/dev/null; node /s/visual-check.mjs"
