#!/usr/bin/env bash
# Ежедневный бэкап /srv/cdn-files -> /srv/backups/cdn-files/cdn-files-YYYYMMDD.tar.gz. Ротация: хранится CDN_BACKUP_KEEP (14) свежих.
# Устанавливается в /usr/local/sbin, запускается cron (/etc/cron.d/cdn-files-backup) от пользователя twomc.
set -euo pipefail
SRC=/srv/cdn-files
DST=/srv/backups/cdn-files
KEEP="${CDN_BACKUP_KEEP:-14}"
umask 027
mkdir -p "$DST"
avail_mb="$(df -Pm "$DST" | awk 'NR==2{print $4}')"
(( avail_mb > 5120 )) || { echo "$(date -u +%FT%TZ) мало места (${avail_mb} МБ), бэкап пропущен" >&2; exit 1; }
out="$DST/cdn-files-$(date -u +%Y%m%d).tar.gz"
tmp="$out.tmp.$$"
tar -czf "$tmp" -C "$SRC" .
mv -f "$tmp" "$out"
# Проверка читаемости архива и ротация.
tar -tzf "$out" >/dev/null
ls -1t "$DST"/cdn-files-*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f --
echo "$(date -u +%FT%TZ) бэкап $out ($(du -h "$out" | cut -f1)), в каталоге: $(ls -1 "$DST"/cdn-files-*.tar.gz | wc -l)"
