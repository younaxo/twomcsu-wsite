#!/usr/bin/env bash
# Общий хелпер ЛОКАЛЬНОЙ блокировки SSH к VDS (подключать через `source`).
# Правило: к VDS одновременно открывает SSH/SCP только один локальный процесс (fail2ban, MaxStartups).
# Блокировка - каталог (mkdir атомарен) в %TEMP%/twomc-vds.lock с файлом owner: "pid время скрипт крайний_срок".
# Блокировку снимают ТОЛЬКО в двух случаях: процесс-владелец мёртв (kill -0) или истёк жёсткий потолок (VDS_LOCK_MAX_SEC, по умолчанию 6 ч;
# его владелец сам записывает в owner). Живой владелец до потолка свою блокировку не теряет, как бы долго ни работал.
#
# Функции:
#   vds_lock_acquire [timeout_sec]   - взять блокировку (по умолчанию ждать VDS_LOCK_TIMEOUT_SEC=600); код 1 по таймауту
#   vds_lock_release                 - отпустить (только если владелец - этот процесс)
#   vds_locked <команда...>          - выполнить команду под блокировкой; повторный вход (вложенный вызов) безопасен
#   vds_stage_new                    - создать временный каталог STAGE_TMP (twomc-stage.XXXXXX; НЕ меняет TMP/TEMP/TMPDIR)
#   vds_stage_cleanup                - удалить STAGE_TMP, только если он создан vds_stage_new (имя twomc-stage.*)
#   vds_exit_cleanup                 - vds_lock_release + vds_stage_cleanup (для `trap vds_exit_cleanup EXIT`)
# Переменные: VDS_LOCK_DIR, VDS_LOCK_TIMEOUT_SEC, VDS_LOCK_MAX_SEC (по умолчанию 21600).
# ВАЖНО: блокировка держится только на время одной SSH/SCP-операции, а не на всё ожидание задания. Ловушки (trap) хелпер не ставит;
# вызывающий скрипт сам добавляет `trap vds_exit_cleanup EXIT` (или `trap vds_lock_release EXIT`). При аварии блокировку снимет проверка мёртвого pid.
# Запрещено переименовывать/присваивать TMP, TEMP, TMPDIR в скриптах и вызывать rm -rf от их значений: на Windows это системный временный каталог.

_vds_default_lock_dir() {
  local base="${TEMP:-${TMP:-${TMPDIR:-/tmp}}}"
  if command -v cygpath >/dev/null 2>&1; then base="$(cygpath -u "$base" 2>/dev/null || printf '%s' "$base")"; fi
  printf '%s/twomc-vds.lock' "$base"
}
VDS_LOCK_DIR="${VDS_LOCK_DIR:-$(_vds_default_lock_dir)}"
VDS_LOCK_MAX_SEC="${VDS_LOCK_MAX_SEC:-21600}"
VDS_LOCK_TIMEOUT_SEC="${VDS_LOCK_TIMEOUT_SEC:-600}"
_VDS_LOCK_HELD=0
STAGE_TMP=""

_vds_lock_field() { awk -v n="$1" 'NR==1{print $n}' "$VDS_LOCK_DIR/owner" 2>/dev/null || true; }
_vds_lock_owner_pid() { _vds_lock_field 1; }

# Возвращает 0, если блокировка мёртвая (владелец не существует) или у неё истёк жёсткий потолок.
_vds_lock_is_stale() {
  local pid ts deadline now age
  now="$(date +%s)"
  pid="$(_vds_lock_field 1)"; ts="$(_vds_lock_field 2)"; deadline="$(_vds_lock_field 4)"
  if [[ ! "$pid" =~ ^[0-9]+$ || ! "$ts" =~ ^[0-9]+$ ]]; then
    # Файл owner ещё не записан (гонка) или повреждён: считаем мёртвой только если каталог старше 10 с.
    local m; m="$(stat -c %Y "$VDS_LOCK_DIR" 2>/dev/null || echo "$now")"
    (( now - m > 10 )); return
  fi
  age=$(( now - ts ))
  if (( age > 3 )) && ! kill -0 "$pid" 2>/dev/null; then return 0; fi      # владелец мёртв
  if [[ ! "$deadline" =~ ^[0-9]+$ ]]; then deadline=$(( ts + VDS_LOCK_MAX_SEC )); fi
  (( now > deadline )) && return 0                                          # жёсткий потолок (живой, но завис дольше 6 ч)
  return 1
}

