#!/usr/bin/env bash
export LC_ALL=C   # проверки [A-Za-z] и регэкспы не зависят от локали
# Библиотека доступа к Client API Pterodactyl для ОДНОГО сервера dev-srv (подключать через `source`; запускается ТОЛЬКО на VDS).
#
# Учётные данные: файл PTERO_CRED_FILE (по умолчанию /home/twomc/pterodactyl-credentials.txt, права 600, KEY=VALUE:
# PANEL_URL, SERVER_UUID, CLIENT_API_KEY). Файл подключается через `.` внутри ptero_init; значения никуда не печатаются.
# PANEL_URL указывает на /account/api; база Client API = PANEL_URL без «/account/api» + «/api/client».
#
# Защита:
#  - Любой запрос строится как $PTERO_SRV$суффикс, где PTERO_SRV = <база>/servers/<SERVER_UUID>: другой сервер и корневой
#    список серверов (GET /api/client) недостижимы. Суффикс проверяется по белому списку символов, «..» запрещены.
#  - Не-GET методы разрешены только при PTERO_ALLOW_WRITE=1 (его выставляет install-bridge.sh с флагом --yes);
#    без него функции записи (file_write, upload, power, command) отказывают. Порядок: dry-run и status/files_list/file_read/
#    console_tail - только чтение.
#  - БЕЛЫЕ СПИСКИ (всё остальное - отказ, код 2/1, даже при PTERO_ALLOW_WRITE=1):
#      эндпоинты: "", /resources, /websocket, /startup, /network/allocations, /files/{list,contents,upload,write,create-folder,chmod,rename},
#        /power (только restart), /command;
#      list: только /, /plugins;
#      read (stdout): /server.properties, /version_history.json, /logs/latest.log, /plugins/TwoMCBridge/config.yml;
#      fetch (в локальный файл 600, для бэкапа): /plugins/TwoMCBridge/config.yml и bridge-key.txt (ключ в stdout не выводится никогда);
#      write: /plugins/TwoMCBridge/{config.yml,bridge-key.txt}[.bak-<UTC-время>|.disabled-<UTC-время>]; upload: только /plugins/TwoMCBridge-0.1.0.jar;
#      rename: /plugins TwoMCBridge-0.1.0.jar -> TwoMCBridge-0.1.0.jar.disabled-<время> и config.yml|bridge-key.txt -> <имя>.disabled-<время> в /plugins/TwoMCBridge;
#      mkdir: только /plugins + TwoMCBridge; chmod: только /plugins/TwoMCBridge bridge-key.txt[.bak-<время>] 600;
#      консольные команды: `say TwoMC: <текст [A-Za-z0-9 .,:!?-]>`, `list`, `twomcbridge events`.
#    <UTC-время> = YYYYMMDDTHHMMSSZ.
#  - Тело последнего ответа (PTERO_BODY) очищается сразу после использования (_pt_wipe).
#  - Ключ API передаётся в curl через конфиг из process substitution (не попадает в argv/ps), signed URL загрузки - так же.
#    Ключ, websocket-токен, signed URL, тела ответов с ними не печатаются; stderr curl отбрасывается (в нём бывает URL).
#  - Ничего не читает из stdin (все curl/docker с </dev/null), чтобы не съесть скрипт, поданный через `bash -s`.
# Зависимости на VDS: bash, curl, sed, grep, mktemp; для players_online/console_tail - docker и образ node:22 (встроенный WebSocket).
# Печатаемые функции пишут только несекретное. Коды возврата: 0 успех, 1 отказ/ошибка API, 2 неверные аргументы.

