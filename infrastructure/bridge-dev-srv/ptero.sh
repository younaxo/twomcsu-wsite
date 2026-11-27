#!/usr/bin/env bash
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
#  - Ключ API передаётся в curl через конфиг из process substitution (не попадает в argv/ps), signed URL загрузки - так же.
#    Ключ, websocket-токен, signed URL, тела ответов с ними не печатаются; stderr curl отбрасывается (в нём бывает URL).
#  - Ничего не читает из stdin (все curl/docker с </dev/null), чтобы не съесть скрипт, поданный через `bash -s`.
# Зависимости на VDS: bash, curl, sed, grep, mktemp; для players_online/console_tail - docker и образ node:22 (встроенный WebSocket).
# Печатаемые функции пишут только несекретное. Коды возврата: 0 успех, 1 отказ/ошибка API, 2 неверные аргументы.

PTERO_CRED_FILE="${PTERO_CRED_FILE:-/home/twomc/pterodactyl-credentials.txt}"
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

_pt_mktemp() { _PT_LAST="$(umask 077; mktemp "${TMPDIR:-/tmp}/ptero.XXXXXX")" || return 1; PTERO_TMPS+=("$_PT_LAST"); }

ptero_init() {
  [[ -r "$PTERO_CRED_FILE" ]] || { ptero_die "нет файла учётных данных (PTERO_CRED_FILE)"; return 1; }
  local perm; perm="$(stat -c %a "$PTERO_CRED_FILE" 2>/dev/null || echo '?')"
  [[ "$perm" == "600" ]] || echo "ptero: предупреждение: права файла учётных данных $perm (ожидается 600)" >&2
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

# _pt_req <METHOD> <суффикс> [аргументы curl...]: PTERO_HTTP и PTERO_BODY. Всегда 0, если запрос ушёл; смотрите PTERO_HTTP.
_pt_req() {
  local method="$1" suffix="$2"; shift 2
  [[ -n "${PTERO_SRV:-}" ]] || { ptero_die "не вызван ptero_init"; return 1; }
  _pt_check_suffix "$suffix" || return 1
  case "$method" in
    GET) ;;
    POST) [[ "$PTERO_ALLOW_WRITE" == "1" ]] || { ptero_die "запись запрещена (PTERO_ALLOW_WRITE!=1): $method $suffix"; return 1; } ;;
    *) ptero_die "метод $method не разрешён"; return 1 ;;
  esac
  : > "$PTERO_BODY"
  PTERO_HTTP="$(curl -sS --max-time "${PTERO_TIMEOUT:-60}" -o "$PTERO_BODY" -w '%{http_code}' -X "$method" \
    -K <(_pt_auth_cfg) "$@" "$PTERO_SRV$suffix" </dev/null 2>/dev/null)" || PTERO_HTTP="000"
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
  local st; st="$(ptero_json_str "$PTERO_BODY" current_state)"
  echo "HTTP $PTERO_HTTP state=${st:-?}"
  [[ "$PTERO_HTTP" == "200" ]]
}

# state: только current_state на stdout (для ожидания).
ptero_state() { _pt_req GET /resources || return 1; [[ "$PTERO_HTTP" == "200" ]] && ptero_json_str "$PTERO_BODY" current_state; }

# files_list <каталог>: имена и признак каталога («d name» / «- name»); только имена.
ptero_files_list() {
  local dir="${1:-/}"; _pt_check_path "$dir" || return 2
  _pt_req GET "/files/list?directory=$(_pt_urlenc_path "$dir")" || return 1
  [[ "$PTERO_HTTP" == "200" ]] || { echo "HTTP $PTERO_HTTP"; return 1; }
  # Разбор по записям: attributes содержит name и is_file; порядок полей у Wings: name, mode, mode_bits, size, is_file, ...
  grep -o '"name":"[^"]*"\|"is_file":\(true\|false\)' "$PTERO_BODY" | paste -sd' ' - | sed 's/"name":"/\n/g' \
    | sed -n 's/^\([^"]*\)" "is_file":true.*/- \1/p; s/^\([^"]*\)" "is_file":false.*/d \1/p'
}

# file_read <путь>: содержимое файла в stdout (осторожно с секретами: вызывать только для несекретных файлов).
ptero_file_read() {
  _pt_check_path "$1" || return 2
  _pt_req GET "/files/contents?file=$(_pt_urlenc_path "$1")" || return 1
  [[ "$PTERO_HTTP" == "200" ]] || { echo "HTTP $PTERO_HTTP" >&2; return 1; }
  cat "$PTERO_BODY"
}

# file_exists <путь>: 0 если файл есть в каталоге (по списку).
ptero_file_exists() {
  local dir; dir="$(dirname "$1")"; [[ "$dir" == "." ]] && dir="/"
  ptero_files_list "$dir" 2>/dev/null | grep -qxF -- "- $(basename "$1")"
}

