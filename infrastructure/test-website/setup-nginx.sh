#!/usr/bin/env bash
# Настройка nginx + TLS + basic auth стенда НА СЕРВЕРЕ (запускать от пользователя с sudo).
#   STAND_DOMAIN=test-website.twomc.su ./setup-nginx.sh [--rotate]
# Идемпотентен: существующие файлы учётных данных и htpasswd не перезаписываются (только --rotate, с резервной копией).
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
CREDENTIALS_FILE="/home/twomc/test-website-credentials.txt"   # окончательный файл: скрипты его не пишут
ROTATE=0
for a in "$@"; do case "$a" in --rotate) ROTATE=1 ;; *) echo "Неизвестный аргумент: $a" >&2; exit 2 ;; esac; done
[[ "$STAND_DOMAIN" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$ ]] || { echo "Недопустимый STAND_DOMAIN: $STAND_DOMAIN" >&2; exit 1; }
CONF=/etc/nginx/conf.d/stand.conf

command -v envsubst >/dev/null || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq gettext-base >/dev/null
sudo mkdir -p "$STAND_ROOT" /var/www/certbot
sudo chown "$(id -un):$(id -gn)" "$STAND_ROOT"

# 1. basic auth: пароль только в файле владельца и в htpasswd (bcrypt).
# ЗАЩИТА ОТ ПЕРЕЗАПИСИ: генерация только при первом запуске (нет ни $BASIC_FILE, ни htpasswd).
# Если существует хотя бы один из них, ничего не пишется. Смена пароля только явным флагом --rotate:
# старые файлы переименовываются в *.bak.<время> (не удаляются), затем создаются новые.
# Окончательный файл учётных данных $CREDENTIALS_FILE скрипты НЕ пишут никогда.
HTPASSWD=/etc/nginx/stand.htpasswd
case "$(readlink -m "$BASIC_FILE")" in
  "$(readlink -m "$CREDENTIALS_FILE")") echo "BASIC_FILE не может указывать на $CREDENTIALS_FILE: окончательный файл скрипты не пишут" >&2; exit 1 ;;
esac
if [[ "$ROTATE" == 1 ]]; then
  TS="$(date -u +%Y%m%dT%H%M%SZ)"
  [[ ! -e "$BASIC_FILE" ]] || mv "$BASIC_FILE" "$BASIC_FILE.bak.$TS"
  ! sudo test -e "$HTPASSWD" || sudo mv "$HTPASSWD" "$HTPASSWD.bak.$TS"
  echo "Ротация basic auth: прежние файлы сохранены как *.bak.$TS; обновите $CREDENTIALS_FILE вручную."
fi
if [[ ! -e "$BASIC_FILE" ]] && ! sudo test -e "$HTPASSWD"; then
  PASS="$(openssl rand -base64 24 | tr -d '/+=\n' | cut -c1-24)"
  ( umask 077; set -C; printf '%s:%s\n' "$BASIC_USER" "$PASS" > "$BASIC_FILE" )   # set -C: не перезаписывать существующий
  printf '%s\n' "$PASS" | sudo htpasswd -B -c -i "$HTPASSWD" "$BASIC_USER" >/dev/null
  unset PASS
  sudo chown root:www-data "$HTPASSWD"
  sudo chmod 640 "$HTPASSWD"
fi
sudo test -f "$HTPASSWD" || { echo "Нет $HTPASSWD (файл $BASIC_FILE существует): восстановите htpasswd или запустите с --rotate" >&2; exit 1; }

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
