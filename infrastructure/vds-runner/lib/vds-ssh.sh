#!/usr/bin/env bash
# Общие обёртки SSH/SCP к VDS (подключать через `source`; требует lib/vds-lock.sh).
# Правила доступа: только twomc@VDS_HOST, ключ ~/.ssh/twomc_giveaway_vds, IdentitiesOnly, BatchMode, StrictHostKeyChecking=yes;
# каждая операция под локальной блокировкой; при сбое входа НЕ повторяется (код возврата 255 уходит вызывающему).
#   vds_ssh_script <файл-скрипта> [арг...]   - `ssh ... 'bash -s -- арг...' < файл` (аргументы проверяются: только [A-Za-z0-9._:/=,@+-])
#   vds_scp_put <локальный-файл> <удалённый-путь>
HERE_VDS_SSH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=vds-lock.sh
source "$HERE_VDS_SSH/vds-lock.sh"

VDS_HOST="${VDS_HOST:-31.76.77.45}"
VDS_USER="${VDS_USER:-twomc}"
VDS_SSH_KEY="${VDS_SSH_KEY:-$HOME/.ssh/twomc_giveaway_vds}"
[[ "$VDS_HOST" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "Недопустимый VDS_HOST" >&2; return 1 2>/dev/null || exit 1; }
[[ "$VDS_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || { echo "Недопустимый VDS_USER" >&2; return 1 2>/dev/null || exit 1; }
_VDS_SSH_OPTS=(-i "$VDS_SSH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes
  -o ConnectTimeout=20 -o ServerAliveInterval=30 -o ServerAliveCountMax=10)

_vds_ssh_script_raw() {
  local file="$1"; shift
  ssh "${_VDS_SSH_OPTS[@]}" "$VDS_USER@$VDS_HOST" "bash -s -- $*" < "$file"
}
vds_ssh_script() {
  local file="$1"; shift
  local a
  for a in "$@"; do [[ "$a" =~ ^[A-Za-z0-9._:/=,@+-]+$ ]] || { echo "Недопустимый аргумент для удалённого скрипта: $a" >&2; return 2; }; done
  vds_locked _vds_ssh_script_raw "$file" "$@"
}
_vds_scp_raw() { scp -q "${_VDS_SSH_OPTS[@]}" "$1" "$VDS_USER@$VDS_HOST:$2"; }
vds_scp_put() {
  [[ "$2" =~ ^/[A-Za-z0-9._/-]+$ ]] || { echo "Недопустимый удалённый путь: $2" >&2; return 2; }
  vds_locked _vds_scp_raw "$1" "$2"
}

# Загрузка бандла в ПРИВАТНЫЙ каталог ~/.twomc-inbox (700) на VDS одним ssh-сеансом (stdin -> файл), вместо общедоступного /tmp.
#   vds_put_inbox <локальный-файл> <имя-файла>   -> ~/.twomc-inbox/<имя-файла> (umask 077, запись через .part и mv)
_vds_put_inbox_raw() {
  local name="$2"
  ssh "${_VDS_SSH_OPTS[@]}" "$VDS_USER@$VDS_HOST" \
    "umask 077; mkdir -p -m 700 \"\$HOME/.twomc-inbox\" && chmod 700 \"\$HOME/.twomc-inbox\" && cat > \"\$HOME/.twomc-inbox/$name.part\" && mv -f \"\$HOME/.twomc-inbox/$name.part\" \"\$HOME/.twomc-inbox/$name\"" < "$1"
}
vds_put_inbox() {
  [[ "$2" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ && "$2" != *..* ]] || { echo "Недопустимое имя файла: $2" >&2; return 2; }
  vds_locked _vds_put_inbox_raw "$1" "$2"
}
