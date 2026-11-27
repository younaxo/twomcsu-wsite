#!/usr/bin/env bash
# UUID игрока на сервере с online-mode=false: UUID v3 от "OfflinePlayer:<ник>" (как делает Bukkit/Paper).
# На dev-srv online-mode=false, поэтому MinecraftAccount.uuid на стенде должен быть именно этим значением для тестового ника.
#   offline-uuid.sh <ник>        -> xxxxxxxx-xxxx-3xxx-yxxx-xxxxxxxxxxxx
set -euo pipefail
nick="${1:?укажите ник}"
[[ "$nick" =~ ^[A-Za-z0-9_]{3,16}$ ]] || { echo "ник: 3-16 символов [A-Za-z0-9_]" >&2; exit 2; }
h="$(printf 'OfflinePlayer:%s' "$nick" | openssl md5 -binary | od -An -tx1 | tr -d ' \n')"
b6=$(( (0x${h:12:2} & 0x0f) | 0x30 )); b8=$(( (0x${h:16:2} & 0x3f) | 0x80 ))
printf '%s-%s-%s%s-%02x%s-%s\n' "${h:0:8}" "${h:8:4}" "$(printf '%02x' "$b6")" "${h:14:2}" "$b8" "${h:18:2}" "${h:20:12}"
