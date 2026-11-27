#!/usr/bin/env bash
export LC_ALL=C   # проверки [A-Za-z] и регэкспы не зависят от локали
# Библиотека доступа к Client API Pterodactyl для ОДНОГО сервера dev-srv (подключать через `source`; запускается ТОЛЬКО на VDS).
#
# Учётные данные: файл PTERO_CRED_FILE (по умолчанию /home/twomc/pterodactyl-credentials.txt, права 600, KEY=VALUE:
# PANEL_URL, SERVER_UUID, CLIENT_API_KEY). Файл подключается через `.` внутри ptero_init; значения никуда не печатаются.
# PANEL_URL указывает на /account/api; база Client API = PANEL_URL без «/account/api» + «/api/client».
#
# Защита (решение владельца, master prompt v3: на dev-srv - только SERVER_UUID - разрешены консольные команды, замена конфигов,
# перезапуск и смена режима техработ; запрещено удалять мир и данные игроков, ставить/удалять сторонние плагины, трогать другие серверы):
#  - Любой запрос строится как $PTERO_SRV$суффикс, где PTERO_SRV = <база>/servers/<SERVER_UUID>: другой сервер и корневой
#    список серверов (GET /api/client) недостижимы. Суффикс проверяется по белому списку символов, «..» запрещены. Это ЖЁСТКИЙ guard.
#  - Не-GET методы разрешены только при PTERO_ALLOW_WRITE=1; без него функции записи (file_write, upload, power, command) отказывают.
#  - ЭНДПОИНТЫ (белый список): "", /resources, /websocket, /startup, /network/allocations, /files/{list,contents,upload,write,create-folder,
#    chmod,rename}, /power, /command. Эндпоинтов удаления файлов (/files/delete), копирования, архивов и распаковки НЕТ: мир и данные игроков
#    нельзя удалить через эти функции в принципе.
#  - ПУТИ (всё остальное - отказ, даже при PTERO_ALLOW_WRITE=1; сначала явный запрет, потом белый список):
#      запрет (запись, загрузка, переименование): world*/ (любой регистр, любой уровень), playerdata, stats, advancements, region, level.dat,
#        session.lock в корне; plugins/*.jar, кроме TwoMCBridge*;
#      write: /server.properties, /whitelist.json, /ops.json, /plugins/<каталог>/config.yml (только config.yml), /plugins/TwoMCBridge/bridge-key.txt;
#        каждый вариант - и с суффиксом .bak-<UTC> (копия); для Bridge ещё .disabled-<UTC>;
#      upload: только /plugins/TwoMCBridge*.jar; rename: только TwoMCBridge*.jar -> *.jar.disabled-<UTC> и файлы Bridge -> *.disabled-<UTC>;
#      mkdir: только /plugins + TwoMCBridge; chmod: только 600 для bridge-key.txt[.bak-<UTC>];
#      list: /, /plugins, /plugins/<каталог>; read: критичные файлы выше (кроме bridge-key.txt), version_history.json, logs/latest.log;
#      fetch (в локальный файл 600, для бэкапа): критичные файлы выше, включая bridge-key.txt (в stdout не выводится никогда).
#    БЭКАП: первая запись в критичный файл за запуск требует копии <файл>.bak-<UTC> на панели (ptero_backup; делается автоматически; нет копии - нет записи).
#  - ПИТАНИЕ: restart, stop, start, kill. restart/stop/kill (и консольные stop/restart) - только после успешного ptero_restart_guard
#    (игроки, say, 60 с) в этом же процессе; осознанное исключение - PTERO_POWER_NOGUARD=1 (пишется в журнал).
#  - КОНСОЛЬ: санитизация вместо белого списка команд (_pt_cmd_allowed): одна строка, печатный ASCII (0x20-0x7E, без управляющих символов и
#    переводов строк), длина <= 256, JSON-экранирование; плюс явный ДЕНАЙЛИСТ (_pt_cmd_denied, с причинами; deop и op НЕ запрещены).
#  - ЖУРНАЛ: каждая изменяющая операция дописывает строку в /home/twomc/bridge-dev-srv.changes.log (600):
#    время UTC | файл/команда | параметр | было | стало. Без секретов (содержимое ключа не пишется, длинные hex/токены и ключ панели вычищаются).
#    Не удалось записать журнал - изменяющая операция не выполняется.
#  - Тело последнего ответа (PTERO_BODY) очищается сразу после использования (_pt_wipe).
#  - Ключ API передаётся в curl через конфиг из process substitution (не попадает в argv/ps), signed URL загрузки - так же.
#    Ключ, websocket-токен, signed URL, тела ответов с ними не печатаются; stderr curl отбрасывается (в нём бывает URL).
#  - Ничего не читает из stdin (все curl/docker с </dev/null), чтобы не съесть скрипт, поданный через `bash -s`.
# Зависимости на VDS: bash, curl, sed, grep, mktemp; для players_online/console_tail - docker и образ node:22 (встроенный WebSocket).
# Печатаемые функции пишут только несекретное. Коды возврата: 0 успех, 1 отказ/ошибка API, 2 неверные аргументы.