# startup_vars: имена переменных запуска; значения - только для белого списка несекретных.
ptero_startup_vars() {
  _pt_req GET /startup || return 1
  [[ "$PTERO_HTTP" == "200" ]] || { echo "HTTP $PTERO_HTTP"; return 1; }
  local pairs name val
  pairs="$(grep -o '"env_variable":"[^"]*"\|"server_value":"[^"]*"' "$PTERO_BODY" | paste -sd' ' - | sed 's/"env_variable":"/\n/g' | sed -n 's/^\([^"]*\)" "server_value":"\([^"]*\)".*/\1=\2/p')"
  while IFS='=' read -r name val; do
    [[ -n "$name" ]] || continue
    case "$name" in
      MINECRAFT_VERSION|SERVER_JARFILE|BUILD_NUMBER|MC_VERSION|VERSION|DL_VERSION|JARFILE|SERVER_PORT|MAX_PLAYERS|MEMORY) echo "var $name=$val" ;;
      *) echo "var $name=<скрыто>" ;;
    esac
  done <<<"$pairs"
  local img; img="$(ptero_json_str "$PTERO_BODY" docker_image)"; [[ -n "$img" ]] && echo "docker_image=$img"
  grep -o '"docker_images":{[^}]*}' "$PTERO_BODY" | head -n1 | sed 's/^/images: /'
}

# ---- запись (только при PTERO_ALLOW_WRITE=1) ----

# file_write <путь-на-сервере> <локальный-файл>: POST /files/write?file=... (тело = содержимое файла, без вывода).
ptero_file_write() {
  _pt_check_path "$1" || return 2
  [[ -f "$2" ]] || { ptero_die "нет локального файла для записи"; return 2; }
  _pt_req POST "/files/write?file=$(_pt_urlenc_path "$1")" --data-binary "@$2" -H 'Content-Type: text/plain' || return 1
  [[ "$PTERO_HTTP" == "204" || "$PTERO_HTTP" == "200" ]] || { echo "file_write: HTTP $PTERO_HTTP" >&2; return 1; }
}

# upload <локальный-файл> <каталог-на-сервере> <имя-на-сервере>: GET /files/upload -> signed URL (не печатается), multipart.
ptero_upload() {
  local local_file="$1" dir="$2" name="$3"
  [[ "$PTERO_ALLOW_WRITE" == "1" ]] || { ptero_die "запись запрещена (PTERO_ALLOW_WRITE!=1): upload"; return 1; }
  [[ -f "$local_file" ]] || { ptero_die "нет локального файла для загрузки"; return 2; }
  _pt_check_path "$dir" || return 2
  [[ "$name" =~ ^[A-Za-z0-9._-]+$ ]] || { ptero_die "недопустимое имя файла"; return 2; }
  _pt_req GET /files/upload || return 1
  [[ "$PTERO_HTTP" == "200" ]] || { echo "upload: получение URL, HTTP $PTERO_HTTP" >&2; return 1; }
  local url; url="$(ptero_json_str "$PTERO_BODY" url)"
  url="${url//\\\//\/}"; url="${url//\\u0026/&}"
  [[ "$url" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]+)?/upload/file\?[A-Za-z0-9._=\&%~+-]+$ ]] || { ptero_die "signed URL неожиданного формата"; return 1; }
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

