#!/usr/bin/env bash
# Генерирует env-файл стенда НА СЕРВЕРЕ. Секреты создаются openssl rand и нигде не печатаются.
# Файл: $STAND_ROOT/stand.env (права 600). Существующий файл не перезаписывается:
# смена паролей Postgres/Redis при живых томах сломает доступ (пароль БД записан в томе при первой инициализации).
#
#   STAND_DOMAIN=test-website.twomc.su ./gen-env.sh
# Перенос на другой домен: STAND_DOMAIN=twomc.su (+ выбор режима, см. docs/runbooks/test-website-stand.md).
# Окончательный файл учётных данных /home/twomc/test-website-credentials.txt этот скрипт НЕ пишет и не изменяет (правило стенда).
set -euo pipefail
umask 077

STAND_ROOT="${STAND_ROOT:-/srv/twomc-stand}"
STAND_DOMAIN="${STAND_DOMAIN:-test-website.twomc.su}"
ENV_FILE="${STAND_ROOT}/stand.env"
WEB_PORT="${WEB_PORT:-3000}"
API_PORT="${API_PORT:-4000}"
STAND_PG_PORT="${STAND_PG_PORT:-55432}"

# ЗАЩИТА ОТ ПЕРЕЗАПИСИ: существующий stand.env не трогается (флага ротации нет намеренно: пароль БД живёт в томе).
if [[ -e "$ENV_FILE" ]]; then
  echo "Файл $ENV_FILE уже существует: не перезаписываю (секреты и пароль БД сохраняются)." >&2
  exit 0
fi

command -v openssl >/dev/null || { echo "Нужен openssl" >&2; exit 1; }
[[ "$STAND_DOMAIN" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$ ]] || { echo "Недопустимый STAND_DOMAIN: $STAND_DOMAIN" >&2; exit 1; }
mkdir -p "$STAND_ROOT"
TMP_FILE="$(mktemp "$STAND_ROOT/.stand.env.XXXXXX")"
trap 'rm -f "$TMP_FILE"' EXIT
hex() { openssl rand -hex "$1"; }
pw() { openssl rand -base64 24 | tr -d '/+=\n' | cut -c1-24; }

PUBLIC_URL="https://${STAND_DOMAIN}"
# API на том же origin под /api (отдельного DNS-имени для API нет): nginx срезает префикс /api.
# Следствие: socket.io-пространства имён (/chat, /messages, /notifications) на стенде не работают (см. runbook).
PUBLIC_API_URL="${PUBLIC_URL}/api"
PG_USER="twomc_stand"
PG_DB="twomc_stand"
PG_PASS="$(hex 24)"
REDIS_PASS="$(hex 24)"

{
  echo "# Env тестового стенда. Сгенерирован gen-env.sh на сервере. Не коммитить, не печатать, не копировать."
  echo "STAND_DOMAIN=${STAND_DOMAIN}"
  echo "PUBLIC_URL=${PUBLIC_URL}"
  echo "STAND_ENV_FILE=${ENV_FILE}"
  echo "STAND_PG_PORT=${STAND_PG_PORT}"
  echo "WEB_PORT=${WEB_PORT}"
  echo "API_PORT=${API_PORT}"
  echo
  echo "# Режим: development нужен ради mock-провайдера платежей и демо-сида (в production мок запрещён кодом)."
  echo "NODE_ENV=development"
  echo "TRUST_PROXY=1"
  echo
  echo "POSTGRES_USER=${PG_USER}"
  echo "POSTGRES_PASSWORD=${PG_PASS}"
  echo "POSTGRES_DB=${PG_DB}"
  echo "DATABASE_URL=postgresql://${PG_USER}:${PG_PASS}@postgres:5432/${PG_DB}?connection_limit=15&pool_timeout=10"
  echo "REDIS_PASSWORD=${REDIS_PASS}"
  echo
  echo "JWT_ACCESS_SECRET=$(hex 32)"
  echo "JWT_REFRESH_SECRET=$(hex 32)"
  echo "TWO_FACTOR_ENCRYPTION_KEY=$(hex 32)"
  echo
  echo "# Всё, что зависит от домена, выводится из STAND_DOMAIN."
  echo "WEB_ORIGIN=${PUBLIC_URL}"
  echo "WEB_ORIGINS=${PUBLIC_URL}"
  echo "FRONTEND_URL=${PUBLIC_URL}"
  echo "NEXT_PUBLIC_API_URL=${PUBLIC_API_URL}"
  echo "CDN_BASE_URL=${PUBLIC_API_URL}/uploads"
  echo "NEXT_PUBLIC_CDN_BASE_URL=${PUBLIC_API_URL}/uploads"
  echo "# Cookie: 'localhost' = Domain не выставляется (host-only). Для twomc.su в production-режиме: .twomc.su"
  echo "COOKIE_DOMAIN=localhost"
  echo "COOKIE_SECURE=true"
  echo "COOKIE_SAMESITE=lax"
  echo
  echo "# Платежи: только мок-провайдер без ключей. Вебхук-секрет сгенерирован локально."
  echo "PAYMENT_PROVIDER=test"
  echo "PAYMENT_WEBHOOK_SECRET=$(hex 24)"
  echo "STORE_REFUNDS_ENABLED=false"
  echo "# Выдача на игровые серверы не включается: STORE_DELIVERY_ENABLED не задан, настройка сайта по умолчанию выкл."
  echo
  echo "# Turnstile: проверка выключена (разрешено только вне production); публичный тестовый site key Cloudflare (всегда проходит, не секрет)."
  echo "TURNSTILE_DISABLED=true"
  echo "NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA"
  echo
  echo "# Почта: SMTP_HOST не задан - письма только в лог API. Боевые интеграции выключены."
  echo "BRIDGE_ENABLED=false"
  echo "GIVEAWAY_ENABLED=false"
  echo "LITEBANS_ENABLED=false"
  echo "QUICK_BUY_ENABLED=false"
  echo "AUTH_TEST_OTP_ENABLED=false"
  echo
  echo "# Bootstrap-аккаунты тестовой БД (только для этого стенда). Личные данные не используются."
  echo "BOOTSTRAP_SYSTEM_PASSWORD=$(pw)"
  echo "BOOTSTRAP_OWNER_USERNAME=stand_owner"
  echo "BOOTSTRAP_OWNER_EMAIL=owner@stand.example.test"
  echo "BOOTSTRAP_OWNER_PASSWORD=$(pw)"
  echo "BOOTSTRAP_CHIEF_CURATOR_USERNAME=stand_curator"
  echo "BOOTSTRAP_CHIEF_CURATOR_LOGIN_ALIAS=standcurator"
  echo "BOOTSTRAP_CHIEF_CURATOR_EMAIL=curator@stand.example.test"
  echo "BOOTSTRAP_CHIEF_CURATOR_PASSWORD=$(pw)"
} > "$TMP_FILE"
chmod 600 "$TMP_FILE"
mv "$TMP_FILE" "$ENV_FILE"   # атомарно (mktemp рядом, тот же ФС)
echo "Создан $ENV_FILE (600). Значения секретов не выводятся."