# Путь фиксирован и НЕ переопределяется окружением; исключение - тестовый режим STAND_TEST=1 (сухие прогоны на фиктивных файлах).
if [[ "${STAND_TEST:-0}" == 1 ]]; then PTERO_CRED_FILE="${PTERO_CRED_FILE:-/home/twomc/pterodactyl-credentials.txt}"; else PTERO_CRED_FILE=/home/twomc/pterodactyl-credentials.txt; fi

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
PTERO_NODE_IMAGE_MIRROR="${PTERO_NODE_IMAGE_MIRROR:-node:22-alpine}"
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
  [[ -r "$PTERO_CRED_FILE" ]] || { ptero_die "нет файла учётных данных (PTERO_CRED_FILE)"; return 1; }
  twomc_secure_file "$PTERO_CRED_FILE" || { ptero_die "файл учётных данных отвергнут (нужны права 600 и владелец - текущий пользователь)"; return 1; }
  PANEL_URL=""; SERVER_UUID=""; CLIENT_API_KEY=""
  # shellcheck disable=SC1090
  . "$PTERO_CRED_FILE"
  [[ -n "$PANEL_URL" && -n "$SERVER_UUID" && -n "$CLIENT_API_KEY" ]] || { ptero_die "в файле нет PANEL_URL, SERVER_UUID или CLIENT_API_KEY"; return 1; }
  [[ "$SERVER_UUID" =~ ^[0-9a-fA-F-]{8,36}$ ]] || { ptero_die "SERVER_UUID неверного формата"; return 1; }
  [[ "$PANEL_URL" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._/-]*)?$ ]] || { ptero_die "PANEL_URL должен быть http(s)://хост[/путь]"; return 1; }
  [[ "$PANEL_URL" == https://* ]] || echo "ptero: предупреждение: панель по http, ключ API идёт открытым текстом (допустимо только внутри доверенной сети)" >&2
  local base="${PANEL_URL%/}"
  base="${base%/account/api}"
  PTERO_ORIGIN="${base%/}"
  PTERO_BASE="${PTERO_ORIGIN}/api/client"
  PTERO_SRV="$PTERO_BASE/servers/$SERVER_UUID"
  _pt_mktemp || return 1; PTERO_BODY="$_PT_LAST"
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

# Белые списки путей (см. шапку). _pt_path_allowed <list|read|fetch|write> <путь>.
_PT_TS_RE='[0-9]{8}T[0-9]{6}Z'
_pt_path_allowed() {
  local op="$1" p="$2"
  [[ "$p" == "/" ]] || p="${p%/}"
  [[ -n "$p" ]] || p="/"
  local re
  case "$op" in
    list) case "$p" in /|/plugins) return 0 ;; esac ;;
    read) case "$p" in /server.properties|/version_history.json|/logs/latest.log|/plugins/TwoMCBridge/config.yml) return 0 ;; esac ;;
    fetch) case "$p" in /plugins/TwoMCBridge/config.yml|/plugins/TwoMCBridge/bridge-key.txt) return 0 ;; esac ;;
    write) re="^/plugins/TwoMCBridge/(config\.yml|bridge-key\.txt)(\.bak-$_PT_TS_RE|\.disabled-$_PT_TS_RE)?\$"; [[ "$p" =~ $re ]] && return 0 ;;
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

# ---- запись (только при PTERO_ALLOW_WRITE=1 и только по белым спискам) ----

# file_write <путь-на-сервере> <локальный-файл>: POST /files/write?file=... (тело = содержимое файла, без вывода).
ptero_file_write() {
  _pt_check_path "$1" || return 2
  _pt_path_allowed write "$1" || return 2
  [[ -f "$2" ]] || { ptero_die "нет локального файла для записи"; return 2; }
  _pt_req POST "/files/write?file=$(_pt_urlenc_path "$1")" --data-binary "@$2" -H 'Content-Type: text/plain' || return 1
  [[ "$PTERO_HTTP" == "204" || "$PTERO_HTTP" == "200" ]] || { echo "file_write: HTTP $PTERO_HTTP" >&2; return 1; }
}

# upload <локальный-файл> <каталог-на-сервере> <имя-на-сервере>: GET /files/upload -> signed URL (не печатается), multipart.
# Разрешено только /plugins + TwoMCBridge-0.1.0.jar.
ptero_upload() {
  local local_file="$1" dir="$2" name="$3"
  [[ "$PTERO_ALLOW_WRITE" == "1" ]] || { ptero_die "запись запрещена (PTERO_ALLOW_WRITE!=1): upload"; return 1; }
  [[ "${dir%/}" == "/plugins" && "$name" == "TwoMCBridge-0.1.0.jar" ]] || { ptero_die "upload: разрешён только /plugins/TwoMCBridge-0.1.0.jar"; return 2; }
  [[ -f "$local_file" ]] || { ptero_die "нет локального файла для загрузки"; return 2; }
  _pt_check_path "$dir" || return 2
  _pt_req GET /files/upload || return 1
  [[ "$PTERO_HTTP" == "200" ]] || { _pt_wipe; echo "upload: получение URL, HTTP $PTERO_HTTP" >&2; return 1; }
  local url; url="$(ptero_json_str "$PTERO_BODY" url)"; _pt_wipe
  url="${url//\\//\/}"; url="${url//\u0026/&}"
  [[ "$url" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]+)?/upload/file\?[A-Za-z0-9._=\&%~+-]+$ ]] || { url=""; ptero_die "signed URL неожиданного формата"; return 1; }
  # Каталог и имя - наши проверенные константы; недоверенных значений в форме нет. Имя файла задаётся --form-string-стилем: filename= в -F.
  local code
  code="$(curl -sS --max-time 300 -o /dev/null -w '%{http_code}' -K <(printf 'url = "%s&directory=%s"\n' "$url" "$(_pt_urlenc_path "$dir")") \
    -X POST --form "files=@${local_file};filename=${name}" </dev/null 2>/dev/null)" || code="000"
  unset url
  [[ "$code" == "200" || "$code" == "204" ]] || { echo "upload: HTTP $code" >&2; return 1; }
}

