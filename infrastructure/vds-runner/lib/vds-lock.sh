#!/usr/bin/env bash
# Общий хелпер ЛОКАЛЬНОЙ блокировки SSH к VDS (подключать через `source`).
# Правило: к VDS одновременно открывает SSH/SCP только один локальный процесс (fail2ban, MaxStartups).
# Блокировка - каталог (mkdir атомарен) в %TEMP%/twomc-vds.lock с файлом owner (pid и время).
# Мёртвая блокировка (процесс-владелец не существует) или просроченная (старше VDS_LOCK_STALE_SEC) снимается автоматически.
#
# Функции:
#   vds_lock_acquire [timeout_sec]   - взять блокировку (по умолчанию ждать VDS_LOCK_TIMEOUT_SEC=600); код 1 по таймауту
#   vds_lock_release                 - отпустить (только если владелец - этот процесс)
#   vds_locked <команда...>          - выполнить команду под блокировкой; повторный вход (вложенный вызов) безопасен
# Переменные: VDS_LOCK_DIR, VDS_LOCK_TIMEOUT_SEC, VDS_LOCK_STALE_SEC (по умолчанию 900).
# ВАЖНО: блокировка держится только на время одной SSH/SCP-операции, а не на всё ожидание задания. Ловушки (trap) хелпер не ставит;
# вызывающий скрипт сам добавляет `trap vds_lock_release EXIT`. При аварии блокировку снимет проверка мёртвого pid.

_vds_default_lock_dir() {
  local base="${TEMP:-${TMP:-${TMPDIR:-/tmp}}}"
  if command -v cygpath >/dev/null 2>&1; then base="$(cygpath -u "$base" 2>/dev/null || printf '%s' "$base")"; fi
  printf '%s/twomc-vds.lock' "$base"
}
VDS_LOCK_DIR="${VDS_LOCK_DIR:-$(_vds_default_lock_dir)}"
VDS_LOCK_STALE_SEC="${VDS_LOCK_STALE_SEC:-900}"
VDS_LOCK_TIMEOUT_SEC="${VDS_LOCK_TIMEOUT_SEC:-600}"
_VDS_LOCK_HELD=0

_vds_lock_owner_pid() { awk 'NR==1{print $1}' "$VDS_LOCK_DIR/owner" 2>/dev/null || true; }
_vds_lock_owner_ts()  { awk 'NR==1{print $2}' "$VDS_LOCK_DIR/owner" 2>/dev/null || true; }

# Возвращает 0, если блокировка мёртвая/просроченная и её можно снять.
_vds_lock_is_stale() {
  local pid ts now age
  now="$(date +%s)"
  pid="$(_vds_lock_owner_pid)"; ts="$(_vds_lock_owner_ts)"
  if [[ -z "$pid" || -z "$ts" || ! "$pid" =~ ^[0-9]+$ || ! "$ts" =~ ^[0-9]+$ ]]; then
    # Файл owner ещё не записан (гонка) или повреждён: считаем мёртвой только если каталог старше 10 с.
    local m; m="$(stat -c %Y "$VDS_LOCK_DIR" 2>/dev/null || echo "$now")"
    (( now - m > 10 )); return
  fi
  age=$(( now - ts ))
  (( age > VDS_LOCK_STALE_SEC )) && return 0
  if (( age > 3 )) && ! kill -0 "$pid" 2>/dev/null; then return 0; fi
  return 1
}

vds_lock_acquire() {
  [[ "${VDS_LOCK_HELD:-}" == 1 ]] && return 0       # блокировку уже держит родительский процесс
  [[ "$_VDS_LOCK_HELD" == 1 ]] && return 0
  local timeout="${1:-$VDS_LOCK_TIMEOUT_SEC}" waited=0 notified=0 stale
  while ! mkdir "$VDS_LOCK_DIR" 2>/dev/null; do
    if _vds_lock_is_stale; then
      stale="$VDS_LOCK_DIR.stale.$$.$RANDOM"
      if mv "$VDS_LOCK_DIR" "$stale" 2>/dev/null; then
        echo "vds-lock: снята мёртвая/просроченная блокировка (владелец pid=$(awk 'NR==1{print $1}' "$stale/owner" 2>/dev/null))" >&2
        rm -rf "$stale"
      fi
      continue
    fi
    if (( waited >= timeout )); then
      echo "vds-lock: не удалось получить блокировку за ${timeout} с ($VDS_LOCK_DIR, владелец pid=$(_vds_lock_owner_pid))" >&2
      return 1
    fi
    if (( notified == 0 )); then echo "vds-lock: ожидание другого исполнителя (pid=$(_vds_lock_owner_pid))..." >&2; notified=1; fi
    sleep 1; waited=$(( waited + 1 ))
  done
  printf '%s %s %s\n' "$$" "$(date +%s)" "${0##*/}" > "$VDS_LOCK_DIR/owner"
  _VDS_LOCK_HELD=1
  return 0
}

vds_lock_release() {
  [[ "$_VDS_LOCK_HELD" == 1 ]] || return 0
  if [[ "$(_vds_lock_owner_pid)" == "$$" ]]; then rm -rf "$VDS_LOCK_DIR"; fi
  _VDS_LOCK_HELD=0
}

# Выполнить команду под блокировкой. Дочерние процессы получают VDS_LOCK_HELD=1 и повторно не берут её.
vds_locked() {
  if [[ "${VDS_LOCK_HELD:-}" == 1 || "$_VDS_LOCK_HELD" == 1 ]]; then "$@"; return; fi
  vds_lock_acquire || return 1
  local rc=0
  VDS_LOCK_HELD=1 "$@" || rc=$?
  vds_lock_release
  return "$rc"
}
