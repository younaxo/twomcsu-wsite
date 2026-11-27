#!/usr/bin/env bash
# Доступ к dev-srv для проверки Bridge: whitelist и режим техработ (только сервер из SERVER_UUID; запись по политике ptero.sh).
# Запуск: run-on-vds.sh script devsrv-access.sh --status | --open <ник...> [--no-owner] | --restore
#   --status    только чтение: whitelist вкл/выкл (white-list, enforce-whitelist), ники в whitelist, плагин техработ и его состояние, игроки онлайн
#               (SLP), ник тестового игрока стенда (MinecraftAccount; только ник), наличие state-файла.
#   --open      бэкап (whitelist.json.bak-<UTC>, config плагина техработ .bak-<UTC>), `whitelist add` для каждого ника (+ ник владельца стенда,
#               если найден), если техработы включены - выключить (командой плагина; запасной путь: правка config + reload плагина), прежнее состояние -
#               в state-файл /home/twomc/bridge-dev-srv.access.state (600). Повторный --open дополняет state, прежние значения не затираются.
#   --restore   вернуть техработы, `whitelist remove` ТОЛЬКО для добавленных нами ников, сверка со state (печатается таблица), state не удаляется
#               (переименовывается в .restored-<UTC>). Журнал изменений - /home/twomc/bridge-dev-srv.changes.log (см. ptero.sh).
# Ничего не удаляется: ни мир, ни данные игроков, ни файлы; плагины не ставятся и не снимаются. Секреты не печатаются (печатаются ники, булевы значения, имена файлов).
# Коды: 0 готово, 1 ошибка, 2 аргументы, 3 выполнено с предупреждением (состояние техработ или whitelist не подтверждено), 4 сервер не запущен, 5 занят lock.
# Тестовый режим STAND_TEST=1 (сухие прогоны на заглушках): DEVSRV_STATE_FILE, DEVSRV_PG_CONTAINER, DEVSRV_POLL_SLEEP.
export LC_ALL=C
set -uo pipefail
if ! declare -F ptero_init >/dev/null 2>&1; then source "$(dirname "${BASH_SOURCE[0]}")/ptero.sh"; fi
if ! declare -F stand_init >/dev/null 2>&1; then source "$(dirname "${BASH_SOURCE[0]}")/stand-lib.sh"; fi
trap '_da_cleanup' EXIT
_da_cleanup() { ptero_cleanup; stand_cleanup; }

if [[ "${STAND_TEST:-0}" == 1 ]]; then
  DA_STATE="${DEVSRV_STATE_FILE:-/home/twomc/bridge-dev-srv.access.state}"; DA_PG="${DEVSRV_PG_CONTAINER:-twomc-stand-postgres}"; DA_SLEEP="${DEVSRV_POLL_SLEEP:-2}"
else
  DA_STATE=/home/twomc/bridge-dev-srv.access.state; DA_PG=twomc-stand-postgres; DA_SLEEP=2
fi
DA_WARN=0
say() { printf '%s\n' "$*"; }
warn() { say "WARN: $*"; DA_WARN=1; }
usage() { echo "Использование: devsrv-access.sh --status | --open <ник...> [--no-owner] | --restore" >&2; exit 2; }

MODE=""; NICKS=(); NO_OWNER=0
for a in "$@"; do
  case "$a" in
    --status|--open|--restore) [[ -z "$MODE" ]] || { echo "Режим задаётся один раз" >&2; exit 2; }; MODE="${a#--}" ;;
    --no-owner) NO_OWNER=1 ;;
    -*) echo "Неизвестный аргумент: $a" >&2; usage ;;
    *) [[ "$a" =~ ^[A-Za-z0-9_]{3,16}$ ]] || { echo "Недопустимый ник (3-16 символов [A-Za-z0-9_])" >&2; exit 2; }; NICKS+=("$a") ;;
  esac
