#!/usr/bin/env bash
# Настройка nginx + TLS + формы входа (gate) стенда НА СЕРВЕРЕ (запускать от пользователя с sudo и доступом к docker).
#   STAND_DOMAIN=test-website.twomc.su ./setup-nginx.sh [--rotate-pass]
# Идемпотентен. Схема: nginx auth_request -> контейнер twomc-stand-gate (stand-gate.mjs, node:20-alpine, только 127.0.0.1:$GATE_PORT).
# Файлы на сервере (все 600, вне репозитория):
#   $STAND_ROOT/gate.key        ключ HMAC подписи cookie (создаётся один раз; смена = все сессии сброшены)
#   $STAND_ROOT/gate.pass.hash  scrypt-хеш пароля формы (создаётся при отсутствии или с --rotate-pass)
#   $STAND_ROOT/gate.token      сервисный токен для заголовка X-Stand-Gate (раннер, мониторинг)
# Пароль формы = пароль секции [basic auth] файла $CREDENTIALS_FILE (/home/twomc/test-website-credentials.txt).
# Если секции или пароля нет, скрипт генерирует пароль и ДОПИСЫВАЕТ секцию [basic auth] в конец этого файла (существующее не меняется);
# пароль никуда больше не пишется и не печатается. Смена пароля: правка пароля в файле + `setup-nginx.sh --rotate-pass`.
# Прежний /etc/nginx/stand.htpasswd НЕ удаляется и не используется (откат: runbook, раздел «Форма входа»).
set -euo pipefail
umask 077

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAND_ROOT="${STAND_ROOT:-/srv/twomc-stand}"
STAND_DOMAIN="${STAND_DOMAIN:-test-website.twomc.su}"
WEB_PORT="${WEB_PORT:-3000}"
API_PORT="${API_PORT:-4000}"
GATE_PORT="${GATE_PORT:-4100}"
GATE_IMAGE="${GATE_IMAGE:-node:20-alpine}"
GATE_NAME=twomc-stand-gate
CREDENTIALS_FILE="${CREDENTIALS_FILE:-/home/twomc/test-website-credentials.txt}"
ROTATE_PASS=0
for a in "$@"; do case "$a" in --rotate-pass) ROTATE_PASS=1 ;; *) echo "Неизвестный аргумент: $a" >&2; exit 2 ;; esac; done
[[ "$STAND_DOMAIN" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$ ]] || { echo "Недопустимый STAND_DOMAIN: $STAND_DOMAIN" >&2; exit 1; }
[[ "$GATE_PORT" =~ ^[0-9]{2,5}$ ]] || { echo "Недопустимый GATE_PORT" >&2; exit 1; }
[[ "$GATE_IMAGE" =~ ^[a-z0-9./:_-]+$ ]] || { echo "Недопустимый GATE_IMAGE" >&2; exit 1; }
CONF=/etc/nginx/conf.d/stand.conf
GATE_JS="$HERE/stand-gate.mjs"
[[ -f "$GATE_JS" ]] || { echo "Нет $GATE_JS" >&2; exit 1; }

command -v envsubst >/dev/null || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq gettext-base >/dev/null
sudo mkdir -p "$STAND_ROOT" /var/www/certbot
sudo chown "$(id -un):$(id -gn)" "$STAND_ROOT"

# 1. Ключ подписи cookie и сервисный токен (создаются один раз).
[[ -s "$STAND_ROOT/gate.key" ]] || { openssl rand -hex 32 > "$STAND_ROOT/gate.key"; chmod 600 "$STAND_ROOT/gate.key"; }
[[ -s "$STAND_ROOT/gate.token" ]] || { openssl rand -hex 24 > "$STAND_ROOT/gate.token"; chmod 600 "$STAND_ROOT/gate.token"; }

# 2. Хеш пароля формы. Пароль берётся из файла учётных данных; нигде не печатается.
cred_pass() { # значение password из секции [basic auth] (пусто, если нет)
  [[ -f "$CREDENTIALS_FILE" ]] || return 0
  awk 'BEGIN{s=0} /^[[:space:]]*\[/{s=(tolower($0) ~ /^[[:space:]]*\[basic auth\][[:space:]]*\r?$/)} s && /^[[:space:]]*password[[:space:]]*:/{sub(/^[^:]*:[[:space:]]*/,""); sub(/\r$/,""); print; exit}' "$CREDENTIALS_FILE"
}
if [[ ! -s "$STAND_ROOT/gate.pass.hash" || "$ROTATE_PASS" == 1 ]]; then
  PASS="$(cred_pass)"
  if [[ -z "$PASS" ]]; then
    PASS="$(openssl rand -base64 24 | tr -d '/+=\n' | cut -c1-24)"
    # Дописывается только новая секция; существующие строки файла не меняются. Права 600 (umask 077).
    printf '\n[basic auth]\nlogin: stand\npassword: %s\n' "$PASS" >> "$CREDENTIALS_FILE"
    chmod 600 "$CREDENTIALS_FILE"
    echo "Пароль входа сгенерирован и дописан в $CREDENTIALS_FILE (секция [basic auth]); на экран не выводится."
  fi
  TMP_HASH="$(mktemp "$STAND_ROOT/.gate.pass.hash.XXXXXX")"
  if printf '%s\n' "$PASS" | docker run --rm -i --user "$(id -u):$(id -g)" --cap-drop ALL --security-opt no-new-privileges \
      -v "$GATE_JS:/g/stand-gate.mjs:ro" "$GATE_IMAGE" node /g/stand-gate.mjs hash > "$TMP_HASH"; then
    chmod 600 "$TMP_HASH"
    [[ -s "$TMP_HASH" ]] || { rm -f "$TMP_HASH"; echo "Пустой хеш пароля" >&2; exit 1; }
    mv "$TMP_HASH" "$STAND_ROOT/gate.pass.hash"
  else
    rm -f "$TMP_HASH"; echo "Не удалось вычислить хеш пароля" >&2; exit 1
  fi
  unset PASS