# power <signal>: разрешён только restart.
ptero_power() {
  [[ "$1" == "restart" ]] || { ptero_die "разрешён только сигнал restart"; return 2; }
  _pt_req POST /power -H 'Content-Type: application/json' --data-raw '{"signal":"restart"}' || return 1
  [[ "$PTERO_HTTP" == "204" ]] || { echo "power: HTTP $PTERO_HTTP" >&2; return 1; }
}

# Белый список консольных команд: `say TwoMC: <текст [A-Za-z0-9 .,:!?-]>`, `list`, `twomcbridge events`. Остальное (op, stop, ...) - отказ.
_pt_cmd_allowed() {
  local c="$1" re='^say TwoMC: [A-Za-z0-9 .,:!?-]{1,120}$'
  case "$c" in
    "list"|"twomcbridge events") return 0 ;;
  esac
  [[ "$c" != *$'\n'* && "$c" =~ $re ]] && return 0
  ptero_die "консольная команда не в белом списке"; return 1
}

# command <строка>: POST /command. Только белый список (_pt_cmd_allowed); JSON безопасен: символы без кавычек и обратной косой.
ptero_command() {
  _pt_cmd_allowed "$1" || return 2
  _pt_req POST /command -H 'Content-Type: application/json' --data-raw "{\"command\":\"$1\"}" || return 1
  [[ "$PTERO_HTTP" == "204" ]] || { echo "command: HTTP $PTERO_HTTP" >&2; return 1; }
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
  img="$(_pt_node_image)" || return 1
  _pt_req GET /websocket || return 1
  if [[ "$PTERO_HTTP" == "429" ]]; then sleep 45; _pt_req GET /websocket || return 1; fi   # панель ограничивает частоту выдачи токенов
  [[ "$PTERO_HTTP" == "200" ]] || { _pt_wipe; echo "websocket: HTTP $PTERO_HTTP" >&2; return 1; }
  local tok sock
  tok="$(ptero_json_str "$PTERO_BODY" token)"; sock="$(ptero_json_str "$PTERO_BODY" socket)"
  sock="${sock//\\\//\/}"   # JSON экранирует «/» как «\/»
  : > "$PTERO_BODY"
  [[ "$tok" =~ ^[A-Za-z0-9._-]+$ && "$sock" =~ ^wss?://[A-Za-z0-9.-]+(:[0-9]+)?/[A-Za-z0-9._/-]+$ ]] || { ptero_die "ответ websocket неожиданного формата"; return 1; }
  # Значения передаются через --env-file из process substitution (не в argv и не в docker inspect с -e).
  timeout $(( secs + 40 )) docker run --rm --read-only --cap-drop ALL --security-opt no-new-privileges --memory 128m \
    --env-file <(printf 'PT_WS_TOKEN=%s\nPT_WS_SOCKET=%s\nPT_ORIGIN=%s\nPT_SECS=%s\nPT_SEND=%s\nPT_LOGS=%s\nPT_UNTIL=%s\nPT_FAIL=%s\nPT_FILTER=%s\n' \
      "$tok" "$sock" "$PTERO_ORIGIN" "$secs" "$send" "$logs" "$until" "$fail" "$filter") \
    "$img" node -e "$_PT_WS_JS" </dev/null 2>/dev/null
  local rc=$?
  unset tok sock
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
    grep '^L: ' <<<"$out" | grep -i 'players\|online' | sed 's#https\?://[^ ]*#<url>#g; s/[0-9a-fA-F]\{32,\}/<hex>/g' | head -n 10
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

# ptero_restart_guard <install|rollback>: перед restart. Игроки онлайн -> `say`-предупреждение и ожидание 60 с; затем игроки проверяются ЕЩЁ РАЗ:
# если их стало больше (зашли новые) - второе предупреждение и ещё 30 с. Число игроков определить нельзя -> отказ (код 1).
# Только при PTERO_ALLOW_WRITE=1 (команда list и say). Ожидания можно сократить только для сухих прогонов: PTERO_GUARD_WAIT1/PTERO_GUARD_WAIT2.
ptero_restart_guard() {
  local why="$1" w1="${PTERO_GUARD_WAIT1:-60}" w2="${PTERO_GUARD_WAIT2:-30}" pl n n2
  [[ "$why" =~ ^(install|rollback)$ && "$w1" =~ ^[0-9]{1,3}$ && "$w2" =~ ^[0-9]{1,3}$ ]] || { ptero_die "restart_guard: неверные аргументы"; return 2; }
  [[ "$PTERO_ALLOW_WRITE" == "1" ]] || { ptero_die "restart_guard требует PTERO_ALLOW_WRITE=1"; return 1; }
  pl="$(ptero_players_online)"; n="${pl#players=}"   # stderr (диагностика ws) виден
  [[ "$n" =~ ^[0-9]+$ ]] || { echo "не удалось определить число игроков (websocket или команда list)"; return 1; }
  echo "игроков онлайн: $n"
  (( n == 0 )) && return 0
  echo "предупреждение в чат и ожидание $w1 с"
  ptero_command "say TwoMC: server restart in 60 seconds for plugin $why" || { echo "не удалось отправить предупреждение"; return 1; }
  sleep "$w1"
  pl="$(ptero_players_online 2>/dev/null)"; n2="${pl#players=}"
  [[ "$n2" =~ ^[0-9]+$ ]] || { echo "не удалось повторно определить число игроков"; return 1; }
  echo "игроков онлайн после ожидания: $n2"
  if (( n2 > n )); then
    echo "зашли новые игроки: второе предупреждение и ожидание $w2 с"
    ptero_command "say TwoMC: server restart in 30 seconds for plugin $why" || { echo "не удалось отправить второе предупреждение"; return 1; }
    sleep "$w2"
  fi
  return 0
}

# ---- файловые операции малого объёма (только при PTERO_ALLOW_WRITE=1 и только по белым спискам; JSON собирается из проверенных строк) ----
_pt_name_ok() { [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; }

# mkdir <корень> <имя>: POST /files/create-folder; разрешено только «/plugins» + «TwoMCBridge» (ошибка «уже существует» не критична, код 0/1).
ptero_mkdir() {
  _pt_check_path "$1" || return 2; _pt_name_ok "$2" || { ptero_die "недопустимое имя каталога"; return 2; }
  [[ "${1%/}" == "/plugins" && "$2" == "TwoMCBridge" ]] || { ptero_die "mkdir: разрешён только /plugins/TwoMCBridge"; return 2; }
  _pt_req POST /files/create-folder -H 'Content-Type: application/json' --data-raw "{\"root\":\"$1\",\"name\":\"$2\"}" || return 1
  [[ "$PTERO_HTTP" == "204" || "$PTERO_HTTP" == "200" ]]
}

# chmod <корень> <файл> <режим 3 цифры>: POST /files/chmod (на части версий панели может отсутствовать: вызывающий трактует как предупреждение).
ptero_chmod() {
  _pt_check_path "$1" || return 2; _pt_name_ok "$2" || return 2; [[ "$3" =~ ^[0-7]{3}$ ]] || return 2
  local re="^bridge-key\.txt(\.bak-$_PT_TS_RE)?\$"
  [[ "${1%/}" == "/plugins/TwoMCBridge" && "$2" =~ $re && "$3" == "600" ]] || { ptero_die "chmod: разрешён только 600 для bridge-key.txt[.bak-<время>] в /plugins/TwoMCBridge"; return 2; }
  _pt_req POST /files/chmod -H 'Content-Type: application/json' --data-raw "{\"root\":\"$1\",\"files\":[{\"file\":\"$2\",\"mode\":\"$3\"}]}" || return 1
  [[ "$PTERO_HTTP" == "204" || "$PTERO_HTTP" == "200" ]]
}

# rename <корень> <от> <к>: POST /files/rename (откат без удаления: jar переименовывается в *.disabled-*).
ptero_rename() {
  _pt_check_path "$1" || return 2; _pt_name_ok "$2" || return 2; _pt_name_ok "$3" || return 2
  local root="${1%/}" ok=0 re="^\.disabled-$_PT_TS_RE\$"
  if [[ "$root" == "/plugins" && "$2" == "TwoMCBridge-0.1.0.jar" && "$3" == "$2"* && "${3#"$2"}" =~ $re ]]; then ok=1; fi
  if [[ "$root" == "/plugins/TwoMCBridge" && ( "$2" == "config.yml" || "$2" == "bridge-key.txt" ) && "$3" == "$2"* && "${3#"$2"}" =~ $re ]]; then ok=1; fi
  [[ "$ok" == 1 ]] || { ptero_die "rename: разрешено только <файл Bridge> -> <файл>.disabled-<время>"; return 2; }
  _pt_req POST /files/rename -H 'Content-Type: application/json' --data-raw "{\"root\":\"$1\",\"files\":[{\"from\":\"$2\",\"to\":\"$3\"}]}" || return 1
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