# Тестовый режим STAND_TEST=1 разрешён ТОЛЬКО если PTERO_TEST_ROOT - существующий каталог (не ссылка, не /home/twomc*), в пути которого есть
# сегмент scratchpad, tmp или temp, внутри лежит маркер-файл .ptero-test-root, а PTERO_CRED_FILE и PTERO_CHANGES_LOG - внутри этого каталога.
# Иначе STAND_TEST сбрасывается в 0, пути остаются боевыми, а ptero_init отказывает (_PT_REFUSED). Переменные PTERO_POWER_NOGUARD и
# PTERO_GUARD_WAIT1/2 действуют только в разрешённом тестовом режиме (_PT_TEST=1).
_PT_TEST=0; _PT_REFUSED=""
if [[ "${STAND_TEST:-0}" == 1 ]]; then
  _pt_tr="${PTERO_TEST_ROOT:-}"; _pt_trl="${_pt_tr,,}"
  if [[ "$_pt_tr" == /* && "$_pt_tr" != *..* && "$_pt_tr" != /home/twomc* && -d "$_pt_tr" && ! -L "$_pt_tr" && -f "$_pt_tr/.ptero-test-root" \
        && "$_pt_trl" =~ /(scratchpad|tmp|temp)(/|$) \
        && "${PTERO_CRED_FILE:-}" == "$_pt_tr"/* && "${PTERO_CRED_FILE:-}" != *..* \
        && "${PTERO_CHANGES_LOG:-}" == "$_pt_tr"/* && "${PTERO_CHANGES_LOG:-}" != *..* ]]; then
    _PT_TEST=1
  else
    _PT_REFUSED="STAND_TEST=1 отклонён: нужен PTERO_TEST_ROOT (каталог внутри scratchpad/tmp с маркером .ptero-test-root; не /home/twomc) и PTERO_CRED_FILE/PTERO_CHANGES_LOG внутри него"
    STAND_TEST=0; echo "ptero: ОТКАЗ: $_PT_REFUSED" >&2
  fi
  unset _pt_tr _pt_trl
fi
if [[ "$_PT_TEST" == 1 ]]; then PTERO_CRED_FILE="$PTERO_CRED_FILE"; else PTERO_CRED_FILE=/home/twomc/pterodactyl-credentials.txt; fi
# Имя единственного разрешённого сервера: UUID в репозитории не хранится, сервер из учётных данных проверяется по имени (ptero_init). Окружением не переопределяется.
_PT_EXPECT_NAME=dev-srv

# Проверка файла с секретами перед подключением: обычный файл (не ссылка), права РОВНО 600, владелец - текущий пользователь; иначе отказ.
twomc_secure_file() {
  local f="$1" perm own
  [[ -f "$f" && ! -L "$f" ]] || { echo "ОТКАЗ: $f не обычный файл (или ссылка)" >&2; return 1; }
  perm="$(stat -c %a -- "$f" 2>/dev/null || echo ?)"; own="$(stat -c %u -- "$f" 2>/dev/null || echo ?)"
  [[ "$perm" == 600 ]] || { echo "ОТКАЗ: права $f: $perm (нужно ровно 600; chmod 600)" >&2; return 1; }
  [[ "$own" == "$(id -u)" ]] || { echo "ОТКАЗ: владелец $f не текущий пользователь" >&2; return 1; }
  return 0
}
PTERO_NODE_IMAGE="${PTERO_NODE_IMAGE:-node:24.18.0-alpine}"   # уже есть на VDS; нужен node 22+ со встроенным WebSocket
PTERO_NODE_IMAGE_MIRROR="${PTERO_NODE_IMAGE_MIRROR:-node:22.21.1-alpine}"
PTERO_ALLOW_WRITE="${PTERO_ALLOW_WRITE:-0}"
PTERO_HTTP=""   # код последнего HTTP-ответа
PTERO_BODY=""   # временный файл с телом последнего ответа (создаётся с umask 077, удаляется ptero_cleanup)
PTERO_TMPS=()

ptero_die() { echo "ptero: $*" >&2; return 1; }

ptero_cleanup() {
  local f
  for f in "${PTERO_TMPS[@]:-}"; do [[ -n "$f" ]] && rm -f -- "$f"; done
  PTERO_TMPS=()
}

_pt_wipe() { [[ -n "${PTERO_BODY:-}" && -f "$PTERO_BODY" ]] && : > "$PTERO_BODY"; return 0; }

_pt_mktemp() { _PT_LAST="$(umask 077; mktemp "${TMPDIR:-/tmp}/ptero.XXXXXX")" || return 1; PTERO_TMPS+=("$_PT_LAST"); }

ptero_init() {
  [[ -z "$_PT_REFUSED" ]] || { ptero_die "$_PT_REFUSED"; return 1; }
  PTERO_SRV=""   # до успешной проверки имени сервера ни один запрос не уходит (_pt_req требует PTERO_SRV)
  if [[ ! -e "$PTERO_CRED_FILE" ]]; then
    ptero_die "файла учётных данных нет ($PTERO_CRED_FILE): скрипт работает только на VDS; запускайте через run-on-vds.sh script <скрипт> ..."; return 1
  fi
  [[ -r "$PTERO_CRED_FILE" ]] || { ptero_die "файл учётных данных есть, но нет доступа на чтение (пользователь/права): запускайте от пользователя twomc на VDS через run-on-vds.sh script <скрипт> ..."; return 1; }
  twomc_secure_file "$PTERO_CRED_FILE" || { ptero_die "файл учётных данных отвергнут (нужны права 600 и владелец - текущий пользователь)"; return 1; }
  PANEL_URL=""; SERVER_UUID=""; CLIENT_API_KEY=""
  # shellcheck disable=SC1090
  . "$PTERO_CRED_FILE"
  _PT_EXPECT_NAME=dev-srv   # файл учётных данных не может подменить константу
  [[ -n "$PANEL_URL" && -n "$SERVER_UUID" && -n "$CLIENT_API_KEY" ]] || { ptero_die "в файле нет PANEL_URL, SERVER_UUID или CLIENT_API_KEY"; return 1; }
  [[ "$SERVER_UUID" =~ ^[0-9a-fA-F-]{8,36}$ ]] || { ptero_die "SERVER_UUID неверного формата"; return 1; }
  [[ "$PANEL_URL" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._/-]*)?$ ]] || { ptero_die "PANEL_URL должен быть http(s)://хост[/путь]"; return 1; }
  [[ "$PANEL_URL" == https://* ]] || echo "ptero: предупреждение: панель по http, ключ API идёт открытым текстом (допустимо только внутри доверенной сети)" >&2
  local base="${PANEL_URL%/}"
  base="${base%/account/api}"
  PTERO_ORIGIN="${base%/}"
  PTERO_BASE="${PTERO_ORIGIN}/api/client"
  _pt_mktemp || return 1; PTERO_BODY="$_PT_LAST"
  PTERO_SRV="$PTERO_BASE/servers/$SERVER_UUID"
  # GUARD имени сервера: GET деталей сервера (единственный запрос до проверки), attributes.name обязан быть dev-srv, иначе отказ.
  local nm; _pt_req GET "" || { PTERO_SRV=""; return 1; }
  if [[ "$PTERO_HTTP" == "200" ]] && grep -q '"object":"server"' "$PTERO_BODY"; then
    nm="$(grep -o '"name":"[^"]*"' "$PTERO_BODY" | head -n1 | sed 's/^"name":"//; s/"$//')"
  else nm=""; fi
  _pt_wipe
  if [[ "$nm" != "$_PT_EXPECT_NAME" ]]; then
    PTERO_SRV=""; CLIENT_API_KEY=""
    ptero_die "ОТКАЗ: имя сервера по SERVER_UUID не $_PT_EXPECT_NAME (HTTP $PTERO_HTTP); другие серверы запрещены, дальнейшие запросы не выполняются"; return 1
  fi
  return 0
}

# _pt_auth_cfg: конфиг curl с заголовком Authorization (для -K <(...)); ключ не попадает в argv.
_pt_auth_cfg() { printf 'header = "Authorization: Bearer %s"\nheader = "Accept: application/vnd.pterodactyl.v1+json"\n' "$CLIENT_API_KEY"; }

_pt_check_suffix() {
  [[ -z "$1" ]] && return 0   # пустой суффикс = сам сервер dev-srv (GET /servers/<UUID>)
  [[ "$1" =~ ^/[A-Za-z0-9._/?=\&%-]*$ && "$1" != *..* ]] || { ptero_die "недопустимый суффикс запроса"; return 1; }
}

# Белый список эндпоинтов (по части суффикса до «?»).
_pt_check_endpoint() {
  case "${1%%\?*}" in
    ""|/resources|/websocket|/startup|/network/allocations|/files/list|/files/contents|/files/upload|/files/write|/files/create-folder|/files/chmod|/files/rename|/power|/command) return 0 ;;
    *) ptero_die "эндпоинт не разрешён: ${1%%\?*}"; return 1 ;;
  esac
}

# Политика путей (см. шапку). _pt_path_allowed <list|read|fetch|backup|write|upload> <путь>: сначала явный запрет, затем белый список.
_PT_TS_RE='[0-9]{8}T[0-9]{6}Z(-[0-9]{5})?'   # UTC + необязательный суффикс -<мс><счётчик> (копии в одну секунду не затирают друг друга)
_PT_PLUGDIR_RE='[A-Za-z0-9][A-Za-z0-9._-]{0,63}'

# Явный запрет: мир, данные игроков, чужие jar. Печатает причину и возвращает 0, если путь запрещён.
_pt_path_denied() {
  local lp="${1,,}"
  if [[ "$lp" =~ (^|/)world[^/]*(/|$) ]]; then echo "мир (world*): мир удалять и менять нельзя"; return 0; fi
  if [[ "$lp" =~ ^/(playerdata|stats|advancements|region|level\.dat[^/]*|session\.lock)(/|$) ]]; then echo "данные игроков или мира"; return 0; fi
  if [[ "$lp" =~ ^/plugins/[^/]+\.jar($|\.) && ! "$lp" =~ ^/plugins/twomcbridge[a-z0-9._-]*\.jar ]]; then echo "сторонний плагин (jar): ставить, менять и убирать нельзя"; return 0; fi
  return 1
}

# Критичный файл: обычный (не .bak/.disabled) путь, разрешённый для записи; для него обязателен бэкап перед записью.
_pt_critical_path() {
  local p="$1" re
  case "$p" in /server.properties|/whitelist.json|/ops.json|/plugins/TwoMCBridge/bridge-key.txt) return 0 ;; esac
  re="^/plugins/$_PT_PLUGDIR_RE/config\.yml\$"
  [[ "$p" =~ $re && "$p" != /plugins/*.jar/* ]] && return 0
  return 1
}

_pt_path_allowed() {
  local op="$1" p="$2" re reason base
  [[ "$p" == "/" ]] || p="${p%/}"
  [[ -n "$p" ]] || p="/"
  if [[ "$p" == *//* || "$p" =~ /\. ]]; then ptero_die "путь не в белом списке ($op): пустой или скрытый сегмент"; return 1; fi
  case "$op" in
    write|upload|backup)
      if reason="$(_pt_path_denied "$p")"; then ptero_die "путь запрещён ($op): $p - $reason"; return 1; fi ;;
  esac
  case "$op" in
    list)
      [[ "$p" == / || "$p" == /plugins ]] && return 0
      re="^/plugins/$_PT_PLUGDIR_RE\$"; [[ "$p" =~ $re && "$p" != *.jar ]] && return 0 ;;
    read)
      case "$p" in /version_history.json|/logs/latest.log|/plugins/TwoMCBridge/config.yml) return 0 ;; esac
      [[ "$p" != */bridge-key.txt ]] && _pt_critical_path "$p" && return 0 ;;
    fetch|backup) _pt_critical_path "$p" && return 0 ;;
    upload)
      re="^/plugins/TwoMCBridge[A-Za-z0-9._-]*\.jar\$"; [[ "$p" =~ $re ]] && return 0 ;;
    write)
      _pt_critical_path "$p" && return 0
      re="^(/.+)\.bak-$_PT_TS_RE\$"
      if [[ "$p" =~ $re ]]; then base="${BASH_REMATCH[1]}"; _pt_critical_path "$base" && return 0; fi
      re="^/plugins/TwoMCBridge/(config\.yml|bridge-key\.txt)\.disabled-$_PT_TS_RE\$"; [[ "$p" =~ $re ]] && return 0 ;;
  esac
  ptero_die "путь не в белом списке ($op): $p"; return 1
}

# _pt_req <METHOD> <суффикс> [аргументы curl...]: PTERO_HTTP и PTERO_BODY. Всегда 0, если запрос ушёл; смотрите PTERO_HTTP.
# Тело ответа не-GET запросов (записи) сразу очищается: нужен только код.
_pt_req() {
  local method="$1" suffix="$2"; shift 2
  [[ -n "${PTERO_SRV:-}" ]] || { ptero_die "не вызван ptero_init"; return 1; }
  _pt_check_suffix "$suffix" || return 1
  _pt_check_endpoint "$suffix" || return 1
  case "$method" in
    GET) ;;
    POST) [[ "$PTERO_ALLOW_WRITE" == "1" ]] || { ptero_die "запись запрещена (PTERO_ALLOW_WRITE!=1): $method $suffix"; return 1; } ;;
    *) ptero_die "метод $method не разрешён"; return 1 ;;
  esac
  : > "$PTERO_BODY"
  PTERO_HTTP="$(curl -sS --max-time "${PTERO_TIMEOUT:-60}" -o "$PTERO_BODY" -w '%{http_code}' -X "$method" \
    -K <(_pt_auth_cfg) "$@" "$PTERO_SRV$suffix" </dev/null 2>/dev/null)" || PTERO_HTTP="000"
  [[ "$method" == GET ]] || _pt_wipe
  return 0
}

