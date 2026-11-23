#!/usr/bin/env bash
# ЛОКАЛЬНО: выгрузка кода на сервер без git-токена: git archive -> ОДИН SSH-сеанс (tar по stdin). Docker локально не нужен.
#   infrastructure/test-website/push-release.sh [ref]     (по умолчанию origin/main после git fetch)
# Нужны: ключ SSH (STAND_SSH_KEY), доступ twomc@STAND_HOST. Секреты и .env в архив не попадают (только tracked-файлы).
# Переменная STAND_ACTIONS (используется release.sh): список шагов на сервере через запятую из deploy,seed,verify.
# Пустая = только выгрузка (поведение по умолчанию).
set -euo pipefail
REF="${1:-origin/main}"
STAND_HOST="${STAND_HOST:-31.76.77.45}"
STAND_USER="${STAND_USER:-twomc}"
STAND_SSH_KEY="${STAND_SSH_KEY:-$HOME/.ssh/twomc_giveaway_vds}"
STAND_ROOT="${STAND_ROOT:-/srv/twomc-stand}"
STAND_ACTIONS="${STAND_ACTIONS:-}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(git -C "$HERE" rev-parse --show-toplevel)"
# Общая локальная блокировка SSH к VDS: один процесс за раз (fail2ban). Выкладка долгая, поэтому «просрочка» блокировки увеличена.
VDS_LOCK_STALE_SEC="${VDS_LOCK_STALE_SEC:-3600}"
# shellcheck source=../vds-runner/lib/vds-lock.sh
source "$HERE/../vds-runner/lib/vds-lock.sh"
trap 'vds_lock_release; rm -rf "${TMP:-}"' EXIT

# Валидация входов: они попадают в удалённую команду.
[[ "$STAND_ROOT" =~ ^/srv/twomc-stand[A-Za-z0-9._-]*$ ]] || { echo "STAND_ROOT должен быть /srv/twomc-stand*: $STAND_ROOT" >&2; exit 1; }
[[ "$STAND_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || { echo "Недопустимый STAND_USER" >&2; exit 1; }
[[ "$STAND_HOST" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "Недопустимый STAND_HOST" >&2; exit 1; }
[[ "$STAND_ACTIONS" =~ ^(deploy|seed|verify)?(,(deploy|seed|verify))*$ ]] || { echo "Недопустимый STAND_ACTIONS" >&2; exit 1; }

SSH=(ssh -i "$STAND_SSH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=20 -o ServerAliveInterval=30 -o ServerAliveCountMax=20 "$STAND_USER@$STAND_HOST")

git -C "$REPO" fetch origin
SHA="$(git -C "$REPO" rev-parse --short=12 "$REF")"
[[ "$SHA" =~ ^[0-9a-f]{12}$ ]] || { echo "Не удалось получить sha для $REF" >&2; exit 1; }
TMP="$(mktemp -d)"
mkdir -p "$TMP/bundle/ops"
git -C "$REPO" archive --format=tar.gz -o "$TMP/bundle/release.tar.gz" "$REF"
# Ops-файлы стенда берутся из рабочей копии (могут быть новее, чем $REF); только известные типы файлов.
( cd "$HERE" && cp -- *.sh *.template *.conf *.yml "$TMP/bundle/ops/" )
tar -cf "$TMP/bundle.tar" -C "$TMP/bundle" .

echo "Релиз $SHA (ref $REF), шаги на сервере: ${STAND_ACTIONS:-только выгрузка}. Один SSH-сеанс."
# Удалённая сторона: set -eu, распаковка во временный каталог, дальше remote-install.sh из бандла.
vds_locked "${SSH[@]}" "set -eu; t=\$(mktemp -d); trap 'rm -rf \"\$t\"' EXIT; tar -x -C \"\$t\"; STAND_ROOT='$STAND_ROOT' bash \"\$t/ops/remote-install.sh\" \"\$t\" '$SHA' '$STAND_ACTIONS'" < "$TMP/bundle.tar"
