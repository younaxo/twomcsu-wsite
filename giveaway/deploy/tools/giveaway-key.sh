#!/usr/bin/env bash
# Выдача ключа сервера розыгрыша на VDS (HKDF-SHA256 через openssl >= 3.0), без вывода секретов.
# Алгоритм = apps/api/src/modules/giveaway/giveaway-crypto.ts deriveServerKey:
#   ключ = HKDF-SHA256(мастер(utf8), соль = id сервера, info = "twomc-giveaway" 0x00 "v1" 0x00 u32be(версия)), 32 байта.
# Мастер-секрет читается из GIVEAWAY_MASTER_SECRET= в env-файле; в stdout/stderr печатается только key-id и путь.
# Ключ пишется в файл 0600, существующий файл не перезаписывается.
# Замечание: hex-значение попадает в аргументы openssl на доли секунды (виден в ps пользователям сервера);
# на выделенном VDS с одним пользователем это принято (RUNBOOK, раздел «Риски»).
#
# Использование:
#   giveaway-key.sh --env-file /srv/twomc-giveaway/secrets/api.env --server-id mc-test --version 1 --out /srv/twomc-giveaway/keys/mc-test.v1.key
set -euo pipefail
umask 077

ENV_FILE="" SERVER_ID="" VERSION="1" OUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --env-file) ENV_FILE="${2:-}"; shift 2 ;;
    --server-id) SERVER_ID="${2:-}"; shift 2 ;;
    --version) VERSION="${2:-}"; shift 2 ;;
    --out) OUT="${2:-}"; shift 2 ;;
    *) echo "Неизвестный параметр: $1" >&2; exit 2 ;;
  esac
done

[ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ] || { echo "Ошибка: --env-file не найден" >&2; exit 2; }
[[ "$SERVER_ID" =~ ^[a-z0-9][a-z0-9-]{1,31}$ ]] || { echo "Ошибка: --server-id неверного формата" >&2; exit 2; }
[[ "$VERSION" =~ ^[1-9][0-9]{0,5}$ ]] || { echo "Ошибка: --version: целое 1..999999" >&2; exit 2; }
[ -n "$OUT" ] || { echo "Ошибка: нужен --out" >&2; exit 2; }
[ ! -e "$OUT" ] || { echo "Ошибка: файл уже существует, не перезаписываю: $OUT" >&2; exit 1; }

# Мастер-секрет из env-файла (последнее вхождение, как у docker env_file).
MASTER="$(grep -E '^GIVEAWAY_MASTER_SECRET=' "$ENV_FILE" | tail -n 1 | cut -d= -f2-)"
[ "${#MASTER}" -ge 32 ] || { echo "Ошибка: GIVEAWAY_MASTER_SECRET не задан или короче 32 байт" >&2; exit 1; }

tohex() { od -An -v -tx1 | tr -d "[:space:]"; }
MASTER_HEX="$(printf '%s' "$MASTER" | tohex)"
unset MASTER
SALT_HEX="$(printf '%s' "$SERVER_ID" | tohex)"
INFO_HEX="$(printf %s twomc-giveaway | tohex)00$(printf %s v1 | tohex)00$(printf %08x "$VERSION")"   # "twomc-giveaway" 0x00 "v1" 0x00 u32be(версия)

KEY_HEX="$(openssl kdf -keylen 32 -kdfopt digest:SHA256 -kdfopt "hexkey:${MASTER_HEX}" \
  -kdfopt "hexsalt:${SALT_HEX}" -kdfopt "hexinfo:${INFO_HEX}" -binary HKDF | tohex)"
unset MASTER_HEX
[ "${#KEY_HEX}" -eq 64 ] || { echo "Ошибка: вывод HKDF неверной длины" >&2; exit 1; }

# set -C (noclobber) не даёт перезаписать при гонке.
( set -C; printf '%s\n' "$KEY_HEX" > "$OUT" )
chmod 0600 "$OUT"
echo "key-id: ${SERVER_ID}.${VERSION}"
echo "ключ записан в файл: $OUT"
