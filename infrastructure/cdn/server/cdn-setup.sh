#!/usr/bin/env bash
# СЕРВЕР: идемпотентная установка CDN cdn-files.twomc.su (вызывается из remote-entry.sh с каталогом бандла).
# Шаги: проверка DNS (должен указывать на этот сервер) -> каталоги -> бэкап (cron) -> nginx (http-only) -> certbot -> полный nginx.
# Не создаёт DNS-записей. Если DNS не указывает на сервер, завершается кодом 10 ДО любых изменений nginx/certbot.
set -euo pipefail
W="${1:?bundle dir}"
CDN_DOMAIN="${CDN_DOMAIN:-cdn-files.twomc.su}"
EXPECT_IP="${CDN_EXPECT_IP:-31.76.77.45}"
CDN_ROOT=/srv/cdn-files
CDN_STATE=/srv/cdn-state
BACKUPS=/srv/backups/cdn-files
USER_NAME="$(id -un)"
[[ "$CDN_DOMAIN" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$ ]] || { echo "Недопустимый CDN_DOMAIN" >&2; exit 1; }

echo "== DNS"
RESOLVED="$(dig +short "$CDN_DOMAIN" @1.1.1.1 | tr '\n' ' ')"
echo "dig $CDN_DOMAIN @1.1.1.1 -> ${RESOLVED:-<пусто>} (ожидается $EXPECT_IP)"
if ! grep -qw -- "$EXPECT_IP" <<<"$RESOLVED"; then
  echo "БЛОКЕР: $CDN_DOMAIN не указывает на $EXPECT_IP. DNS не создаётся; создайте A-запись и повторите установку." >&2
  exit 10
fi

echo "== каталоги"
sudo install -d -o "$USER_NAME" -g "$USER_NAME" -m 755 "$CDN_ROOT" "$CDN_STATE"
sudo install -d -m 755 /srv/backups
sudo install -d -o "$USER_NAME" -g "$USER_NAME" -m 750 "$BACKUPS"
sudo install -d -m 755 /var/www/certbot
# Проверочный файл для мониторинга (публичный, безвредный).
[[ -f "$CDN_ROOT/health.txt" ]] || { printf 'ok\n' > "$CDN_ROOT/health.txt"; chmod 644 "$CDN_ROOT/health.txt"; }
# Квота (мягкая, проверяется cdn-apply.sh): общий размер каталога и размер одного файла.
if [[ ! -f /etc/cdn-files.conf ]]; then
  printf 'CDN_QUOTA_MB=2048\nCDN_MAX_FILE_MB=8\nCDN_MAX_FILES=5000\n' | sudo tee /etc/cdn-files.conf >/dev/null
  sudo chmod 644 /etc/cdn-files.conf
fi

echo "== бэкап"
sudo install -m 755 "$W/ops/cdn-files-backup.sh" /usr/local/sbin/cdn-files-backup.sh
printf '# Ежедневный бэкап CDN-каталога (ротация внутри скрипта)\n17 3 * * * %s /usr/local/sbin/cdn-files-backup.sh >>/var/log/cdn-files-backup.log 2>&1\n' "$USER_NAME" | sudo tee /etc/cron.d/cdn-files-backup >/dev/null
sudo chmod 644 /etc/cron.d/cdn-files-backup
sudo touch /var/log/cdn-files-backup.log; sudo chown "$USER_NAME" /var/log/cdn-files-backup.log

echo "== nginx + сертификат"
command -v envsubst >/dev/null || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq gettext-base >/dev/null
CONF=/etc/nginx/conf.d/cdn-files.conf
export CDN_DOMAIN
if ! sudo test -s "/etc/letsencrypt/live/${CDN_DOMAIN}/fullchain.pem"; then
  envsubst '${CDN_DOMAIN}' < "$W/ops/nginx.cdn.http-only.conf.template" | sudo tee "$CONF" >/dev/null
  sudo nginx -t
  sudo systemctl reload nginx
  sudo certbot certonly --webroot -w /var/www/certbot -d "$CDN_DOMAIN" \
    --non-interactive --agree-tos --register-unsafely-without-email
fi
envsubst '${CDN_DOMAIN}' < "$W/ops/nginx.cdn.conf.template" | sudo tee "$CONF" >/dev/null
sudo nginx -t
sudo systemctl reload nginx
sudo install -d /etc/letsencrypt/renewal-hooks/deploy
[[ -x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh ]] || {
  printf '#!/bin/sh\nsystemctl reload nginx\n' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh >/dev/null
  sudo chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
}
echo "CDN установлен: https://$CDN_DOMAIN (корень $CDN_ROOT, бэкапы $BACKUPS, конфиг $CONF)"
