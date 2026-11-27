#!/usr/bin/env bash
# Регистрация dev-srv на сайте стенда и выдача ключа плагина. Запускается НА VDS: run-on-vds.sh script register-dev-srv.sh --dry-run|--yes.
#   --dry-run  только проверки (без БД, без docker): стенд, NODE_ENV, мастер-секрет, наличие secret.env; ничего не меняет
#   --yes      регистрация (bridge:register, идемпотентно: уже есть - не создаётся) и запись ключа в secret.env
# Условия отказа: NODE_ENV стенда не development; BRIDGE_MASTER_SECRET в stand.env не задан (сначала stand-bridge-secret.sh).
# Ключ: bridge:print-key выводит его в stdout контейнера; здесь stdout уходит ТОЛЬКО в файл 600 во временном каталоге, оттуда значение
# попадает ТОЛЬКО в /home/twomc/bridge-dev-srv.secret.env (600, формат KEY_ID=, KEY=, SITE_URL=). В вывод и логи ключ не попадает.
# Идемпотентность: secret.env с тем же KEY_ID и корректным KEY уже есть - не перезаписывается. Файл НИКОГДА не удаляется скриптом;
# ротация ключа - отдельное решение владельца (раздел 2.4 docs/stage-03/BRIDGE-CONTRACT.md).
# Окружение: BRIDGE_SERVER_SLUG (dev-srv), BRIDGE_KEY_GEN (1), BRIDGE_SITE_URL (https://test-website.twomc.su), BRIDGE_SECRET_ENV.
# Коды: 0 готово, 1 отказ/ошибка, 2 аргументы, 5 lock занят.
set -uo pipefail
if ! declare -F stand_init >/dev/null 2>&1; then source "$(dirname "${BASH_SOURCE[0]}")/stand-lib.sh"; fi
trap stand_cleanup EXIT

SLUG="${BRIDGE_SERVER_SLUG:-dev-srv}"
GEN="${BRIDGE_KEY_GEN:-1}"
SITE_URL="${BRIDGE_SITE_URL:-https://test-website.twomc.su}"
SECRET_ENV="${BRIDGE_SECRET_ENV:-/home/twomc/bridge-dev-srv.secret.env}"
CAPS="player-events,inventory-sync"
MODE=""
for a in "$@"; do
  case "$a" in --dry-run) MODE=dry ;; --yes) MODE=yes ;; *) echo "Неизвестный аргумент: $a (допустимо --dry-run | --yes)" >&2; exit 2 ;; esac
done
[[ -n "$MODE" ]] || { echo "Укажите --dry-run или --yes. Без флагов ничего не выполняется."; exit 2; }
[[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]{1,31}$ ]] || { echo "BRIDGE_SERVER_SLUG: неверный формат" >&2; exit 2; }
[[ "$GEN" =~ ^[1-9][0-9]{0,5}$ ]] || { echo "BRIDGE_KEY_GEN: целое от 1" >&2; exit 2; }
[[ "$SITE_URL" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]] || { echo "BRIDGE_SITE_URL: https://хост без пути" >&2; exit 2; }
KEY_ID="$SLUG.$GEN"

stand_init || exit 1
echo "режим: $MODE; сервер: $SLUG, поколение ключа: $GEN"

NODE_ENV_STAND="$(stand_env_get NODE_ENV)"
if [[ "$NODE_ENV_STAND" != development ]]; then
  echo "ОТКАЗ: NODE_ENV стенда не development (значение не печатается); регистрация только на стенде в режиме development."; exit 1
fi
echo "NODE_ENV стенда: development"
if ! [[ "$(stand_env_get BRIDGE_MASTER_SECRET)" =~ ^.{32,}$ ]]; then
  echo "ОТКАЗ: BRIDGE_MASTER_SECRET в stand.env не задан или короче 32 байт (сначала stand-bridge-secret.sh; значение не печатается)."; exit 1
fi
echo "BRIDGE_MASTER_SECRET: задан (значение не печатается)"

# secret.env: уже готов?
HAVE_KEY=0
if [[ -f "$SECRET_ENV" ]]; then
  if grep -qxF "KEY_ID=$KEY_ID" "$SECRET_ENV" && grep -qE '^KEY=[0-9a-f]{64}$' "$SECRET_ENV" && grep -qE '^SITE_URL=https://' "$SECRET_ENV"; then
    HAVE_KEY=1; echo "secret.env уже есть (KEY_ID=$KEY_ID, формат верен; значение ключа не печатается)"
  else
    echo "ОТКАЗ: $SECRET_ENV существует, но не соответствует KEY_ID=$KEY_ID или формату. Скрипт его не перезаписывает и не удаляет: проверьте файл вручную."; exit 1
  fi
else
  echo "secret.env нет: будет создан ($SECRET_ENV, 600)"
fi

if [[ "$MODE" == dry ]]; then
  echo "DRY-RUN: регистрация сервера $SLUG (capabilities: $CAPS) и запись ключа не выполнялись."; exit 0
fi

stand_lock || exit $?
stand_write_db_env

# 1. регистрация (идемпотентно): сообщения классифицируются, текст ошибок НЕ печатается (в нём могут быть детали подключения)
REG_OUT="$STAND_WORK/register.out"
stand_tools "" -- scripts/bridge-register-server.ts --slug "$SLUG" --name "Dev SRV" --capabilities "$CAPS" > "$REG_OUT" 2>&1
rc=$?
if [[ $rc -eq 0 ]]; then
  echo "сервер $SLUG: зарегистрирован"
elif grep -q 'уже зарегистрирован' "$REG_OUT"; then
  echo "сервер $SLUG: уже есть (повторная регистрация не выполнялась)"
else
  echo "ОШИБКА регистрации (код $rc); текст ошибки не печатается. Проверьте БД и образ tools вручную."; exit 1
fi
: > "$REG_OUT"

# 2. ключ -> файл 600 (stdout print-key только в файл)
if [[ "$HAVE_KEY" == 1 ]]; then
  chmod 600 "$SECRET_ENV" 2>/dev/null; echo "secret.env: ключ уже записан, права 600"; exit 0
fi
PK="$STAND_WORK/print-key.out"
stand_tools "" -- scripts/bridge-print-key.ts --slug "$SLUG" --generation "$GEN" --print-key > "$PK" 2>/dev/null
rc=$?
KEY_VAL="$(sed -n 's/^key-hex: \([0-9a-f]\{64\}\)$/\1/p' "$PK" | head -n1)"
: > "$PK"
if [[ $rc -ne 0 || -z "$KEY_VAL" ]]; then
  KEY_VAL=""; echo "ОШИБКА: ключ не получен (код $rc); secret.env не изменён."; exit 1
fi
TMP_ENV="$(mktemp "$SECRET_ENV.new.XXXXXX")" || { KEY_VAL=""; echo "ОШИБКА: не создан временный файл рядом с secret.env"; exit 1; }
chmod 600 "$TMP_ENV"
printf 'KEY_ID=%s\nKEY=%s\nSITE_URL=%s\n' "$KEY_ID" "$KEY_VAL" "$SITE_URL" > "$TMP_ENV"
KEY_VAL=""
if mv -f "$TMP_ENV" "$SECRET_ENV"; then
  chmod 600 "$SECRET_ENV"
  echo "secret.env записан, права $(stat -c %a "$SECRET_ENV" 2>/dev/null || echo 600)"
else
  echo "ОШИБКА: не удалось записать secret.env; временный файл: $TMP_ENV (содержит ключ, 600)"; exit 1
fi
exit 0
