#!/usr/bin/env bash
# ЛОКАЛЬНО: выгрузка кода на сервер без git-токена: git archive -> scp. Docker локально не нужен и не запускается.
#   infrastructure/test-website/push-release.sh [ref]     (по умолчанию origin/main после git fetch)
# Нужны: ключ SSH (STAND_SSH_KEY), доступ twomc@STAND_HOST. Секреты и .env в архив не попадают (только tracked-файлы).
set -euo pipefail
REF="${1:-origin/main}"
STAND_HOST="${STAND_HOST:-31.76.77.45}"
STAND_USER="${STAND_USER:-twomc}"
STAND_SSH_KEY="${STAND_SSH_KEY:-$HOME/.ssh/twomc_giveaway_vds}"
STAND_ROOT="${STAND_ROOT:-/srv/twomc-stand}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(git -C "$HERE" rev-parse --show-toplevel)"
SSH=(ssh -i "$STAND_SSH_KEY" -o BatchMode=yes "$STAND_USER@$STAND_HOST")
SCP=(scp -i "$STAND_SSH_KEY" -o BatchMode=yes)

git -C "$REPO" fetch origin
SHA="$(git -C "$REPO" rev-parse --short=12 "$REF")"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
git -C "$REPO" archive --format=tar.gz -o "$TMP/release.tar.gz" "$REF"

"${SSH[@]}" "sudo mkdir -p $STAND_ROOT/releases $STAND_ROOT/ops && sudo chown -R $STAND_USER:$STAND_USER $STAND_ROOT"
"${SCP[@]}" "$TMP/release.tar.gz" "$STAND_USER@$STAND_HOST:$STAND_ROOT/release-$SHA.tar.gz"
# Ops-файлы стенда берутся из рабочей копии (могут быть новее, чем $REF).
"${SCP[@]}" -r "$HERE/." "$STAND_USER@$STAND_HOST:$STAND_ROOT/ops/"
"${SSH[@]}" "set -e; d=$STAND_ROOT/releases/$SHA; rm -rf \$d.tmp; mkdir -p \$d.tmp; tar -xzf $STAND_ROOT/release-$SHA.tar.gz -C \$d.tmp; rm -rf \$d; mv \$d.tmp \$d; rm -f $STAND_ROOT/release-$SHA.tar.gz; cd $STAND_ROOT/ops && sed -i 's/\\r\$//' *.sh *.template *.conf *.yml && chmod +x *.sh"
echo "Выгружено: $SHA -> $STAND_ROOT/releases/$SHA"
echo "Дальше на сервере: $STAND_ROOT/ops/deploy-stand.sh $SHA"