done
[[ -n "$MODE" ]] || usage
[[ "$MODE" == open || ${#NICKS[@]} -eq 0 ]] || { echo "Ники принимает только --open" >&2; exit 2; }
[[ "$MODE" != open || ${#NICKS[@]} -gt 0 || "$NO_OWNER" == 0 ]] || { echo "--open: укажите хотя бы один ник (ник владельца стенда добавляется сам)" >&2; exit 2; }
umask 077

# ---------- вспомогательные функции ----------

_da_lc() { printf '%s' "${1,,}"; }

# значение ключа из server.properties-текста: _da_prop <ключ> <текст>
_da_prop() { printf '%s\n' "$2" | sed -n "s/^$1=//p" | tr -d '\r' | head -n1; }

# ники из whitelist.json (по одному в строке). Нет файла - пусто (код 0); ошибка чтения при существующем файле - код 1.
_da_wl_names() {
  local txt
  if txt="$(ptero_file_read /whitelist.json 2>/dev/null)"; then :; else
    ptero_file_exists /whitelist.json && return 1
    return 0
  fi
  printf '%s\n' "$txt" | grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*:[[:space:]]*"\(.*\)"/\1/' | tr -d '\r'
}

# ждать условие: _da_wait <попыток> <команда...> (пауза DA_SLEEP между попытками)
_da_wait() { local n="$1" i; shift; for ((i = 0; i < n; i++)); do "$@" && return 0; sleep "$DA_SLEEP"; done; return 1; }

_da_has_nick() { _da_wl_names | tr 'A-Z' 'a-z' | grep -qxF -- "$(_da_lc "$1")"; }
_da_no_nick() { ! _da_has_nick "$1"; }

# ---- техработы ----
MT_JAR=""; MT_DIR=""; MT_KEY=""; MT_VAL="unknown"; MT_CMD_ON=""; MT_CMD_OFF=""; MT_CMD_RELOAD=""
_DA_MT_RE='maintenance|techwork|tech-work|tehrab|techrab|closeserver|serverlock|lockdown'

# _da_mt_find: ищет плагин техработ в /plugins по именам jar и каталогов; профиль команд по документации плагина.
# Maintenance (KennyTV): `maintenance on|off`, `maintenance reload`. Для прочих плагинов команды неизвестны (только чтение состояния).
_da_mt_find() {
  local lst; MT_JAR=""; MT_DIR=""; MT_CMD_ON=""; MT_CMD_OFF=""; MT_CMD_RELOAD=""
  lst="$(ptero_files_list /plugins 2>/dev/null)" || return 1
  MT_JAR="$(grep -E '^- .*\.jar$' <<<"$lst" | sed 's/^- //' | grep -iE "$_DA_MT_RE" | head -n1)"
  MT_DIR="$(grep -E '^d ' <<<"$lst" | sed 's/^d //' | grep -iE "$_DA_MT_RE" | head -n1)"
  if [[ -z "$MT_DIR" && -n "$MT_JAR" ]]; then   # каталог данных обычно называется как плагин без версии: Maintenance-4.1.jar -> Maintenance
    local base="${MT_JAR%.jar}"; base="$(sed -E 's/[-_][0-9].*$//' <<<"$base")"
    grep -qxF -- "d $base" <<<"$lst" && MT_DIR="$base"
  fi
  local ident; ident="$(_da_lc "${MT_JAR}${MT_DIR}")"
  if [[ "$ident" == *maintenance* ]]; then MT_CMD_ON="maintenance on"; MT_CMD_OFF="maintenance off"; MT_CMD_RELOAD="maintenance reload"; fi
  [[ "$MT_DIR" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ || -z "$MT_DIR" ]] || MT_DIR=""
  return 0
}

# _da_mt_state: читает /plugins/<каталог>/config.yml, находит ключ состояния; MT_KEY, MT_VAL (true|false|unknown).
_da_mt_state() {
  local cfg line
  MT_KEY=""; MT_VAL="unknown"
  [[ -n "$MT_DIR" ]] || return 0
  cfg="$(ptero_file_read "/plugins/$MT_DIR/config.yml" 2>/dev/null)" || return 0
  line="$(printf '%s\n' "$cfg" | tr -d '\r' | grep -iE '^[[:space:]]*(maintenance[-_]?(enabled|mode|state|status)?|enable[-_]?maintenance|enabled)[[:space:]]*:[[:space:]]*(true|false|on|off|yes|no)[[:space:]]*(#.*)?$' | head -n1)"
  cfg=""
  [[ -n "$line" ]] || return 0
  MT_KEY="$(sed -E 's/^[[:space:]]*([A-Za-z_-]+)[[:space:]]*:.*/\1/' <<<"$line")"
  case "$(_da_lc "$(sed -E 's/^[^:]*:[[:space:]]*([A-Za-z]+).*/\1/' <<<"$line")")" in
    true|on|yes) MT_VAL=true ;; false|off|no) MT_VAL=false ;;
  esac
}
_da_mt_is() { _da_mt_state; [[ "$MT_VAL" == "$1" ]]; }

# _da_mt_set <true|false>: команда плагина; не подтвердилось - правка config (после бэкапа) + reload плагина. Код 0 - состояние подтверждено.
_da_mt_set() {
  local want="$1" cmd rc=1
  [[ "$want" == true ]] && cmd="$MT_CMD_ON" || cmd="$MT_CMD_OFF"
  if [[ -n "$cmd" ]]; then
    ptero_command "$cmd" && _da_wait 8 _da_mt_is "$want" && rc=0
  fi
  if (( rc != 0 )) && [[ -n "$MT_KEY" && -n "$MT_CMD_RELOAD" ]]; then
    say "команда плагина не подтвердила состояние: правка config + reload плагина"
    local tmp cfg; _pt_mktemp || return 1; tmp="$_PT_LAST"
    cfg="$(ptero_file_read "/plugins/$MT_DIR/config.yml" 2>/dev/null)" || { : > "$tmp"; return 1; }
    printf '%s\n' "$cfg" | sed -E "s/^([[:space:]]*$MT_KEY[[:space:]]*:[[:space:]]*)(true|false|on|off|yes|no)/\1$want/I" > "$tmp"; cfg=""
    if ptero_file_write "/plugins/$MT_DIR/config.yml" "$tmp"; then
      : > "$tmp"
      ptero_command "$MT_CMD_RELOAD" && _da_wait 8 _da_mt_is "$want" && rc=0
    fi
    : > "$tmp"
  fi
  return $rc
}

# ---- ник тестового игрока стенда (только ник; нет -> пустая строка) ----
_da_owner_nick() {
  local login out nick uuid pu pdb
  stand_init >/dev/null 2>&1 || return 0
  [[ -r "$STAND_CRED_FILE" ]] && twomc_secure_file "$STAND_CRED_FILE" 2>/dev/null || return 0
  login="$(awk 'BEGIN{s=0} { sub(/\r$/, "") } /^[[:space:]]*\[/{s=($0 ~ /^[[:space:]]*\[(и|И)(г|Г)(р|Р)(о|О)(к|К)\][[:space:]]*$/)} s && /^[[:space:]]*login[[:space:]]*:/{sub(/^[^:]*:[[:space:]]*/,""); sub(/[[:space:]]+$/,""); print; exit}' "$STAND_CRED_FILE" 2>/dev/null)"
  [[ "$login" =~ ^[A-Za-z0-9_.-]{1,64}$ ]] || return 0   # значение попадает в SQL-литерал только после этой проверки; email с @ отсекается
  pu="$(stand_env_get POSTGRES_USER)"; pdb="$(stand_env_get POSTGRES_DB)"
  [[ "$pu" =~ ^[A-Za-z0-9_]+$ && "$pdb" =~ ^[A-Za-z0-9_]+$ ]] || return 0
  local sql="SELECT m.name || '|' || m.uuid FROM minecraft_accounts m JOIN users u ON u.id = m.\"userId\" WHERE u.username = '$login' LIMIT 1"
  out="$(timeout 20 docker exec "$DA_PG" psql -U "$pu" -d "$pdb" -At -c "$sql" </dev/null 2>/dev/null)" || out=""
  if [[ -z "$out" ]]; then   # запасной путь: пароль через env-file (не argv)
    out="$(timeout 20 docker exec --env-file <(printf 'PGPASSWORD=%s\n' "$(stand_env_get POSTGRES_PASSWORD)") "$DA_PG" psql -U "$pu" -d "$pdb" -h 127.0.0.1 -At -c "$sql" </dev/null 2>/dev/null)" || out=""
  fi
  nick="${out%%|*}"; uuid="${out#*|}"
  [[ "$nick" =~ ^[A-Za-z0-9_]{3,16}$ ]] || return 0
  [[ "$uuid" == de30c0de-0000-4000-* ]] && return 0   # фиктивный аккаунт сида (StandPlayer): не настоящий ник
  printf '%s' "$nick"
}

# ---- state-файл ----
_da_state_get() { sed -n "s/^$1=//p" "$DA_STATE" 2>/dev/null | head -n1; }
# _da_state_write KEY=VAL ...: атомарно (tmp + mv), права 600
_da_state_write() {
  local tmp="$DA_STATE.tmp.$$" kv
  ( umask 077; : > "$tmp" ) || return 1
  for kv in "$@"; do printf '%s\n' "$kv" >> "$tmp"; done
  chmod 600 "$tmp" && mv -f -- "$tmp" "$DA_STATE"
}
_da_lock() {
  if ! command -v flock >/dev/null 2>&1; then [[ "${STAND_TEST:-0}" == 1 ]] && return 0; say "ОТКАЗ: на VDS нет flock"; return 1; fi
  exec 8>"$DA_STATE.lock" && chmod 600 "$DA_STATE.lock" 2>/dev/null
  flock -n 8 || { say "ОТКАЗ: devsrv-access.sh уже выполняется (lock $DA_STATE.lock)"; return 5; }
}
_da_join() { local IFS=,; printf '%s' "$*"; }

# ---------- режимы ----------

do_status() {
  export PTERO_ALLOW_WRITE=0
  ptero_init || exit 1
  local props wl names n slp owner
  say "== dev-srv: доступ (только чтение) =="
  ptero_status || say "WARN: статус сервера недоступен"
  props="$(ptero_file_read /server.properties 2>/dev/null)" || props=""
  if [[ -n "$props" ]]; then
    say "whitelist: white-list=$(_da_prop white-list "$props") enforce-whitelist=$(_da_prop enforce-whitelist "$props") online-mode=$(_da_prop online-mode "$props")"
  else say "whitelist: server.properties не прочитан"; fi
  props=""
  if names="$(_da_wl_names)"; then
    n="$(grep -c . <<<"$names" || true)"; say "whitelist.json: записей $n: $(paste -sd, - <<<"$names" | sed 's/,/, /g')"
  else say "whitelist.json: не прочитан"; fi
  if _da_mt_find; then
    _da_mt_state
    say "техработы: плагин=${MT_JAR:-не найден} каталог=${MT_DIR:--} ключ=${MT_KEY:--} значение=$MT_VAL команды=${MT_CMD_ON:+есть}${MT_CMD_ON:-нет (профиль неизвестен)}"
  else say "техработы: каталог /plugins не прочитан"; fi
  if slp="$(ptero_slp 2>/dev/null)"; then
    local v="${slp##* version=}" m; n="${slp#players=}"; n="${n%% *}"; m="${slp#* max=}"; m="${m%% *}"
    say "онлайн: $n из $m"
    if ptero_slp_maintenance "$v"; then say "slp: версия указывает на техработы/whitelist (version=$v)"; else say "slp: version=$v (признаков техработ нет)"; fi
  else say "онлайн: SLP не ответил"; fi
  owner=""; (( NO_OWNER == 1 )) || owner="$(_da_owner_nick)"
  say "ник владельца (MinecraftAccount тестового игрока): ${owner:-не найден (пропущен)}"
  if [[ -f "$DA_STATE" ]]; then say "state: есть (STATUS=$(_da_state_get STATUS), открыт $(_da_state_get OPENED_AT)); для возврата - --restore"; else say "state: нет (стенд не открыт)"; fi
  exit 0
}

do_open() {
  export PTERO_ALLOW_WRITE=1
  ptero_init || exit 1
  _da_lock || exit $?
  [[ "$(ptero_state 2>/dev/null)" == running ]] || { say "ОТКАЗ: сервер не запущен (whitelist add работает через консоль); запустите сервер и повторите"; exit 4; }
  local props owner nick targets=() lc seen=" " pre prelc names bak out rc
  props="$(ptero_file_read /server.properties 2>/dev/null)" || { say "ОШИБКА: server.properties не прочитан"; exit 1; }
  local p_wl p_enf; p_wl="$(_da_prop white-list "$props")"; p_enf="$(_da_prop enforce-whitelist "$props")"; props=""
  names="$(_da_wl_names)" || { say "ОШИБКА: whitelist.json не прочитан"; exit 1; }
  pre="$(paste -sd, - <<<"$names")"; prelc="$(_da_lc "$pre")"

  owner=""; (( NO_OWNER == 1 )) || owner="$(_da_owner_nick)"
  say "ник владельца: ${owner:-не найден (пропущен)}"
  for nick in ${NICKS[@]+"${NICKS[@]}"} ${owner:+"$owner"}; do
    lc="$(_da_lc "$nick")"; [[ "$seen" == *" $lc "* ]] && continue; seen+="$lc "; targets+=("$nick")
  done
  [[ ${#targets[@]} -gt 0 ]] || { say "нет ников для добавления"; exit 2; }

  _da_mt_find || { say "ОШИБКА: /plugins не прочитан"; exit 1; }
  _da_mt_state
  say "техработы: плагин=${MT_JAR:-не найден} ключ=${MT_KEY:--} значение=$MT_VAL"

  # бэкапы до любых изменений
  out="$(ptero_backup /whitelist.json)"; rc=$?
  if (( rc == 0 )); then bak="${out##*/}"; say "$out"; elif (( rc == 10 )); then bak="-"; say "whitelist.json нет: копировать нечего"; else say "ОШИБКА: бэкап whitelist.json не сделан"; exit 1; fi
  local mt_bak="-"
  if [[ "$MT_VAL" == true && -n "$MT_DIR" ]]; then
    out="$(ptero_backup "/plugins/$MT_DIR/config.yml")"; rc=$?
    (( rc == 0 )) && { mt_bak="${out##*/}"; say "$out"; } || { (( rc == 10 )) || { say "ОШИБКА: бэкап config плагина техработ не сделан"; exit 1; }; }
  fi

  # state ДО изменений: прежние значения сохраняются при повторном --open
  local added=() old_added old_pre
  old_added="$(_da_state_get WL_ADDED)"; old_pre="$(_da_state_get WL_PRE)"
  for nick in "${targets[@]}"; do
    lc="$(_da_lc "$nick")"
    [[ ",$prelc," == *",$lc,"* ]] && continue
    added+=("$nick")
  done
  local all_added="$old_added"
  for nick in ${added[@]+"${added[@]}"}; do [[ ",$(_da_lc "$all_added")," == *",$(_da_lc "$nick"),"* ]] || all_added="${all_added:+$all_added,}$nick"; done
  if [[ -f "$DA_STATE" && "$(_da_state_get STATUS)" == open ]]; then
    _da_state_write STATE_VERSION=1 STATUS=open "OPENED_AT=$(_da_state_get OPENED_AT)" "PROP_WHITELIST=$(_da_state_get PROP_WHITELIST)" "PROP_ENFORCE=$(_da_state_get PROP_ENFORCE)" \
      "MT_PLUGIN=$(_da_state_get MT_PLUGIN)" "MT_DIR=$(_da_state_get MT_DIR)" "MT_KEY=$(_da_state_get MT_KEY)" "MT_WAS=$(_da_state_get MT_WAS)" \
      "MT_CMD_ON=$(_da_state_get MT_CMD_ON)" "MT_CMD_RELOAD=$(_da_state_get MT_CMD_RELOAD)" "WL_PRE=$old_pre" "WL_ADDED=$all_added" \
      "WL_BAK=$(_da_state_get WL_BAK)" "MT_BAK=$(_da_state_get MT_BAK)" || { say "ОШИБКА: state не записан"; exit 1; }
  else
    _da_state_write STATE_VERSION=1 STATUS=open "OPENED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)" "PROP_WHITELIST=$p_wl" "PROP_ENFORCE=$p_enf" \
      "MT_PLUGIN=${MT_JAR:--}" "MT_DIR=${MT_DIR:--}" "MT_KEY=${MT_KEY:--}" "MT_WAS=$MT_VAL" "MT_CMD_ON=$MT_CMD_ON" "MT_CMD_RELOAD=$MT_CMD_RELOAD" \
      "WL_PRE=$pre" "WL_ADDED=$all_added" "WL_BAK=$bak" "MT_BAK=$mt_bak" || { say "ОШИБКА: state не записан"; exit 1; }
  fi
  say "state записан: $DA_STATE (600)"

  # whitelist add
  for nick in ${added[@]+"${added[@]}"}; do ptero_command "whitelist add $nick" || warn "команда whitelist add $nick не принята"; done
  for nick in "${targets[@]}"; do
    if _da_wait 8 _da_has_nick "$nick"; then
      if [[ ",$prelc," == *",$(_da_lc "$nick"),"* ]]; then say "whitelist: $nick уже был (не менялся)"
      else say "whitelist: $nick добавлен"; ptero_journal "/whitelist.json" "whitelist: $nick" "absent" "added"; fi
    else warn "ник $nick не появился в whitelist.json"; fi
  done

  # техработы
  if [[ "$MT_VAL" == true ]]; then
    if [[ -z "$MT_CMD_OFF" && -z "$MT_CMD_RELOAD" ]]; then warn "техработы включены, но профиль команд плагина ${MT_JAR:-?} неизвестен: выключите вручную"
    elif _da_mt_set false; then say "техработы: выключены"; ptero_journal "/plugins/$MT_DIR/config.yml" "$MT_KEY" "true" "false"
    else warn "техработы не удалось выключить или подтвердить"; fi
  elif [[ "$MT_VAL" == unknown ]]; then
    local slp; slp="$(ptero_slp 2>/dev/null)" && ptero_slp_maintenance "${slp##* version=}" && warn "состояние техработ в config не определено, а SLP показывает признаки техработ: проверьте вручную"
  else say "техработы: уже выключены (не менялись)"; fi
  (( DA_WARN == 0 )) && say "OPEN: готово" || say "OPEN: готово с предупреждениями"
  exit $(( DA_WARN == 0 ? 0 : 3 ))
}

do_restore() {
  export PTERO_ALLOW_WRITE=1
  [[ -f "$DA_STATE" && "$(_da_state_get STATUS)" == open ]] || { say "state: нечего восстанавливать (нет открытого state)"; exit 0; }
  ptero_init || exit 1
  _da_lock || exit $?
  [[ "$(ptero_state 2>/dev/null)" == running ]] || { say "ОТКАЗ: сервер не запущен (whitelist remove работает через консоль); запустите и повторите"; exit 4; }
  local added pre mt_was nick lc props p_wl p_enf s_wl s_enf rc_all=0 names
  added="$(_da_state_get WL_ADDED)"; pre="$(_da_state_get WL_PRE)"; mt_was="$(_da_state_get MT_WAS)"
  MT_DIR="$(_da_state_get MT_DIR)"; [[ "$MT_DIR" == "-" ]] && MT_DIR=""
  MT_KEY="$(_da_state_get MT_KEY)"; [[ "$MT_KEY" == "-" ]] && MT_KEY=""
  MT_CMD_ON="$(_da_state_get MT_CMD_ON)"; MT_CMD_RELOAD="$(_da_state_get MT_CMD_RELOAD)"; MT_CMD_OFF=""
  say "state: открыт $(_da_state_get OPENED_AT); добавлено нами: ${added:--}; техработы были: ${mt_was:-?}"

  # whitelist remove: только добавленные нами
  local IFS_OLD="$IFS"
  local arr=(); IFS=, read -r -a arr <<<"$added"; IFS="$IFS_OLD"
  for nick in ${arr[@]+"${arr[@]}"}; do
    [[ "$nick" =~ ^[A-Za-z0-9_]{3,16}$ ]] || { warn "в state недопустимый ник пропущен"; continue; }
    if _da_has_nick "$nick"; then
      ptero_command "whitelist remove $nick" || warn "команда whitelist remove $nick не принята"
      if _da_wait 8 _da_no_nick "$nick"; then say "whitelist: $nick убран"; ptero_journal "/whitelist.json" "whitelist: $nick" "added" "removed"
      else warn "ник $nick остался в whitelist.json"; fi
    else say "whitelist: $nick уже отсутствует"; fi
  done

  # техработы
  if [[ "$mt_was" == true ]]; then
    if [[ -n "$MT_DIR" ]] && _da_mt_state && [[ "$MT_VAL" == true ]]; then say "техработы: уже включены"
    elif _da_mt_set true; then say "техработы: включены обратно"; ptero_journal "/plugins/$MT_DIR/config.yml" "$MT_KEY" "false" "true"
    else warn "техработы не удалось включить или подтвердить"; fi
  fi

  # сверка со state
  say "-- сверка со state: проверка | ожидалось | получено | итог --"
  names="$(_da_wl_names)" || { warn "whitelist.json не прочитан при сверке"; names=""; }
  local nl; nl="$(_da_lc "$(paste -sd, - <<<"$names")")"
  local missing="" leftover=""
  IFS=, read -r -a arr <<<"$pre"; IFS="$IFS_OLD"
  for nick in ${arr[@]+"${arr[@]}"}; do [[ ",$nl," == *",$(_da_lc "$nick"),"* ]] || missing="${missing:+$missing,}$nick"; done
  IFS=, read -r -a arr <<<"$added"; IFS="$IFS_OLD"
  for nick in ${arr[@]+"${arr[@]}"}; do [[ ",$nl," == *",$(_da_lc "$nick"),"* ]] && leftover="${leftover:+$leftover,}$nick"; done
  if [[ -z "$missing" ]]; then say "whitelist прежние ники на месте | все | все | OK"; else say "whitelist прежние ники на месте | все | нет: $missing | DIFF"; rc_all=1; fi
  if [[ -z "$leftover" ]]; then say "whitelist добавленные нами убраны | нет | нет | OK"; else say "whitelist добавленные нами убраны | нет | остались: $leftover | DIFF"; rc_all=1; fi
  local extra=""
  IFS=, read -r -a arr <<<"$nl"; IFS="$IFS_OLD"
  for nick in ${arr[@]+"${arr[@]}"}; do [[ -n "$nick" && ",$(_da_lc "$pre")," != *",$nick,"* ]] && extra="${extra:+$extra,}$nick"; done
  [[ -z "$extra" ]] || say "whitelist ники, появившиеся не нами | - | $extra | INFO (не трогаем)"
  props="$(ptero_file_read /server.properties 2>/dev/null)" || props=""
  p_wl="$(_da_prop white-list "$props")"; p_enf="$(_da_prop enforce-whitelist "$props")"; props=""
  s_wl="$(_da_state_get PROP_WHITELIST)"; s_enf="$(_da_state_get PROP_ENFORCE)"
  if [[ "$p_wl" == "$s_wl" ]]; then say "server.properties white-list | $s_wl | $p_wl | OK"; else say "server.properties white-list | $s_wl | ${p_wl:-?} | DIFF"; rc_all=1; fi
  if [[ "$p_enf" == "$s_enf" ]]; then say "server.properties enforce-whitelist | $s_enf | $p_enf | OK"; else say "server.properties enforce-whitelist | $s_enf | ${p_enf:-?} | DIFF"; rc_all=1; fi
  if [[ "$mt_was" == true || "$mt_was" == false ]]; then
    _da_mt_find >/dev/null 2>&1; MT_DIR="${MT_DIR:-$(_da_state_get MT_DIR)}"; [[ "$MT_DIR" == "-" ]] && MT_DIR=""
    _da_mt_state
    if [[ "$MT_VAL" == "$mt_was" ]]; then say "техработы | $mt_was | $MT_VAL | OK"; else say "техработы | $mt_was | $MT_VAL | DIFF"; rc_all=1; fi
  else say "техработы | unknown | не менялись | OK"; fi

  if (( rc_all == 0 && DA_WARN == 0 )); then
    local done_name="$DA_STATE.restored-$(date -u +%Y%m%dT%H%M%SZ)"
    mv -f -- "$DA_STATE" "$done_name" && say "RESTORE: готово; state сохранён как $(basename "$done_name")"
    ptero_journal "$DA_STATE" "state" "open" "restored"
    exit 0
  fi
  say "RESTORE: есть расхождения или предупреждения; state оставлен для повторного --restore"
  exit 3
}

case "$MODE" in
  status) do_status ;;
  open) do_open ;;
  restore) do_restore ;;
esac