# command <строка>: POST /command. Допустимы только простые символы (без кавычек и обратной косой): JSON собирается вручную.
ptero_command() {
  [[ "$1" =~ ^[A-Za-z0-9\ _.,:/@+=!-]{1,200}$ ]] || { ptero_die "недопустимая команда"; return 2; }
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
  [[ -z "$send" || "$send" =~ ^[A-Za-z0-9\ _.,:/@+=!-]{1,200}$ ]] || { ptero_die "недопустимая команда"; return 2; }
  [[ -z "$send" || "$PTERO_ALLOW_WRITE" == "1" ]] || { ptero_die "отправка команды в консоль запрещена (PTERO_ALLOW_WRITE!=1)"; return 1; }
  img="$(_pt_node_image)" || return 1
  _pt_req GET /websocket || return 1
  if [[ "$PTERO_HTTP" == "429" ]]; then sleep 45; _pt_req GET /websocket || return 1; fi   # панель ограничивает частоту выдачи токенов
  [[ "$PTERO_HTTP" == "200" ]] || { echo "websocket: HTTP $PTERO_HTTP" >&2; return 1; }
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

# players_online: отправляет команду list (только при PTERO_ALLOW_WRITE=1) и печатает «players=<N>» либо «players=?».
# Без записи (dry-run) команда НЕ отправляется: проверяется только websocket (AUTH_OK) и печатается «players=? (dry-run)».
ptero_players_online() {
  if [[ "$PTERO_ALLOW_WRITE" != "1" ]]; then
    local out; out="$(_pt_ws 0 "" 0 "" "" "")" || true
    if grep -q '^AUTH_OK' <<<"$out"; then echo "websocket=ok players=? (dry-run: команда list не отправляется)"; else echo "websocket=FAIL players=?"; return 1; fi
    return 0
  fi
  local out n
  out="$(_pt_ws 20 "list" 0 'There are [0-9]+ (of a max of )?[0-9]+ players online|[0-9]+ of a max' "" 'players online|of a max')" || true
  n="$(sed -n 's/.*There are \([0-9]\+\) .*players online.*/\1/p' <<<"$out" | head -n1)"
  [[ -n "$n" ]] || n="$(sed -n 's/.* \([0-9]\+\) of a max.*/\1/p' <<<"$out" | head -n1)"
  if [[ -n "$n" ]]; then echo "players=$n"; else echo "players=?"; return 1; fi
}

# server_image: образ Docker сервера (docker_image из GET /servers/<UUID>), несекретно.
ptero_server_image() {
  _pt_req GET "" || return 1
  [[ "$PTERO_HTTP" == "200" ]] || { echo "HTTP $PTERO_HTTP" >&2; return 1; }
  ptero_json_str "$PTERO_BODY" docker_image | tr -d "\\"
}

# ---- файловые операции малого объёма (только при PTERO_ALLOW_WRITE=1; имена проверяются, JSON собирается из проверенных строк) ----
_pt_name_ok() { [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; }

# mkdir <корень> <имя>: POST /files/create-folder (ошибка «уже существует» не критична, смотрите код возврата 0/1).
ptero_mkdir() {
  _pt_check_path "$1" || return 2; _pt_name_ok "$2" || { ptero_die "недопустимое имя каталога"; return 2; }
  _pt_req POST /files/create-folder -H 'Content-Type: application/json' --data-raw "{\"root\":\"$1\",\"name\":\"$2\"}" || return 1
  [[ "$PTERO_HTTP" == "204" || "$PTERO_HTTP" == "200" ]]
}

# chmod <корень> <файл> <режим 3 цифры>: POST /files/chmod (на части версий панели может отсутствовать: вызывающий трактует как предупреждение).
ptero_chmod() {
  _pt_check_path "$1" || return 2; _pt_name_ok "$2" || return 2; [[ "$3" =~ ^[0-7]{3}$ ]] || return 2
  _pt_req POST /files/chmod -H 'Content-Type: application/json' --data-raw "{\"root\":\"$1\",\"files\":[{\"file\":\"$2\",\"mode\":\"$3\"}]}" || return 1
  [[ "$PTERO_HTTP" == "204" || "$PTERO_HTTP" == "200" ]]
}

# rename <корень> <от> <к>: POST /files/rename (откат без удаления: jar переименовывается в *.disabled-*).
ptero_rename() {
  _pt_check_path "$1" || return 2; _pt_name_ok "$2" || return 2; _pt_name_ok "$3" || return 2
  _pt_req POST /files/rename -H 'Content-Type: application/json' --data-raw "{\"root\":\"$1\",\"files\":[{\"from\":\"$2\",\"to\":\"$3\"}]}" || return 1
  [[ "$PTERO_HTTP" == "204" || "$PTERO_HTTP" == "200" ]]
}

# command_capture <команда> <секунды> <until-regex> <filter-regex>: отправить команду в консоль и напечатать совпавшие строки ответа.
ptero_command_capture() { _pt_ws "$2" "$1" 0 "$3" "" "$4"; }

# allocation: основная аллокация сервера (GET /network/allocations), печатает «<хост> <порт>»: ip_alias, если задан, иначе ip.
# Только чтение. Значения несекретны (адрес игрового сервера). Код 1 - HTTP не 200 или формат неожиданный.
ptero_allocation() {
  _pt_req GET /network/allocations || return 1
  [[ "$PTERO_HTTP" == "200" ]] || { echo "HTTP $PTERO_HTTP" >&2; return 1; }
  local rec ip alias port host
  rec="$(sed 's/{"object":"allocation"/\n&/g' "$PTERO_BODY" | grep '"is_default":true' | head -n1)"
  [[ -n "$rec" ]] || { ptero_die "в ответе нет основной аллокации"; return 1; }
  ip="$(sed -n 's/.*"ip":"\([^"]*\)".*/\1/p' <<<"$rec")"
  alias="$(sed -n 's/.*"ip_alias":"\([^"]*\)".*/\1/p' <<<"$rec")"
  port="$(sed -n 's/.*"port":\([0-9][0-9]*\).*/\1/p' <<<"$rec")"
  host="${alias:-$ip}"
  [[ "$host" =~ ^[A-Za-z0-9.-]+$ && "$port" =~ ^[0-9]{2,5}$ ]] || { ptero_die "адрес аллокации неожиданного формата"; return 1; }
  printf '%s %s\n' "$host" "$port"
}
