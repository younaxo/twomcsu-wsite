#!/usr/bin/env bash
# ЛОКАЛЬНО: установка/обновление серверной части CDN на VDS одной командой (идемпотентно):
#   infrastructure/cdn/install-cdn.sh
# На сервере: проверка DNS (dig @1.1.1.1 должен вернуть IP VDS, иначе код 10 и ничего не меняется), каталоги /srv/cdn-files,
# /srv/cdn-state, /srv/backups/cdn-files, cron-бэкап, nginx-конфиг, сертификат certbot (webroot), перезагрузка nginx.
# Транспорт: один scp + один ssh под общей блокировкой lib/vds-lock.sh. Секреты не используются.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../vds-runner/lib/vds-ssh.sh
source "$HERE/../vds-runner/lib/vds-ssh.sh"
TMP="$(mktemp -d)"
trap 'vds_lock_release; rm -rf "$TMP"' EXIT
ID="$(date -u +%Y%m%dT%H%M%SZ)-$(od -An -N3 -tx1 /dev/urandom | tr -d ' \n')"
mkdir -p "$TMP/bundle"
cp -r "$HERE/server" "$TMP/bundle/ops"
tar -cf "$TMP/cdn-$ID.tar" -C "$TMP/bundle" .
( cd "$TMP" && vds_scp_put "cdn-$ID.tar" "/tmp/twomc-cdn-$ID.tar" )
vds_ssh_script "$HERE/server/remote-entry.sh" "$ID" setup