# Извлечение строкового поля из JSON без python: ptero_json_str <файл> <имя поля> (первое вхождение).
ptero_json_str() { sed -n 's/.*"'"$2"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$1" | head -n1; }

_pt_urlenc_path() { local s="$1"; s="${s//\//%2F}"; printf '%s' "$s"; }
_pt_check_path() { [[ "$1" =~ ^/[A-Za-z0-9._/-]*$ && "$1" != *..* ]] || { ptero_die "недопустимый путь на сервере: $1"; return 1; }; }

# ---- чтение ----

# status: печатает «HTTP <код> state=<current_state>».
ptero_status() {
  _pt_req GET /resources || return 1
  local st; st="$(ptero_json_str "$PTERO_BODY" current_state)"; _pt_wipe
  echo "HTTP $PTERO_HTTP state=${st:-?}"
  [[ "$PTERO_HTTP" == "200" ]]
}

# state: только current_state на stdout (для ожидания).
ptero_state() {
  _pt_req GET /resources || return 1
  local st=""; [[ "$PTERO_HTTP" == "200" ]] && st="$(ptero_json_str "$PTERO_BODY" current_state)"
  _pt_wipe
  [[ "$PTERO_HTTP" == "200" ]] || return 1
  printf '%s\n' "$st"
}

# files_list <каталог>: имена и признак каталога («d name» / «- name»); только имена. Каталог - из белого списка (/, /plugins).
ptero_files_list() {
  local dir="${1:-/}"; _pt_check_path "$dir" || return 2
  _pt_path_allowed list "$dir" || return 2
  _pt_req GET "/files/list?directory=$(_pt_urlenc_path "$dir")" || return 1
  [[ "$PTERO_HTTP" == "200" ]] || { _pt_wipe; echo "HTTP $PTERO_HTTP"; return 1; }
  # Разбор по записям: attributes содержит name и is_file; порядок полей у Wings: name, mode, mode_bits, size, is_file, ...
  grep -o '"name":"[^"]*"\|"is_file":\(true\|false\)' "$PTERO_BODY" | paste -sd' ' - | sed 's/"name":"/\n/g' \
    | sed -n 's/^\([^"]*\)" "is_file":true.*/- \1/p; s/^\([^"]*\)" "is_file":false.*/d \1/p'
  _pt_wipe
}

# file_read <путь>: содержимое файла в stdout. Только белый список read (bridge-key.txt сюда не входит никогда).
ptero_file_read() {
  _pt_check_path "$1" || return 2
  _pt_path_allowed read "$1" || return 2
  _pt_req GET "/files/contents?file=$(_pt_urlenc_path "$1")" || return 1
  [[ "$PTERO_HTTP" == "200" ]] || { _pt_wipe; echo "HTTP $PTERO_HTTP" >&2; return 1; }
  cat "$PTERO_BODY"
  _pt_wipe
}

# file_fetch <путь> <локальный-файл>: содержимое в локальный файл с правами 600 (для бэкапа config.yml и bridge-key.txt); в stdout ничего.
ptero_file_fetch() {
  _pt_check_path "$1" || return 2
  _pt_path_allowed fetch "$1" || return 2
  [[ -n "$2" ]] || return 2
  _pt_req GET "/files/contents?file=$(_pt_urlenc_path "$1")" || return 1
  [[ "$PTERO_HTTP" == "200" ]] || { _pt_wipe; echo "HTTP $PTERO_HTTP" >&2; return 1; }
  ( umask 077; cat "$PTERO_BODY" > "$2" ) || { _pt_wipe; return 1; }
  chmod 600 "$2" 2>/dev/null
  _pt_wipe
}

# file_exists <путь>: 0 если файл есть в каталоге (по списку; каталог - из белого списка list).
ptero_file_exists() {
  local dir; dir="$(dirname "$1")"; [[ "$dir" == "." ]] && dir="/"
  ptero_files_list "$dir" 2>/dev/null | grep -qxF -- "- $(basename "$1")"
}

# startup_vars: имена переменных запуска; значения - только для белого списка несекретных.
ptero_startup_vars() {
  _pt_req GET /startup || return 1
  [[ "$PTERO_HTTP" == "200" ]] || { _pt_wipe; echo "HTTP $PTERO_HTTP"; return 1; }
  local pairs name val
  pairs="$(grep -o '"env_variable":"[^"]*"\|"server_value":"[^"]*"' "$PTERO_BODY" | paste -sd' ' - | sed 's/"env_variable":"/\n/g' | sed -n 's/^\([^"]*\)" "server_value":"\([^"]*\)".*/\1=\2/p')"
  while IFS='=' read -r name val; do
    [[ -n "$name" ]] || continue
    case "$name" in
      MINECRAFT_VERSION|SERVER_JARFILE|BUILD_NUMBER|MC_VERSION|VERSION|DL_VERSION|JARFILE|SERVER_PORT|MAX_PLAYERS|MEMORY) echo "var $name=$val" ;;
      *) echo "var $name=<скрыто>" ;;
    esac
  done <<<"$pairs"
  pairs=""
  local img; img="$(ptero_json_str "$PTERO_BODY" docker_image)"; [[ -n "$img" ]] && echo "docker_image=$img"
  grep -o '"docker_images":{[^}]*}' "$PTERO_BODY" | head -n1 | sed 's/^/images: /'
  _pt_wipe
}

# ---- журнал изменений (VDS, 600): время UTC | файл/команда | параметр | было | стало ----
if [[ "${STAND_TEST:-0}" == 1 ]]; then PTERO_CHANGES_LOG="${PTERO_CHANGES_LOG:-/home/twomc/bridge-dev-srv.changes.log}"; else PTERO_CHANGES_LOG=/home/twomc/bridge-dev-srv.changes.log; fi
declare -A _PT_BACKED=()   # путь -> 1: бэкап этого файла в текущем процессе уже сделан
declare -A _PT_PREV=()     # путь -> sha256:<12> прежнего содержимого | absent (для столбца «было»)
_PT_BAK_N=0               # счётчик копий в процессе (часть имени .bak-)
_PT_GUARD_OK=0             # 1 после успешного ptero_restart_guard; сбрасывается после restart/stop/kill

# _pt_jclean: одна строка без управляющих символов и «|», без длинных hex/токенов и ключа панели, не длиннее 160 символов.
_pt_jclean() {
  local s="$1"
  s="$(printf '%s' "$s" | tr -d '[:cntrl:]' | tr '|' '/' | sed -E -e 's/[0-9A-Fa-f]{32,}/<hex>/g' -e 's/[A-Za-z0-9_-]{40,}/<redacted>/g')"
  [[ -n "${CLIENT_API_KEY:-}" ]] && s="${s//"$CLIENT_API_KEY"/<key>}"
  printf '%s' "${s:0:160}"
}

# _pt_journal_ready: журнал можно дописывать (создаётся с правами 600). Без этого изменяющие операции отказывают.
_pt_journal_ready() {
  local d; d="$(dirname "$PTERO_CHANGES_LOG")"
  [[ -d "$d" && ! -L "$PTERO_CHANGES_LOG" ]] || { ptero_die "журнал изменений недоступен (нет каталога или это ссылка): изменяющая операция отменена"; return 1; }
  { ( umask 077; : >> "$PTERO_CHANGES_LOG" ) 2>/dev/null && chmod 600 "$PTERO_CHANGES_LOG" 2>/dev/null; } \
    || { ptero_die "журнал изменений не открывается на запись: изменяющая операция отменена"; return 1; }
}

# ptero_journal <файл|команда> <параметр> <было> <стало>: дописывает строку журнала.
ptero_journal() {
  local ts; ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  ( umask 077; printf '%s | %s | %s | %s | %s\n' "$ts" "$(_pt_jclean "${1:-}")" "$(_pt_jclean "${2:-}")" "$(_pt_jclean "${3:--}")" "$(_pt_jclean "${4:--}")" >> "$PTERO_CHANGES_LOG" ) 2>/dev/null \
    || { ptero_die "не удалось записать строку журнала изменений"; return 1; }
}

# Журнал «до действия»: _pt_jb пишет строку со статусом «начато» ПЕРЕД действием (не записалась - действие не выполняется),
# _pt_je после действия - «выполнено» или «ОШИБКА». Столбец «стало»: <статус>; <значение> [подробности].
_pt_jb() { ptero_journal "$1" "$2" "$3" "начато; ${4:--}"; }
_pt_je() { # <файл|команда> <параметр> <было> <стало> <0 успех|1 ошибка> [подробности]
  local st="выполнено"; [[ "${5:-0}" == 0 ]] || st="ОШИБКА"
  ptero_journal "$1" "$2" "$3" "$st; ${4:--} ${6:-}" || echo "WARN: строка журнала не записана" >&2
}
# PTERO_POWER_NOGUARD действует только в разрешённом тестовом режиме
_pt_noguard() { [[ "$_PT_TEST" == 1 && "${PTERO_POWER_NOGUARD:-0}" == 1 ]]; }