vds_lock_acquire() {
  [[ "${VDS_LOCK_HELD:-}" == 1 ]] && return 0       # блокировку уже держит родительский процесс
  [[ "$_VDS_LOCK_HELD" == 1 ]] && return 0
  local timeout="${1:-$VDS_LOCK_TIMEOUT_SEC}" waited=0 notified=0 stale before steals=0
  while ! mkdir "$VDS_LOCK_DIR" 2>/dev/null; do
    if _vds_lock_is_stale; then
      before="$(cat "$VDS_LOCK_DIR/owner" 2>/dev/null || true)"
      # Перепроверка непосредственно перед mv: за это время блокировку мог перехватить другой процесс.
      if _vds_lock_is_stale && [[ "$(cat "$VDS_LOCK_DIR/owner" 2>/dev/null || true)" == "$before" ]]; then
        stale="$VDS_LOCK_DIR.stale.$$.$RANDOM"
        if mv "$VDS_LOCK_DIR" "$stale" 2>/dev/null; then
          if [[ "$(cat "$stale/owner" 2>/dev/null || true)" == "$before" ]]; then
            echo "vds-lock: снята мёртвая/просроченная блокировка (владелец pid=${before%% *})" >&2
            rm -rf -- "$stale"
          else
            # Успели перехватить между проверкой и mv: вернуть чужую блокировку на место (если место свободно).
            mv "$stale" "$VDS_LOCK_DIR" 2>/dev/null || echo "vds-lock: предупреждение: чужая блокировка перемещена в $stale (место занято)" >&2
          fi
        fi
      fi
      steals=$(( steals + 1 ))
      if (( steals > 5 )); then echo "vds-lock: слишком много попыток снять блокировку ($VDS_LOCK_DIR)" >&2; return 1; fi
      sleep 1; waited=$(( waited + 1 ))
      if (( waited >= timeout )); then echo "vds-lock: не удалось получить блокировку за ${timeout} с" >&2; return 1; fi
      continue
    fi
    if (( waited >= timeout )); then
      echo "vds-lock: не удалось получить блокировку за ${timeout} с ($VDS_LOCK_DIR, владелец pid=$(_vds_lock_owner_pid))" >&2
      return 1
    fi
    if (( notified == 0 )); then echo "vds-lock: ожидание другого исполнителя (pid=$(_vds_lock_owner_pid))..." >&2; notified=1; fi
    sleep 1; waited=$(( waited + 1 ))
  done
  local now; now="$(date +%s)"
  printf '%s %s %s %s\n' "$$" "$now" "${0##*/}" "$(( now + VDS_LOCK_MAX_SEC ))" > "$VDS_LOCK_DIR/owner"
  _VDS_LOCK_HELD=1
  return 0
}

vds_lock_release() {
  [[ "$_VDS_LOCK_HELD" == 1 ]] || return 0
  if [[ "$(_vds_lock_owner_pid)" == "$$" ]]; then rm -rf -- "$VDS_LOCK_DIR"; fi
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

# Временный каталог скрипта: ТОЛЬКО через mktemp с собственным префиксом; удаляется только каталог с этим префиксом.
vds_stage_new() {
  local d
  d="$(mktemp -d -t twomc-stage.XXXXXX)" || return 1
  [[ -n "$d" && -d "$d" && "${d##*/}" == twomc-stage.* ]] || { echo "vds-lock: mktemp вернул неожиданный путь" >&2; return 1; }
  STAGE_TMP="$d"
}
vds_stage_cleanup() {
  local d="${STAGE_TMP:-}"
  if [[ -n "$d" && -d "$d" && "${d##*/}" == twomc-stage.* ]]; then rm -rf -- "$d"; fi
  STAGE_TMP=""
  return 0
}
vds_exit_cleanup() { vds_lock_release; vds_stage_cleanup; }
