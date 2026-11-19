#!/usr/bin/env bash
# Отправка подписанного тестового события розыгрыша через curl. Ключ читается из файла и НЕ выводится.
# Формат подписи (giveaway-crypto.ts buildCanonical/signRequest):
#   canonical = "twomc-giveaway-v1\n<key-id>\n<timestamp>\n<nonce>\n<METHOD>\n<путь>\n<sha256(body) hex>"
#   подпись = HMAC-SHA256(ключ(32 байта из файла, hex), canonical), hex. Подписывается ПУБЛИЧНЫЙ путь /api/giveaway/v1/events.
# Заголовки: X-Giveaway-Key-Id, X-Giveaway-Timestamp (секунды, 10 цифр), X-Giveaway-Nonce, X-Giveaway-Signature.
# Печатает только HTTP-код (и тело ответа с --show-body; тела ошибок API без деталей).
#
# Использование:
#   sign-event.sh --url https://giveaway.twomc.su --key-file ~/keys/mc-test.v1.key --server-id mc-test --version 1 \
#     [--type heartbeat|join|quit] [--uuid <uuid>] [--name TestPlayer] [--active true|false] \
#     [--replay] [--tamper] [--timestamp-offset SEC] [--show-body]
#   --replay: повторить тот же запрос (тот же nonce) -> ожидается 401.
#   --tamper: испортить тело после подписи -> ожидается 401.
#   --timestamp-offset: сдвиг времени (например -3600) -> ожидается 401 (окно +-300 с).
set -euo pipefail
umask 077

URL="" KEY_FILE="" SERVER_ID="" VERSION="1" TYPE="heartbeat" UUID="" NAME="TestPlayer" ACTIVE="true"
REPLAY=0 TAMPER=0 OFFSET=0 SHOW=0
while [ $# -gt 0 ]; do
  case "$1" in
    --url) URL="${2:-}"; shift 2 ;;
    --key-file) KEY_FILE="${2:-}"; shift 2 ;;
    --server-id) SERVER_ID="${2:-}"; shift 2 ;;
    --version) VERSION="${2:-}"; shift 2 ;;
    --type) TYPE="${2:-}"; shift 2 ;;
    --uuid) UUID="${2:-}"; shift 2 ;;
    --name) NAME="${2:-}"; shift 2 ;;
    --active) ACTIVE="${2:-}"; shift 2 ;;
    --timestamp-offset) OFFSET="${2:-}"; shift 2 ;;
    --replay) REPLAY=1; shift ;;
    --tamper) TAMPER=1; shift ;;
    --show-body) SHOW=1; shift ;;
    *) echo "Неизвестный параметр: $1" >&2; exit 2 ;;
  esac
done
[ -n "$URL" ] && [ -f "$KEY_FILE" ] || { echo "Ошибка: нужны --url и существующий --key-file" >&2; exit 2; }
[[ "$SERVER_ID" =~ ^[a-z0-9][a-z0-9-]{1,31}$ ]] || { echo "Ошибка: --server-id" >&2; exit 2; }
[[ "$TYPE" =~ ^(join|quit|heartbeat)$ ]] || { echo "Ошибка: --type" >&2; exit 2; }
[[ "$NAME" =~ ^[A-Za-z0-9_]{1,16}$ ]] || { echo "Ошибка: --name" >&2; exit 2; }
[[ "$ACTIVE" =~ ^(true|false)$ ]] || { echo "Ошибка: --active" >&2; exit 2; }
[[ "$OFFSET" =~ ^-?[0-9]+$ ]] || { echo "Ошибка: --timestamp-offset" >&2; exit 2; }

rand_hex() { openssl rand -hex "$1" | tr -d '[:space:]'; }
uuid4() { local h; h="$(rand_hex 16)"; printf '%s-%s-4%s-8%s-%s' "${h:0:8}" "${h:8:4}" "${h:13:3}" "${h:17:3}" "${h:20:12}"; }
[ -n "$UUID" ] || UUID="$(uuid4)"
[[ "$UUID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]] || { echo "Ошибка: --uuid" >&2; exit 2; }

KEY_ID="${SERVER_ID}.${VERSION}"
TS="$(( $(date -u +%s) + OFFSET ))"
NONCE="$(openssl rand -base64 24 | tr "+/" "-_" | tr -d "=[:space:]")"   # 32 символа base64url
OCC="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
ACTIVE_FIELD=""
if [ "$TYPE" = "heartbeat" ]; then ACTIVE_FIELD=",\"active\":${ACTIVE}"; fi
BODY="{\"schema\":\"twomc.giveaway.v1\",\"events\":[{\"eventId\":\"$(uuid4)\",\"type\":\"${TYPE}\",\"playerUuid\":\"${UUID}\",\"playerName\":\"${NAME}\",\"occurredAt\":\"${OCC}\"${ACTIVE_FIELD}}]}"

KEY_HEX="$(tr -d ' \n\r' < "$KEY_FILE")"
[[ "$KEY_HEX" =~ ^[0-9a-fA-F]{64}$ ]] || { echo "Ошибка: файл ключа должен содержать 64 hex-символа" >&2; exit 1; }
BODY_SHA="$(printf %s "$BODY" | openssl dgst -sha256 -hex | sed "s/^.* //" | tr -d "[:space:]")"
CANON="$(printf 'twomc-giveaway-v1\n%s\n%s\n%s\nPOST\n/api/giveaway/v1/events\n%s' "$KEY_ID" "$TS" "$NONCE" "$BODY_SHA")"
SIG="$(printf %s "$CANON" | openssl dgst -sha256 -mac HMAC -macopt "hexkey:${KEY_HEX}" -hex | sed "s/^.* //" | tr -d "[:space:]")"
unset KEY_HEX
if [ "$TAMPER" -eq 1 ]; then BODY="${BODY} "; fi   # тело изменено после подписи

TMPBODY="$(mktemp)"
trap 'rm -f "$TMPBODY"' EXIT
send() {
  local out
  out="$(curl -sS -o "$TMPBODY" -w '%{http_code}' -X POST "${URL%/}/api/giveaway/v1/events" \
    -H 'Content-Type: application/json' \
    -H "X-Giveaway-Key-Id: ${KEY_ID}" -H "X-Giveaway-Timestamp: ${TS}" \
    -H "X-Giveaway-Nonce: ${NONCE}" -H "X-Giveaway-Signature: ${SIG}" \
    --data-binary "$BODY" --max-time 20)"
  echo "HTTP ${out}"
  if [ "$SHOW" -eq 1 ]; then cat "$TMPBODY"; echo; fi
}
send
if [ "$REPLAY" -eq 1 ]; then echo "повтор (тот же nonce):"; send; fi
exit 0