# _pt_symlink_ok <путь>: сам файл (и каталог плагина) в листинге панели не символическая ссылка. Нет каталога/файла (404) - можно; прочая ошибка - отказ.
_pt_symlink_ok() {
  local p="$1" dir base d2 b2 rec n h
  dir="$(dirname "$p")"; base="$(basename "$p")"
  for n in 1 2; do
    _pt_req GET "/files/list?directory=$(_pt_urlenc_path "$dir")" || return 1
    case "$PTERO_HTTP" in
      200) rec="$(sed 's/{"object":"file_object"/\n&/g' "$PTERO_BODY" | grep -F "\"name\":\"$base\"" | head -n1)"; _pt_wipe
           if [[ "$rec" == *'"symlink":true'* ]]; then ptero_die "ОТКАЗ: $p - символическая ссылка (запись запрещена)"; return 1; fi ;;
      404) _pt_wipe; return 0 ;;
      *) h="$PTERO_HTTP"; _pt_wipe; ptero_die "ОТКАЗ: не удалось проверить $dir на ссылки (HTTP $h)"; return 1 ;;
    esac
    # второй проход: сам каталог в родительском листинге (/plugins/<имя> внутри /plugins)
    d2="$(dirname "$dir")"; b2="$(basename "$dir")"
    [[ "$dir" == /plugins/* ]] || return 0
    dir="$d2"; base="$b2"
  done
  return 0
}

# _pt_write_ready: запись разрешена (PTERO_ALLOW_WRITE=1) и журнал открывается.
_pt_write_ready() {
  [[ "$PTERO_ALLOW_WRITE" == "1" ]] || { ptero_die "запись запрещена (PTERO_ALLOW_WRITE!=1): $1"; return 1; }
  _pt_journal_ready
}

# ---- запись (только при PTERO_ALLOW_WRITE=1 и только по политике путей; каждая запись - строка журнала) ----

# ptero_backup <путь критичного файла>: копия <путь>.bak-<UTC> на панели в той же папке. Содержимое идёт через локальный файл 600 (затирается).
# Коды: 0 копия создана; 10 файла нет (копировать нечего); 1 ошибка; 2 путь не критичный. Для bridge-key.txt копии сразу ставится chmod 600
# (не удалось - копия обнуляется и код 1).
ptero_backup() {
  local p="$1" tmp ts bak sha h
  _pt_check_path "$p" || return 2
  _pt_path_allowed backup "$p" || return 2
  _pt_write_ready "backup $p" || return 1
  _pt_mktemp || return 1; tmp="$_PT_LAST"
  _pt_req GET "/files/contents?file=$(_pt_urlenc_path "$p")" || return 1
  case "$PTERO_HTTP" in
    200) ( umask 077; cat "$PTERO_BODY" > "$tmp" ); _pt_wipe ;;
    404) _pt_wipe; _PT_PREV["$p"]=absent; _PT_BACKED["$p"]=1; return 10 ;;
    *) # не 200/404 (панель иногда отвечает 500 на отсутствующий файл): файла нет в листинге каталога -> копировать нечего, иначе отказ
       h="$PTERO_HTTP"; _pt_wipe
       if ptero_file_exists "$p"; then ptero_die "бэкап $p: файл есть, но чтение дало HTTP $h; запись отменена"; return 1; fi
       _PT_PREV["$p"]=absent; _PT_BACKED["$p"]=1; return 10 ;;
  esac
  sha="$(sha256sum -- "$tmp" | cut -c1-12)"; _PT_PREV["$p"]="sha256:$sha"
  local ms; ms="$(date -u +%3N 2>/dev/null)"; [[ "$ms" =~ ^[0-9]{3}$ ]] || ms=000
  ts="$(date -u +%Y%m%dT%H%M%SZ)-$ms$(printf '%02d' $(( ++_PT_BAK_N % 100 )))"; bak="$p.bak-$ts"
  ptero_file_write "$bak" "$tmp" || { : > "$tmp"; return 1; }
  : > "$tmp"
  if [[ "$p" == */bridge-key.txt ]]; then
    if ! ptero_chmod "$(dirname "$p")" "$(basename "$bak")" 600; then
      : > "$tmp"; ptero_file_write "$bak" "$tmp" >/dev/null 2>&1; ptero_die "chmod 600 копии ключа не выполнен: копия обнулена"; return 1
    fi
  fi
  _PT_BACKED["$p"]=1
  echo "бэкап: $bak"
  return 0
}

# _pt_fetch_old <путь> <локальный-файл>: прежнее содержимое для журнала изменений. 0 - прочитано; 10 - файла нет; 1 - ошибка чтения.
_pt_fetch_old() {
  _pt_req GET "/files/contents?file=$(_pt_urlenc_path "$1")" || return 1
  case "$PTERO_HTTP" in
    200) ( umask 077; cat "$PTERO_BODY" > "$2" ) || { _pt_wipe; return 1; }; _pt_wipe; return 0 ;;
    404) _pt_wipe; return 10 ;;
    *) _pt_wipe; ptero_file_exists "$1" && return 1; return 10 ;;
  esac
}

