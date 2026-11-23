#!/usr/bin/env bash
# Настройка nginx + TLS + basic auth стенда НА СЕРВЕРЕ (запускать от пользователя с sudo).
#   STAND_DOMAIN=test-website.twomc.su ./setup-nginx.sh
# Идемпотентен. Пароль basic auth и токен пропуска генерируются здесь и не печатаются:
#   $HOME/test-website-basic-auth.txt  (user:password, 600)     /etc/nginx/stand.htpasswd
#   $STAND_ROOT/gate.token (600)
set -euo pipefail
umask 077

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAND_ROOT="${STAND_ROOT:-/srv/twomc-stand}"
STAND_DOMAIN="${STAND_DOMAIN:-test-website.twomc.su}"
WEB_PORT="${WEB_PORT:-3000}"
API_PORT="${API_PORT:-4000}"
BASIC_USER="${BASIC_USER:-stand}"
BASIC_FILE="${BASIC_FILE:-$HOME/test-website-basic-auth.txt}"
[[ "$STAND_DOMAIN" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$ ]] || { echo "Недопустимый STAND_DOMAIN: $STAND_DOMAIN" >&2; exit 1; }
CONF=/etc/nginx/conf.d/stand.conf

command -v envsubst >/dev/null || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq gettext-base >/dev/null
sudo mkdir -p "$STAND_ROOT" /var/www/certbot
sudo chown "$(id -un):$(id -gn)" "$STAND_ROOT"

# 1. basic auth: пароль только в файле владельца и в htpasswd (bcrypt).
if [[ ! -f "$BASIC_FILE" ]]; then
  PASS="$(openssl rand -base64 24 | tr -d '/+=\n' | cut -c1-24)"
  printf '%s:%s\n' "$BASIC_USER" "$PASS" > "$BASIC_FILE"
  chmod 600 "$BASIC_FILE"
  printf '%s\n' "$PASS" | sudo htpasswd -B -c -i /etc/nginx/stand.htpasswd "$BASIC_USER" >/dev/null
  unset PASS
  sudo chown root:www-data /etc/nginx/stand.htpasswd
  sudo chmod 640 /etc/nginx/stand.htpasswd
fi
[[ -f /etc/nginx/stand.htpasswd ]] || { echo "Нет /etc/nginx/stand.htpasswd при существующем $BASIC_FILE" >&2; exit 1; }

# 2. Токен cookie-пропуска.
[[ -s "$STAND_ROOT/gate.token" ]] || { openssl rand -hex 24 > "$STAND_ROOT/gate.token"; chmod 600 "$STAND_ROOT/gate.token"; }
STAND_GATE_TOKEN="$(cat "$STAND_ROOT/gate.token")"
export STAND_DOMAIN STAND_GATE_TOKEN WEB_PORT API_PORT
VARS='${STAND_DOMAIN} ${STAND_GATE_TOKEN} ${WEB_PORT} ${API_PORT}'

# 3. Закрытый default_server; дистрибутивный сайт по умолчанию отключается (симлинк, файл остаётся).
sudo install -m 644 "$HERE/nginx.default.conf" /etc/nginx/conf.d/00-default-reject.conf
sudo rm -f /etc/nginx/sites-enabled/default

# 4. Сертификат (webroot). Без e-mail: адрес владельца не передаётся внешнему сервису.
if ! sudo test -s "/etc/letsencrypt/live/${STAND_DOMAIN}/fullchain.pem"; then
  envsubst '${STAND_DOMAIN}' < "$HERE/nginx.stand.http-only.conf.template" | sudo tee "$CONF" >/dev/null
  sudo nginx -t
  sudo systemctl reload nginx
  sudo certbot certonly --webroot -w /var/www/certbot -d "$STAND_DOMAIN" \
    --non-interactive --agree-tos --register-unsafely-without-email
fi

# 5. Полная конфигурация. Файл содержит токен пропуска: 640.
envsubst "$VARS" < "$HERE/nginx.stand.conf.template" | sudo tee "$CONF" >/dev/null
sudo chmod 640 "$CONF"
sudo nginx -t
sudo systemctl reload nginx

# 6. Перезагрузка nginx после продления сертификата + jail против подбора basic auth.
sudo install -d /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\nsystemctl reload nginx\n' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh >/dev/null
sudo chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
printf '[nginx-http-auth]\nenabled = true\nmaxretry = 8\nfindtime = 10m\nbantime = 10m\n' | sudo tee /etc/fail2ban/jail.d/nginx-http-auth.local >/dev/null
sudo systemctl restart fail2ban
echo "nginx настроен для ${STAND_DOMAIN}. Учётные данные basic auth: ${BASIC_FILE} (не печатаются)."