fi

# 3. Gate-контейнер: пересоздаётся при каждом запуске (подхватывает новый код и ключ). Только loopback, read-only, без capabilities.
#    Вне compose-проекта релизов: переживает деплой api/web. После перезагрузки docker поднимается сам (unless-stopped).
docker rm -f "$GATE_NAME" >/dev/null 2>&1 || true
docker run -d --name "$GATE_NAME" --restart unless-stopped --user "$(id -u):$(id -g)" \
  --read-only --cap-drop ALL --security-opt no-new-privileges --memory 96m --pids-limit 64 \
  -p "127.0.0.1:${GATE_PORT}:${GATE_PORT}" \
  -e "GATE_PORT=${GATE_PORT}" -e GATE_HOST=0.0.0.0 \
  -e GATE_KEY_FILE=/run/gate/gate.key -e GATE_PASS_HASH_FILE=/run/gate/gate.pass.hash -e GATE_TOKEN_FILE=/run/gate/gate.token \
  -v "$GATE_JS:/g/stand-gate.mjs:ro" \
  -v "$STAND_ROOT/gate.key:/run/gate/gate.key:ro" \
  -v "$STAND_ROOT/gate.pass.hash:/run/gate/gate.pass.hash:ro" \
  -v "$STAND_ROOT/gate.token:/run/gate/gate.token:ro" \
  "$GATE_IMAGE" node /g/stand-gate.mjs >/dev/null
ok=0
for _ in $(seq 1 20); do
  [[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${GATE_PORT}/__stand/login" || true)" == 200 ]] && { ok=1; break; }
  sleep 1
done
if (( ok != 1 )); then echo "Gate не поднялся (docker logs $GATE_NAME); nginx не менялся." >&2; exit 1; fi

export STAND_DOMAIN WEB_PORT API_PORT GATE_PORT
VARS='${STAND_DOMAIN} ${WEB_PORT} ${API_PORT} ${GATE_PORT}'

# 4. Закрытый default_server; дистрибутивный сайт по умолчанию отключается (симлинк, файл остаётся).
sudo install -m 644 "$HERE/nginx.default.conf" /etc/nginx/conf.d/00-default-reject.conf
sudo rm -f /etc/nginx/sites-enabled/default

# 5. Сертификат (webroot). Без e-mail: адрес владельца не передаётся внешнему сервису.
if ! sudo test -s "/etc/letsencrypt/live/${STAND_DOMAIN}/fullchain.pem"; then
  envsubst '${STAND_DOMAIN}' < "$HERE/nginx.stand.http-only.conf.template" | sudo tee "$CONF" >/dev/null
  sudo nginx -t
  sudo systemctl reload nginx
  sudo certbot certonly --webroot -w /var/www/certbot -d "$STAND_DOMAIN" \
    --non-interactive --agree-tos --register-unsafely-without-email
fi

# 6. Полная конфигурация. Предыдущая сохраняется как stand.conf.bak.<время> (не *.conf: nginx её не подключает);
#    при провале nginx -t восстанавливается автоматически.
TS="$(date -u +%Y%m%dT%H%M%SZ)"
if sudo test -f "$CONF"; then sudo cp -p "$CONF" "$CONF.bak.$TS"; fi
envsubst "$VARS" < "$HERE/nginx.stand.conf.template" | sudo tee "$CONF" >/dev/null
sudo chmod 640 "$CONF"
if ! sudo nginx -t; then
  if sudo test -f "$CONF.bak.$TS"; then sudo cp -p "$CONF.bak.$TS" "$CONF"; echo "nginx -t не прошёл: восстановлена предыдущая конфигурация." >&2; fi
  exit 1
fi
sudo systemctl reload nginx

# 7. Перезагрузка nginx после продления сертификата + jail fail2ban (прежний, для журнала nginx).
sudo install -d /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\nsystemctl reload nginx\n' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh >/dev/null
sudo chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
printf '[nginx-http-auth]\nenabled = true\nmaxretry = 8\nfindtime = 10m\nbantime = 10m\n' | sudo tee /etc/fail2ban/jail.d/nginx-http-auth.local >/dev/null
sudo systemctl restart fail2ban
echo "nginx настроен для ${STAND_DOMAIN}: форма входа /__stand/login, gate на 127.0.0.1:${GATE_PORT}. Пароль: ${CREDENTIALS_FILE} (секция [basic auth], не печатается)."