# _pt_names <файл>: значения "name" из whitelist.json/ops.json, по одному в строке, без повторов.
_pt_names() { grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$1" 2>/dev/null | sed 's/.*:[[:space:]]*"\(.*\)"/\1/' | tr -d '\r' | sort -u; }

# _pt_secret_key <ключ>: ключ server.properties, значение которого в журнал не пишется.
_pt_secret_key() { local k="${1,,}"; [[ "$k" == *pass* || "$k" == *secret* || "$k" == *token* || "$k" == *key* ]]; }

# _pt_changes <путь> <новый-файл> <старый-файл|"">: заполняет массив _PT_ENTS строками «файл<SOH>параметр<SOH>было<SOH>стало».
#  /server.properties - по изменённым ключам (параметр, было, стало; секретные ключи скрыты); /whitelist.json и /ops.json - добавленные и удалённые ники;
#  прочее - хэш (sha256:<12>), как раньше.
_pt_changes() {
  local p="$1" new="$2" old="$3" k w n a b cnt=0 sep=$'\001' sha was
  _PT_ENTS=()
  sha="sha256:$(sha256sum -- "$new" | cut -c1-12)"; was="${_PT_PREV[$p]:-unknown}"; [[ -n "$old" ]] || was=absent
  case "$p" in
    /server.properties)
      [[ -n "$old" ]] || old=/dev/null
      while IFS="$sep" read -r k w n; do
        [[ -n "$k" ]] || continue
        if _pt_secret_key "$k"; then w="<скрыто>"; n="<скрыто>"; fi
        (( ++cnt <= 60 )) && _PT_ENTS+=("$p$sep$k$sep$w$sep$n")
      done < <(awk '
        function parse(l,   i) { sub(/\r$/, "", l); if (l ~ /^[ \t]*(#|$)/) return 0; i = index(l, "="); if (i == 0) return 0; K = substr(l, 1, i - 1); V = substr(l, i + 1); gsub(/^[ \t]+|[ \t]+$/, "", K); return 1 }
        FILENAME == ARGV[1] { if (parse($0)) old[K] = V; next }
        { if (parse($0)) nw[K] = V }
        END { for (k in nw) { if (!(k in old)) print k "\001-\001" nw[k]; else if (old[k] != nw[k]) print k "\001" old[k] "\001" nw[k] }
              for (k in old) if (!(k in nw)) print k "\001" old[k] "\001-" }' "$old" "$new" | sort)
      (( cnt > 60 )) && _PT_ENTS+=("$p${sep}...${sep}-${sep}ещё $((cnt - 60)) изменений ($sha)") ;;
    /whitelist.json|/ops.json)
      a=""; [[ -n "$old" ]] && a="$(_pt_names "$old")"; b="$(_pt_names "$new")"
      while IFS= read -r k; do [[ -n "$k" ]] && _PT_ENTS+=("$p${sep}ник добавлен${sep}-${sep}$k"); done < <(comm -13 <(printf '%s\n' "$a") <(printf '%s\n' "$b"))
      while IFS= read -r k; do [[ -n "$k" ]] && _PT_ENTS+=("$p${sep}ник удалён${sep}$k${sep}-"); done < <(comm -23 <(printf '%s\n' "$a") <(printf '%s\n' "$b")) ;;
  esac
  (( ${#_PT_ENTS[@]} > 0 )) || _PT_ENTS+=("$p${sep}file_write${sep}$was${sep}$sha")
}

# file_write <путь-на-сервере> <локальный-файл>: POST /files/write?file=... (тело = содержимое файла, без вывода).
# Порядок: проверка путей и журнала, отказ для символической ссылки, ПЕРЕД КАЖДОЙ записью критичного файла - новая копия .bak-<UTC>-<мс><счётчик>
# (нет копии - нет записи), строка журнала «начато» (не записалась - отказ), запись, строка «выполнено/ОШИБКА».
ptero_file_write() {
  local p="$1" re="\\.bak-$_PT_TS_RE\$" brc hide=0 ok=0 e old="" orc=10 sep=$'\001' jf jp jw jn
  _pt_check_path "$p" || return 2
  _pt_path_allowed write "$p" || return 2
  [[ -f "$2" ]] || { ptero_die "нет локального файла для записи"; return 2; }
  _pt_write_ready "file_write $p" || return 1
  _pt_symlink_ok "$p" || return 1
  [[ "$p" == */bridge-key.txt* ]] && hide=1
  if _pt_critical_path "$p"; then
    if (( hide == 0 )); then
      _pt_mktemp || return 1; old="$_PT_LAST"
      _pt_fetch_old "$p" "$old"; orc=$?
      (( orc == 0 || orc == 10 )) || { : > "$old"; ptero_die "не прочитано прежнее содержимое $p: запись отменена"; return 1; }
      (( orc == 0 )) || { : > "$old"; old=""; }
    fi
    ptero_backup "$p"; brc=$?
    (( brc == 0 || brc == 10 )) || { [[ -z "$old" ]] || : > "$old"; ptero_die "бэкап перед записью не сделан: $p, запись отменена"; return 1; }
  fi
  if (( hide == 1 )); then
    _PT_ENTS=("$p${sep}file_write${sep}<скрыто>${sep}<скрыто>")
  elif [[ "$p" =~ $re ]]; then
    _PT_ENTS=("$p${sep}file_write${sep}absent${sep}sha256:$(sha256sum -- "$2" | cut -c1-12)")
  else
    _pt_changes "$p" "$2" "$old"
  fi
  [[ -z "$old" ]] || : > "$old"
  for e in "${_PT_ENTS[@]}"; do
    IFS="$sep" read -r jf jp jw jn <<<"$e"
    _pt_jb "$jf" "$jp" "$jw" "$jn" || { ptero_die "журнал: запись «начато» не сделана, запись файла отменена"; return 1; }
  done
  _pt_req POST "/files/write?file=$(_pt_urlenc_path "$p")" --data-binary "@$2" -H 'Content-Type: text/plain' || {
    for e in "${_PT_ENTS[@]}"; do IFS="$sep" read -r jf jp jw jn <<<"$e"; _pt_je "$jf" "$jp" "$jw" "$jn" 1 "не отправлено"; done; return 1; }
  [[ "$PTERO_HTTP" == "204" || "$PTERO_HTTP" == "200" ]] && ok=1
  for e in "${_PT_ENTS[@]}"; do
    IFS="$sep" read -r jf jp jw jn <<<"$e"
    if (( ok == 1 )); then _pt_je "$jf" "$jp" "$jw" "$jn" 0 "http=$PTERO_HTTP"; else _pt_je "$jf" "$jp" "$jw" "$jn" 1 "http=$PTERO_HTTP"; fi
  done
  (( ok == 1 )) || { echo "file_write: HTTP $PTERO_HTTP" >&2; return 1; }
  if [[ "$p" =~ $re ]]; then _PT_BACKED["${p%.bak-*}"]=1; fi   # копию сделал вызывающий (например, install-bridge.sh)
  (( hide == 0 )) && _PT_PREV["$p"]="sha256:$(sha256sum -- "$2" | cut -c1-12)"
  return 0
}

# upload <локальный-файл> <каталог-на-сервере> <имя-на-сервере>: GET /files/upload -> signed URL (не печатается), multipart.
# Разрешено только /plugins + TwoMCBridge*.jar (чужие jar - запрет).
ptero_upload() {
  local local_file="$1" dir="$2" name="$3" was sha
  [[ "$PTERO_ALLOW_WRITE" == "1" ]] || { ptero_die "запись запрещена (PTERO_ALLOW_WRITE!=1): upload"; return 1; }
  [[ "${dir%/}" == "/plugins" ]] || { ptero_die "upload: разрешён только каталог /plugins"; return 2; }
  _pt_name_ok "$name" || { ptero_die "upload: недопустимое имя файла"; return 2; }
  _pt_path_allowed upload "/plugins/$name" || return 2
  [[ -f "$local_file" ]] || { ptero_die "нет локального файла для загрузки"; return 2; }
  _pt_check_path "$dir" || return 2
  _pt_journal_ready || return 1
  if ptero_file_exists "/plugins/$name"; then was=present; else was=absent; fi
  sha="$(sha256sum -- "$local_file" | cut -c1-12)"
  _pt_req GET /files/upload || return 1
  [[ "$PTERO_HTTP" == "200" ]] || { _pt_wipe; echo "upload: получение URL, HTTP $PTERO_HTTP" >&2; return 1; }
  _pt_jb "/plugins/$name" "upload" "$was" "sha256:$sha" || { _pt_wipe; ptero_die "журнал: запись «начато» не сделана, загрузка отменена"; return 1; }
  local url; url="$(ptero_json_str "$PTERO_BODY" url)"; _pt_wipe
  url="${url//\\//\/}"; url="${url//\u0026/&}"
  [[ "$url" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]+)?/upload/file\?[A-Za-z0-9._=\&%~+-]+$ ]] || { url=""; ptero_die "signed URL неожиданного формата"; return 1; }
  # Каталог и имя - наши проверенные константы; недоверенных значений в форме нет. Имя файла задаётся --form-string-стилем: filename= в -F.
  local code
  code="$(curl -sS --max-time 300 -o /dev/null -w '%{http_code}' -K <(printf 'url = "%s&directory=%s"\n' "$url" "$(_pt_urlenc_path "$dir")") \
    -X POST --form "files=@${local_file};filename=${name}" </dev/null 2>/dev/null)" || code="000"
  unset url
  if [[ "$code" == "200" || "$code" == "204" ]]; then
    _pt_je "/plugins/$name" "upload" "$was" "sha256:$sha" 0 "http=$code"
  else
    _pt_je "/plugins/$name" "upload" "$was" "sha256:$sha" 1 "http=$code"
    echo "upload: HTTP $code" >&2; return 1
  fi
}

# power <restart|stop|start|kill>. restart/stop/kill - только после успешного ptero_restart_guard в этом процессе
# (игроки онлайн, say, 60 с) либо при PTERO_POWER_NOGUARD=1 (осознанное исключение, пишется в журнал).
ptero_power() {
  local sig="$1" was="?" via=guard
  case "$sig" in restart|stop|start|kill) ;; *) ptero_die "power: разрешены restart, stop, start, kill"; return 2 ;; esac
  _pt_write_ready "power $sig" || return 1
  if [[ "$sig" != start ]]; then
    if _pt_noguard; then via=NOGUARD
    elif [[ "$_PT_GUARD_OK" != 1 ]]; then ptero_die "power $sig: сначала ptero_restart_guard (проверка игроков и say за 60 с); исключение - PTERO_POWER_NOGUARD=1"; return 1
    fi
  fi
  was="$(ptero_state 2>/dev/null)"; was="${was:-?}"
  _pt_jb "power" "$sig" "state=$was" "signal ($via)" || { ptero_die "журнал: запись «начато» не сделана, действие отменено"; return 1; }
  _pt_req POST /power -H 'Content-Type: application/json' --data-raw "{\"signal\":\"$sig\"}" || { _pt_je "power" "$sig" "state=$was" "signal ($via)" 1 "не отправлено"; return 1; }
  if [[ "$PTERO_HTTP" == "204" ]]; then
    _PT_GUARD_OK=0
    _pt_je "power" "$sig" "state=$was" "signal sent ($via)" 0 "http=204"
  else
    _pt_je "power" "$sig" "state=$was" "signal ($via)" 1 "http=$PTERO_HTTP"
    echo "power: HTTP $PTERO_HTTP" >&2; return 1
  fi
}

# ---- консольные команды: санитизация + явный денайлист ----

# _pt_cmd_sanitize <команда>: одна строка, печатный ASCII 0x20-0x7E (без управляющих символов, табуляции и переводов строк),
# 1..256 символов, не начинается с пробела.
_pt_cmd_sanitize() {
  local c="$1"
  [[ -n "$c" ]] || { ptero_die "пустая команда"; return 1; }
  (( ${#c} <= 256 )) || { ptero_die "команда длиннее 256 символов"; return 1; }
  local re='^[ -~]+$'
  [[ "$c" =~ $re ]] || { ptero_die "команда: допустима одна строка печатного ASCII без управляющих символов"; return 1; }
  [[ "$c" != " "* ]] || { ptero_die "команда не должна начинаться с пробела"; return 1; }
  return 0
}

# _pt_cmd_json_escape <команда>: печатает команду, экранированную для JSON-строки (\ и ").
_pt_cmd_json_escape() { local c="$1"; c="${c//\\/\\\\}"; c="${c//\"/\\\"}"; printf '%s' "$c"; }

# _pt_cmd_verb <команда>: имя команды в нижнем регистре без ведущего «/» и без пространства имён (minecraft:, bukkit:, essentials: ...).
_pt_cmd_verb() {
  local c="${1,,}" v
  c="${c#"${c%%[! ]*}"}"   # ведущие пробелы (если вызвали без санитизации)
  v="${c%% *}"; v="${v#/}"
  [[ "$v" == *:* ]] && v="${v##*:}"
  printf '%s' "$v"
}

# ДЕНАЙЛИСТ (обоснование - в тексте причины; op и deop НЕ запрещены). Команда проверяется по имени команды (verb); пространства имён срезаются,
# поэтому `minecraft:execute` и `bukkit:reload` не обходят список. Это защита от ошибки, а не граница безопасности: мир и данные игроков
# дополнительно защищены тем, что в ptero.sh нет удаления файлов. Печатает причину, код 0 - команда запрещена.
_pt_cmd_denied() {
  local c="${1,,}" v rest lpre a1=""
  c="${c#"${c%%[! ]*}"}"
  v="$(_pt_cmd_verb "$1")"
  rest=""; [[ "$c" == *" "* ]] && rest="${c#* }"
  read -r a1 _ <<<"$rest"
  case "$v" in
    "") echo "пустое имя команды"; return 0 ;;
    plugman|plugin|pm|pluginmanager|reload|rl)
      echo "управление плагинами и глобальный reload: сторонние плагины не загружать, не выгружать, не удалять и не перезагружать целиком (reload плагина - его собственной командой)"; return 0 ;;
    /*|we|worldedit|fawe|fastasyncworldedit|mv|mvm|mvdelete|mvremove|mvunload|mvconfirm|mvclone|mvregen|multiverse|multiverse-core|multiverse-inventories|mvinv|world|worlds|wm|worldmanager|regen|chunky|fill|fillbiome|clone|setblock)
      echo "удаление, перегенерация или массовое изменение мира: мир удалять нельзя"; return 0 ;;
    clear|clearinventory|ci|eci|eclear|clearall|eco|economy|authme|nlogin|login|l|register|reg|unregister|unreg|changepassword|changepass)
      echo "очистка данных игрока (инвентарь, экономика) или команды авторизации с паролями (удаление данных игроков; пароли попали бы в журнал и argv)"; return 0 ;;
    plugins|pl|bukkit)
      case "$rest" in load*|unload*|delete*|remove*|install*|enable*|disable*|reload*|restart*)
        echo "plugins load/unload/delete/enable/disable: сторонние плагины не загружать, не выгружать и не удалять через консоль"; return 0 ;; esac ;;
    execute|function|schedule|datapack|sudo|esudo|su|sudoall|runas|console|cmd)
      echo "обёртка, исполняющая другую команду или чужой код (обходит денайлист)"; return 0 ;;
    kill|ekill|killall|ekillall|butcher|mobkill|mkill|remove|eremove)
      echo "kill/remove: убийство или удаление игроков и сущностей (селекторы @e/@a/@p/@r и ники) - данные игроков и мира"; return 0 ;;
    data)
      [[ "$a1" == get ]] || { echo "data merge/remove/modify: правка данных сущностей, блоков и хранилищ (разрешён только data get)"; return 0; } ;;
    forceload|worldborder|wb|tick|gamerule|save-off)
      echo "forceload/worldborder/tick/gamerule/save-off: изменение мира, правил игры или отключение сохранения мира"; return 0 ;;
    give|egive|i|ei|item|eitem|eggive)
      echo "give/item: выдача предметов меняет инвентарь и данные игроков"; return 0 ;;
    delhome|edelhome|deletehome|remhome|rmhome|delwarp|edelwarp|deletewarp|remwarp|rmwarp)
      echo "delhome/delwarp: удаление домов и варпов (данные игроков)"; return 0 ;;
    pex|permissionsex|pexbukkit)
      echo "PermissionsEx: массовые операции с правами (используйте точечные команды LuckPerms)"; return 0 ;;
    lp|luckperms|perms|perm|permission|permissions|lpb|lpv)
      lpre=' (bulkupdate|delete[a-z]*|clear|migrate|import|trackclear) '
      if [[ " $rest " =~ $lpre ]]; then echo "LuckPerms (lp/perms/perm/permissions): массовое изменение или удаление данных прав"; return 0; fi ;;
  esac
  return 1
}

# _pt_cmd_needs_guard <команда>: консольные stop и restart останавливают сервер: нужен ptero_restart_guard (как для power).
_pt_cmd_needs_guard() { case "$(_pt_cmd_verb "$1")" in stop|restart) return 0 ;; esac; return 1; }

# _pt_cmd_readonly <команда>: команды без изменений (в журнал не пишутся).
_pt_cmd_readonly() { case "$(_pt_cmd_verb "$1")" in list|plugins|pl|version|ver|tps|mspt|help|\?) return 0 ;; esac; [[ "${1,,}" == "twomcbridge events" ]]; }

# _pt_cmd_allowed <команда>: 0 - можно отправлять. Санитизация, денайлист, охрана stop/restart.
_pt_cmd_allowed() {
  local reason
  _pt_cmd_sanitize "$1" || return 1
  if reason="$(_pt_cmd_denied "$1")"; then ptero_die "команда запрещена: $reason"; return 1; fi
  if _pt_cmd_needs_guard "$1" && [[ "$_PT_GUARD_OK" != 1 ]] && ! _pt_noguard; then
    ptero_die "консольные stop/restart: сначала ptero_restart_guard (игроки, say, 60 с); исключение - PTERO_POWER_NOGUARD=1"; return 1
  fi
  return 0
}

# command <строка>: POST /command. Санитизация + денайлист (_pt_cmd_allowed); JSON-экранирование; журнал (кроме команд только чтения).
ptero_command() {
  local ro=0
  _pt_cmd_allowed "$1" || return 2
  _pt_cmd_readonly "$1" && ro=1
  if (( ro == 0 )); then
    _pt_write_ready "command" || return 1
    _pt_jb "console: $1" "command" "-" "-" || { ptero_die "журнал: запись «начато» не сделана, команда не отправлена"; return 1; }
  fi
  _pt_req POST /command -H 'Content-Type: application/json' --data-raw "{\"command\":\"$(_pt_cmd_json_escape "$1")\"}" || { (( ro == 1 )) || _pt_je "console: $1" "command" "-" "-" 1 "не отправлено"; return 1; }
  if (( ro == 0 )); then
    if [[ "$PTERO_HTTP" == "204" ]]; then _pt_je "console: $1" "command" "-" "sent" 0 "http=204"
    else _pt_je "console: $1" "command" "-" "-" 1 "http=$PTERO_HTTP"; fi
  fi
  [[ "$PTERO_HTTP" == "204" ]] || { echo "command: HTTP $PTERO_HTTP" >&2; return 1; }
  if _pt_cmd_needs_guard "$1"; then _PT_GUARD_OK=0; fi
}

# ---- консоль через websocket (node 22 во временном контейнере) ----

_PT_WS_JS='
const env = process.env;
const re = (s) => (s ? new RegExp(s, "i") : null);
const until = re(env.PT_UNTIL), fail = re(env.PT_FAIL), show = re(env.PT_FILTER);
const strip = (s) => String(s).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/[0-9a-fA-F]{64}/g, "[REDACTED]").slice(0, 300);
let done = false, authed = false;
const finish = (code, msg) => { if (done) return; done = true; if (msg) console.log(msg); try { ws.close(); } catch {} setTimeout(() => process.exit(code), 100); };
const ws = new WebSocket(env.PT_WS_SOCKET, { headers: { Origin: env.PT_ORIGIN } });
setTimeout(() => finish(authed ? 2 : 4, authed ? "TIMEOUT" : "TIMEOUT_NO_AUTH"), (Number(env.PT_SECS) || 30) * 1000);
ws.addEventListener("open", () => ws.send(JSON.stringify({ event: "auth", args: [env.PT_WS_TOKEN] })));
ws.addEventListener("error", (e) => finish(5, "WS_ERROR " + String((e && (e.message || (e.error && e.error.message))) || "").replace(/[^A-Za-z0-9_ .:-]/g, "").slice(0, 120) + " " + String((e && e.error && e.error.cause && e.error.cause.code) || "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 40)));
ws.addEventListener("close", () => finish(authed ? 6 : 5, authed ? "WS_CLOSED" : "WS_ERROR"));
ws.addEventListener("message", (ev) => {
  let m; try { m = JSON.parse(String(ev.data)); } catch { return; }
  if (m.event === "auth success") {
    authed = true; console.log("AUTH_OK");
    if (env.PT_LOGS === "1") ws.send(JSON.stringify({ event: "send logs", args: [null] }));
    if (env.PT_SEND) ws.send(JSON.stringify({ event: "send command", args: [env.PT_SEND] }));
    if (env.PT_SECS === "0") finish(0, "AUTH_ONLY");
  } else if (m.event === "jwt error" || m.event === "daemon error") {
    finish(7, "WS_AUTH_ERROR");
  } else if (m.event === "console output") {
    const line = strip((m.args || [""])[0]);
    if (show === null || show.test(line)) console.log("L: " + line);
    if (fail && fail.test(line)) finish(3, "FAIL_MATCH");
    else if (until && until.test(line)) finish(0, "UNTIL_MATCH");
  }
});
'

_pt_node_image() {
  command -v docker >/dev/null 2>&1 || { ptero_die "на VDS нет docker (нужен для node 22 с WebSocket)"; return 1; }
  local img
  for img in "$PTERO_NODE_IMAGE" "$PTERO_NODE_IMAGE_MIRROR"; do
    docker image inspect "$img" >/dev/null 2>&1 </dev/null && { printf '%s' "$img"; return 0; }
  done
  # Образа нет локально: тянем только в режиме записи (docker pull меняет состояние VDS, но не стенда).
  [[ "$PTERO_ALLOW_WRITE" == "1" || "${PTERO_ALLOW_PULL:-0}" == "1" ]] || { ptero_die "образ node (24 или 22) не найден локально; docker pull не выполняется без PTERO_ALLOW_PULL=1"; return 1; }
  for img in "$PTERO_NODE_IMAGE" "$PTERO_NODE_IMAGE_MIRROR"; do
    timeout 180 docker pull -q "$img" >/dev/null 2>&1 </dev/null && { printf '%s' "$img"; return 0; }
  done
  ptero_die "не удалось получить образ node:22"; return 1
}

# _pt_ws <секунды> <send-команда|""> <logs 0|1> <until-regex|""> <fail-regex|""> <filter-regex|"">
# Печатает AUTH_OK, строки консоли («L: ...», без токенов, 64-hex заменяются) и итог UNTIL_MATCH/FAIL_MATCH/TIMEOUT/WS_*.
# Код: 0 until, 2 таймаут, 3 fail, 4 нет auth, 5-7 ошибки сокета.
_pt_ws() {
  local secs="$1" send="$2" logs="$3" until="$4" fail="$5" filter="$6" img
  [[ "$secs" =~ ^[0-9]{1,4}$ ]] || { ptero_die "секунды: число"; return 2; }
  [[ -z "$send" ]] || _pt_cmd_allowed "$send" || return 2
  [[ -z "$send" || "$PTERO_ALLOW_WRITE" == "1" ]] || { ptero_die "отправка команды в консоль запрещена (PTERO_ALLOW_WRITE!=1)"; return 1; }
  local jr=0; if [[ -n "$send" ]] && ! _pt_cmd_readonly "$send"; then jr=1; _pt_journal_ready || return 1; fi
  img="$(_pt_node_image)" || return 1
  _pt_req GET /websocket || return 1
  if [[ "$PTERO_HTTP" == "429" ]]; then sleep 45; _pt_req GET /websocket || return 1; fi   # панель ограничивает частоту выдачи токенов
  [[ "$PTERO_HTTP" == "200" ]] || { _pt_wipe; echo "websocket: HTTP $PTERO_HTTP" >&2; return 1; }
  local tok sock
  tok="$(ptero_json_str "$PTERO_BODY" token)"; sock="$(ptero_json_str "$PTERO_BODY" socket)"
  sock="${sock//\\\//\/}"   # JSON экранирует «/» как «\/»
  : > "$PTERO_BODY"
  [[ "$tok" =~ ^[A-Za-z0-9._-]+$ && "$sock" =~ ^wss?://[A-Za-z0-9.-]+(:[0-9]+)?/[A-Za-z0-9._/-]+$ ]] || { ptero_die "ответ websocket неожиданного формата"; return 1; }
  if (( jr == 1 )); then _pt_jb "console: $send" "command (websocket)" "-" "-" || { ptero_die "журнал: запись «начато» не сделана, команда не отправлена"; return 1; }; fi
  # Значения передаются через --env-file из process substitution (не в argv и не в docker inspect с -e).
  timeout $(( secs + 40 )) docker run --rm --read-only --cap-drop ALL --security-opt no-new-privileges --memory 128m \
    --env-file <(printf 'PT_WS_TOKEN=%s\nPT_WS_SOCKET=%s\nPT_ORIGIN=%s\nPT_SECS=%s\nPT_SEND=%s\nPT_LOGS=%s\nPT_UNTIL=%s\nPT_FAIL=%s\nPT_FILTER=%s\n' \
      "$tok" "$sock" "$PTERO_ORIGIN" "$secs" "$send" "$logs" "$until" "$fail" "$filter") \
    "$img" node -e "$_PT_WS_JS" </dev/null 2>/dev/null
  local rc=$?
  unset tok sock
  if (( jr == 1 )); then if (( rc == 0 )); then _pt_je "console: $send" "command (websocket)" "-" "sent" 0 "rc=$rc"; else _pt_je "console: $send" "command (websocket)" "-" "-" 1 "rc=$rc"; fi; fi
  if [[ -n "$send" ]] && _pt_cmd_needs_guard "$send"; then _PT_GUARD_OK=0; fi
  return $rc
}

# console_tail <секунды> [фильтр-regex]: история и новые строки консоли за N секунд (только совпавшие, ключи вычищены).
ptero_console_tail() { _pt_ws "$1" "" 1 "" "" "${2:-}"; }

# ---- Server List Ping (основной способ определения игроков; node:net без зависимостей, только чтение статуса) ----
# Вход: PT_HOST, PT_PORT, PT_TIMEOUT_MS. Вывод: «players=<N> max=<M> version=<v>» (код 0) либо код 1 без вывода.
_PT_SLP_JS='
const net = require("node:net");
const host = process.env.PT_HOST || "127.0.0.1";
const port = parseInt(process.env.PT_PORT || "25565", 10);
const timeoutMs = parseInt(process.env.PT_TIMEOUT_MS || "5000", 10);
const vi = (n) => { const b = []; n = n >>> 0; do { let x = n & 127; n >>>= 7; if (n) x |= 128; b.push(x); } while (n); return Buffer.from(b); };
const pkt = (body) => Buffer.concat([vi(body.length), body]);
const rv = (buf, o) => { let r = 0, s = 0; for (let i = 0; i < 5; i++) { if (o + i >= buf.length) return null; const x = buf[o + i]; r |= (x & 127) << s; if (!(x & 128)) return [r >>> 0, i + 1]; s += 7; } return "bad"; };
const hs = Buffer.concat([vi(0), vi(767), vi(Buffer.byteLength(host)), Buffer.from(host), Buffer.from([(port >> 8) & 255, port & 255]), vi(1)]);
let acc = Buffer.alloc(0), done = false;
const fail = (w) => { if (done) return; done = true; sock.destroy(); console.log("ERR:" + (typeof w === "string" ? w : "closed")); process.exit(1); };
const sock = net.connect({ host, port });
let got = false;
const timer = setTimeout(() => fail(got ? "timeout-incomplete" : "timeout-no-data"), timeoutMs);
sock.on("connect", () => { sock.write(Buffer.concat([pkt(hs), pkt(vi(0))])); });
sock.on("error", (e) => fail("net-" + ((e && e.code) || "error")));
sock.on("close", () => fail(got ? "closed-incomplete" : "closed-no-data"));
sock.on("data", (d) => {
  if (done) return;
  got = true;
  acc = Buffer.concat([acc, d]);
  if (acc.length > 1048576) return fail("too-big");
  const l = rv(acc, 0); if (l === null) return; if (l === "bad") return fail("bad-length");
  if (l[0] < 2 || l[0] > 1048576) return fail("bad-length");
  if (acc.length < l[1] + l[0]) return;
  const id = rv(acc, l[1]); if (!id || id === "bad" || id[0] !== 0) return fail("bad-packet-id");
  const sl = rv(acc, l[1] + id[1]); if (!sl || sl === "bad") return fail("bad-string-length");
  const start = l[1] + id[1] + sl[1], end = start + sl[0];
  if (end > l[1] + l[0] || end > acc.length) return fail("bad-string-length");
  let j; try { j = JSON.parse(acc.subarray(start, end).toString("utf8")); } catch (e) { return fail("bad-json"); }
  const p = j && j.players;
  if (!p || !Number.isInteger(p.online) || p.online < 0 || p.online > 100000) return fail("bad-players");
  const max = Number.isInteger(p.max) && p.max >= 0 ? p.max : 0;
  // Цветовые коды §x убираются, управляющие символы удаляются, пробелы -> «_»; кириллица и прочий UTF-8 сохраняются.
  const vn = j.version && typeof j.version.name === "string" ? j.version.name : "";
  const ver = vn.replace(/\u00a7./gsu, "").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, "").trim().slice(0, 60).replace(/\s+/g, "_") || "?";
  done = true; clearTimeout(timer); sock.destroy();
  console.log("players=" + p.online + " max=" + max + " version=" + ver);
  process.exit(0);
});
'

# ptero_slp [хост порт]: без аргументов берёт основную аллокацию. Печатает «players=N max=M version=V», код 1 - ошибка (вывод пуст).
# Только чтение: GET /network/allocations и TCP-запрос статуса на игровой порт. Сначала сеть bridge, затем host (hairpin).
ptero_slp() {
  local host="${1:-}" port="${2:-}" img out net
  if [[ -z "$host" ]]; then read -r host port < <(ptero_allocation) || return 1; fi
  [[ "$host" =~ ^[A-Za-z0-9.-]+$ && "$port" =~ ^[0-9]{2,5}$ ]] || return 1
  img="$(_pt_node_image 2>/dev/null)" || return 1
  for net in bridge host; do
    out="$(timeout 20 docker run --rm --read-only --cap-drop ALL --security-opt no-new-privileges --memory 128m --network "$net" \
      -e PT_HOST="$host" -e PT_PORT="$port" -e PT_TIMEOUT_MS=5000 "$img" node -e "$_PT_SLP_JS" </dev/null 2>/dev/null)" || out=""
    if [[ "$out" =~ ^players=[0-9]+\ max=[0-9]+\ version=[^[:space:][:cntrl:]]+$ ]]; then printf '%s\n' "$out"; return 0; fi
    echo "SLP: сеть $net, $host:$port: ${out:-нет вывода (docker/timeout)}" >&2
  done
  return 1
}

# ptero_slp_maintenance <version>: код 0, если version.name похож на режим техработ (Тех. работы / maintenance / whitelist).
ptero_slp_maintenance() {
  case "${1,,}" in *maintenance*|*whitelist*|*"тех."*|*тех_работ*|*"тех.работ"*|*техработ*|*"Тех."*|*"Тех_"*) return 0 ;; esac
  case "$1" in *Тех.*|*Тех_*|*Техработ*|*ТЕХ*) return 0 ;; esac
  return 1
}

# ptero_players_ws: запасной способ - команда list через websocket консоли (только при PTERO_ALLOW_WRITE=1). Печатает число или пусто.
# Ожидание до 30 с; ANSI/цветовые коды вычищаются; Paper 1.21: «There are N of a max of M players online».
# При неуспехе в stderr: число полученных строк и только строки с players/online.
ptero_players_ws() {
  local out n re
  re='There are [0-9]+ (of a max of|out of maximum|of maximum|out of a max of) [0-9]+ players online|[0-9]+ (of a max|out of max)'
  out="$(_pt_ws 30 "list" 1 "$re" "" "")" || true
  out="$(sed -e 's/\x1b\[[0-9;?]*[ -\/]*[@-~]//g' -e 's/\x1b[@-_]//g' -e 's/§[0-9a-fk-or]//gI' -e 's/\r//g' <<<"$out")"
  n="$(sed -n 's/.*There are \([0-9][0-9]*\) \(of a max of\|out of maximum\|of maximum\|out of a max of\) [0-9][0-9]* players online.*/\1/p' <<<"$out" | head -n1)"
  [[ -n "$n" ]] || n="$(sed -n 's/.* \([0-9][0-9]*\) \(of a max\|out of max\).*/\1/p' <<<"$out" | head -n1)"
  if [[ -n "$n" ]]; then printf '%s\n' "$n"; return 0; fi
  {
    echo "ws list: получено строк консоли: $(grep -c '^L: ' <<<"$out")"
    grep '^L: ' <<<"$out" | grep -i 'players\|online' | sed -E -e 's#https?://[^ ]*#<url>#g' -e 's/[0-9a-fA-F]{32,}/<hex>/g' \
      -e 's/[0-9]{1,3}(\.[0-9]{1,3}){3}(:[0-9]+)?/<ip>/g' -e 's/([Oo]nline:?).*/\1 <nick>/' -e 's/[A-Za-z0-9_]{3,16}(\[| joined| left| lost)/<nick>\1/g' | head -n 10
  } >&2
  return 1
}

# players_online: печатает «players=<N>» либо «players=?» (код 1). Порядок: SLP -> websocket list -> отказ (BLOCKER).
# Dry-run (PTERO_ALLOW_WRITE!=1): команда list не отправляется; SLP только читает статус, при неудаче проверяется websocket (AUTH_OK).
ptero_players_online() {
  local s n
  if s="$(ptero_slp)"; then n="${s#players=}"; echo "players=${n%% *}"; return 0; fi
  if [[ "$PTERO_ALLOW_WRITE" != "1" ]]; then
    local out; out="$(_pt_ws 0 "" 0 "" "" "")" || true
    if grep -q '^AUTH_OK' <<<"$out"; then echo "websocket=ok players=? (dry-run: SLP недоступен, команда list не отправляется)"; else echo "websocket=FAIL players=?"; return 1; fi
    return 0
  fi
  if n="$(ptero_players_ws)" && [[ "$n" =~ ^[0-9]+$ ]]; then echo "players=$n"; return 0; fi
  echo "players=?"; return 1
}
# server_image: образ Docker сервера (docker_image из GET /servers/<UUID>), несекретно.
ptero_server_image() {
  _pt_req GET "" || return 1
  [[ "$PTERO_HTTP" == "200" ]] || { _pt_wipe; echo "HTTP $PTERO_HTTP" >&2; return 1; }
  local img; img="$(ptero_json_str "$PTERO_BODY" docker_image | tr -d "\\")"; _pt_wipe
  printf '%s\n' "$img"
}

# _pt_guard_probe: печатает «<SLP> <list>» (число либо «?»). Список list запрашивается всегда, когда SLP не показал игроков.
_pt_guard_probe() {
  local s l="?" sv="?"
  if s="$(ptero_slp)"; then s="${s#players=}"; sv="${s%% *}"; fi
  if [[ "$sv" == "?" || "$sv" == "0" ]]; then
    if l="$(ptero_players_ws)" && [[ "$l" =~ ^[0-9]+$ ]]; then :; else l="?"; fi
  fi
  echo "$sv $l"
}

# ptero_restart_guard <install|rollback>: перед restart. SLP>0 или list>0 -> `say`-предупреждение, ожидание 60 с, повторная проверка (если игроков стало больше -
# второе предупреждение и ещё 30 с). SLP=0 -> перекрёстная проверка list: 0 -> можно; >0 -> предупреждение; list недоступен -> консервативно: предупреждение
# и 60 с, затем restart. SLP и list недоступны -> отказ (код 1). Только при PTERO_ALLOW_WRITE=1. Ожидания для сухих прогонов: PTERO_GUARD_WAIT1/PTERO_GUARD_WAIT2.
_ptero_restart_guard_impl() {
  local why="$1" w1=60 w2=30 pr s l n n2 s2 l2 blind=0
  if [[ "$_PT_TEST" == 1 ]]; then w1="${PTERO_GUARD_WAIT1:-60}"; w2="${PTERO_GUARD_WAIT2:-30}"; fi   # ожидания можно сократить только в тестовом режиме
  [[ "$why" =~ ^(install|rollback|access|config)$ && "$w1" =~ ^[0-9]{1,3}$ && "$w2" =~ ^[0-9]{1,3}$ ]] || { ptero_die "restart_guard: неверные аргументы"; return 2; }
  [[ "$PTERO_ALLOW_WRITE" == "1" ]] || { ptero_die "restart_guard требует PTERO_ALLOW_WRITE=1"; return 1; }
  pr="$(_pt_guard_probe)"; s="${pr% *}"; l="${pr#* }"   # stderr (диагностика ws) виден
  if [[ "$s" == "?" && "$l" == "?" ]]; then echo "BLOCKER: не удалось определить число игроков (SLP и websocket list недоступны)"; return 1; fi
  echo "игроков онлайн: SLP=$s list=$l"
  n=0; [[ "$s" =~ ^[0-9]+$ ]] && n="$s"; [[ "$l" =~ ^[0-9]+$ ]] && (( l > n )) && n="$l"
  if (( n == 0 )); then
    if [[ "$s" == "0" && "$l" == "?" ]]; then
      blind=1; echo "SLP=0, list недоступен — предупреждение отправлено на всякий случай"
    else
      return 0
    fi
  fi
  echo "предупреждение в чат и ожидание $w1 с"
  ptero_command "say TwoMC: server restart in 60 seconds for plugin $why" || { echo "не удалось отправить предупреждение"; return 1; }
  sleep "$w1"
  (( blind == 1 )) && return 0
  pr="$(_pt_guard_probe 2>/dev/null)"; s2="${pr% *}"; l2="${pr#* }"
  [[ "$s2" =~ ^[0-9]+$ || "$l2" =~ ^[0-9]+$ ]] || { echo "не удалось повторно определить число игроков"; return 1; }
  n2=0; [[ "$s2" =~ ^[0-9]+$ ]] && n2="$s2"; [[ "$l2" =~ ^[0-9]+$ ]] && (( l2 > n2 )) && n2="$l2"
  echo "игроков онлайн после ожидания: SLP=$s2 list=$l2"
  if (( n2 > n )); then
    echo "зашли новые игроки: второе предупреждение и ожидание $w2 с"
    ptero_command "say TwoMC: server restart in 30 seconds for plugin $why" || { echo "не удалось отправить второе предупреждение"; return 1; }
    sleep "$w2"
  fi
  return 0
}

# Обёртка: после успешной проверки (код 0) выставляет _PT_GUARD_OK=1 - его требуют ptero_power restart/stop/kill и консольные stop/restart.
# Работает только если вызвана в основном shell (не в $(...)). Флаг сбрасывается после использования.
ptero_restart_guard() {
  _PT_GUARD_OK=0
  _ptero_restart_guard_impl "$@"; local rc=$?
  (( rc == 0 )) && _PT_GUARD_OK=1
  return $rc
}

# ---- файловые операции малого объёма (только при PTERO_ALLOW_WRITE=1 и только по белым спискам; JSON собирается из проверенных строк) ----
_pt_name_ok() { [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; }

# mkdir <корень> <имя>: POST /files/create-folder; разрешено только «/plugins» + «TwoMCBridge» (ошибка «уже существует» не критична, код 0/1).
ptero_mkdir() {
  _pt_check_path "$1" || return 2; _pt_name_ok "$2" || { ptero_die "недопустимое имя каталога"; return 2; }
  [[ "${1%/}" == "/plugins" && "$2" == "TwoMCBridge" ]] || { ptero_die "mkdir: разрешён только /plugins/TwoMCBridge"; return 2; }
  _pt_write_ready "mkdir" || return 1
  _pt_jb "${1%/}/$2" "mkdir" "-" "-" || { ptero_die "журнал: запись «начато» не сделана, действие отменено"; return 1; }
  _pt_req POST /files/create-folder -H 'Content-Type: application/json' --data-raw "{\"root\":\"$1\",\"name\":\"$2\"}" || { _pt_je "${1%/}/$2" "mkdir" "-" "-" 1 "не отправлено"; return 1; }
  if [[ "$PTERO_HTTP" == "204" || "$PTERO_HTTP" == "200" ]]; then _pt_je "${1%/}/$2" "mkdir" "-" "-" 0 "http=$PTERO_HTTP"; else _pt_je "${1%/}/$2" "mkdir" "-" "-" 1 "http=$PTERO_HTTP"; fi
  [[ "$PTERO_HTTP" == "204" || "$PTERO_HTTP" == "200" ]]
}

# chmod <корень> <файл> <режим 3 цифры>: POST /files/chmod (на части версий панели может отсутствовать: вызывающий трактует как предупреждение).
ptero_chmod() {
  _pt_check_path "$1" || return 2; _pt_name_ok "$2" || return 2; [[ "$3" =~ ^[0-7]{3}$ ]] || return 2
  local re="^bridge-key\.txt(\.bak-$_PT_TS_RE)?\$"
  [[ "${1%/}" == "/plugins/TwoMCBridge" && "$2" =~ $re && "$3" == "600" ]] || { ptero_die "chmod: разрешён только 600 для bridge-key.txt[.bak-<время>] в /plugins/TwoMCBridge"; return 2; }
  _pt_write_ready "chmod" || return 1
  _pt_jb "${1%/}/$2" "chmod" "-" "$3" || { ptero_die "журнал: запись «начато» не сделана, действие отменено"; return 1; }
  _pt_req POST /files/chmod -H 'Content-Type: application/json' --data-raw "{\"root\":\"$1\",\"files\":[{\"file\":\"$2\",\"mode\":\"$3\"}]}" || { _pt_je "${1%/}/$2" "chmod" "-" "$3" 1 "не отправлено"; return 1; }
  if [[ "$PTERO_HTTP" == "204" || "$PTERO_HTTP" == "200" ]]; then _pt_je "${1%/}/$2" "chmod" "-" "$3" 0 "http=$PTERO_HTTP"; else _pt_je "${1%/}/$2" "chmod" "-" "$3" 1 "http=$PTERO_HTTP"; fi
  [[ "$PTERO_HTTP" == "204" || "$PTERO_HTTP" == "200" ]]
}

# rename <корень> <от> <к>: POST /files/rename (откат без удаления: jar переименовывается в *.disabled-*).
ptero_rename() {
  _pt_check_path "$1" || return 2; _pt_name_ok "$2" || return 2; _pt_name_ok "$3" || return 2
  local root="${1%/}" ok=0 re="^\.disabled-$_PT_TS_RE\$" jre='^TwoMCBridge[A-Za-z0-9._-]*\.jar$'
  if [[ "$root" == "/plugins" && "$2" =~ $jre && "$3" == "$2"* && "${3#"$2"}" =~ $re ]]; then ok=1; fi
  if [[ "$root" == "/plugins/TwoMCBridge" && ( "$2" == "config.yml" || "$2" == "bridge-key.txt" ) && "$3" == "$2"* && "${3#"$2"}" =~ $re ]]; then ok=1; fi
  [[ "$ok" == 1 ]] || { ptero_die "rename: разрешено только <файл Bridge> -> <файл>.disabled-<время>"; return 2; }
  _pt_write_ready "rename" || return 1
  _pt_jb "$root/$2" "rename" "$2" "$3" || { ptero_die "журнал: запись «начато» не сделана, действие отменено"; return 1; }
  _pt_req POST /files/rename -H 'Content-Type: application/json' --data-raw "{\"root\":\"$1\",\"files\":[{\"from\":\"$2\",\"to\":\"$3\"}]}" || { _pt_je "$root/$2" "rename" "$2" "$3" 1 "не отправлено"; return 1; }
  if [[ "$PTERO_HTTP" == "204" || "$PTERO_HTTP" == "200" ]]; then _pt_je "$root/$2" "rename" "$2" "$3" 0 "http=$PTERO_HTTP"; else _pt_je "$root/$2" "rename" "$2" "$3" 1 "http=$PTERO_HTTP"; fi
  [[ "$PTERO_HTTP" == "204" || "$PTERO_HTTP" == "200" ]]
}

# command_capture <команда> <секунды> <until-regex> <filter-regex>: отправить команду в консоль и напечатать совпавшие строки ответа.
ptero_command_capture() { _pt_ws "$2" "$1" 0 "$3" "" "$4"; }

# allocation: основная аллокация сервера (GET /network/allocations), печатает «<хост> <порт>»: ip_alias, если задан, иначе ip.
# Только чтение. Значения несекретны (адрес игрового сервера). Код 1 - HTTP не 200 или формат неожиданный.
ptero_allocation() {
  _pt_req GET /network/allocations || return 1
  [[ "$PTERO_HTTP" == "200" ]] || { _pt_wipe; echo "HTTP $PTERO_HTTP" >&2; return 1; }
  local rec ip alias port host
  rec="$(sed 's/{"object":"allocation"/\n&/g' "$PTERO_BODY" | grep '"is_default":true' | head -n1)"; _pt_wipe
  [[ -n "$rec" ]] || { ptero_die "в ответе нет основной аллокации"; return 1; }
  ip="$(sed -n 's/.*"ip":"\([^"]*\)".*/\1/p' <<<"$rec")"
  alias="$(sed -n 's/.*"ip_alias":"\([^"]*\)".*/\1/p' <<<"$rec")"
  port="$(sed -n 's/.*"port":\([0-9][0-9]*\).*/\1/p' <<<"$rec")"
  host="${alias:-$ip}"
  [[ "$host" =~ ^[A-Za-z0-9.-]+$ && "$port" =~ ^[0-9]{2,5}$ ]] || { ptero_die "адрес аллокации неожиданного формата"; return 1; }
  printf '%s %s\n' "$host" "$port"
}
