#!/usr/bin/env bash
# Тестовый игрок (mineflayer, офлайн-авторизация) заходит на dev-srv на N секунд: двигается, переключает слоты и выходит.
# Запускается НА VDS: run-on-vds.sh script bot-join.sh <ник> [секунды=90] [--net host|bridge] | bot-join.sh --check <ник>
#   --net      сеть контейнера бота: host (ПО УМОЛЧАНИЮ, как у slp-check: bridge режется файрволом VDS) или bridge (только для отладки)
#   connect-timeout - диагностика: TCP с хоста (bash /dev/tcp) и из контейнера в сетях host и bridge, вывод какой путь работает
#   причины kick/end/error mineflayer печатаются (hideErrors: false; ники других игроков, IP, UUID маскируются)
#   <ник>      3-16 символов [A-Za-z0-9_]; должен совпадать с ником, привязанным к админу стенда (link-account.sh)
#   секунды    10..600 (по умолчанию 90)
#   --check    только чтение: GET аллокации и GET списка /plugins (поиск плагинов авторизации); бот не запускается
# Панель: ТОЛЬКО чтение (PTERO_ALLOW_WRITE=0): аллокация (адрес и порт) и список /plugins сервера из SERVER_UUID.
# Бот: временный контейнер (образ node как в ptero.sh), `npm i --ignore-scripts --no-audit --no-fund mineflayer@<закреплённая версия>` + `npm ls --all` в лог (lock не используется; контейнер видит пароль только до его первого чтения ботом, затем файл удаляется) ВНУТРИ контейнера (в репозиторий и на хост
# ничего не ставится, install-скрипты зависимостей не выполняются). Версия закреплена: BOT_MINEFLAYER_VERSION, по умолчанию 4.27.0 (testedVersions включает 1.21.4).
# --read-only + tmpfs 1g (в ОЗУ), cap-drop ALL, лимит памяти 1280 МБ (проверка MemAvailable хоста перед запуском). Команды: только /register и /login (если найден плагин авторизации); команд оператора нет.
# Пароль бота: случайный, файл /home/twomc/bridge-dev-bot.pass (600, создаётся при первом запуске, чтобы повторные входы совпадали);
# в контейнер НЕ передаётся через env (не виден в docker inspect): копия в файл 600 внутри tmpfs (/dev/shm; запасной вариант - TMPDIR) монтируется как /botpass/pass (бот читает и сразу удаляет),
# удаляется при выходе; нигде не печатается (вывод бота и хоста редактируется по самому паролю и по любым hex длиной от 20).
# Плагины авторизации: AuthMe/nLogin/LoginSecurity/FastLogin... -> бот делает /register и /login; незнакомый плагин с «auth/login» в имени ->
# бот пробует те же команды и сообщает «РУЧНОЙ ВХОД», если сервер его кикнул с просьбой войти.
# Печатаются только этапы: connected, spawned, auth-sent, activity, leaving, left и ошибки (без секретов). Коды: 0 вышел штатно, 1 ошибка, 2 аргументы, 3 нужен ручной вход.
export LC_ALL=C
set -uo pipefail
if ! declare -F ptero_init >/dev/null 2>&1; then source "$(dirname "${BASH_SOURCE[0]}")/ptero.sh"; fi
trap ptero_cleanup EXIT

NICK=""; SECS=90; CHECK=0; BOT_NET=host
while (( $# )); do
  a="$1"
  case "$a" in
    --check) CHECK=1 ;;
    --net) shift; BOT_NET="${1:-}"; [[ "$BOT_NET" == host || "$BOT_NET" == bridge ]] || { echo "--net: host (по умолчанию) или bridge (отладка)" >&2; exit 2; } ;;
    -*) echo "Неизвестный аргумент: $a" >&2; exit 2 ;;
    *) if [[ -z "$NICK" ]]; then NICK="$a"; elif [[ "$a" =~ ^[0-9]+$ ]]; then SECS="$a"; else echo "Лишний аргумент: $a" >&2; exit 2; fi ;;
  esac
  shift
done
[[ "$NICK" =~ ^[A-Za-z0-9_]{3,16}$ ]] || { echo "Использование: bot-join.sh <ник 3-16 [A-Za-z0-9_]> [секунды 10-600] | --check <ник>" >&2; exit 2; }
{ [[ "$SECS" =~ ^[0-9]{2,3}$ ]] && (( SECS >= 10 && SECS <= 600 )); } || { echo "секунды: 10..600" >&2; exit 2; }
BOT_VERSION="${BOT_MC_VERSION:-1.21.4}"
MF_VERSION="${BOT_MINEFLAYER_VERSION:-4.27.0}"
[[ "$MF_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "BOT_MINEFLAYER_VERSION: нужна точная версия X.Y.Z" >&2; exit 2; }
[[ "$BOT_VERSION" =~ ^1\.[0-9]{1,2}(\.[0-9]{1,2})?$ ]] || { echo "BOT_MC_VERSION: неверный формат" >&2; exit 2; }
# Путь фиксирован, окружением не переопределяется (кроме STAND_TEST=1 для сухих прогонов).
PASS_FILE=/home/twomc/bridge-dev-bot.pass
[[ "${STAND_TEST:-0}" == 1 ]] && PASS_FILE="${BOT_PASS_FILE:-$PASS_FILE}"

export PTERO_ALLOW_WRITE=0
ptero_init || exit 1

echo "[1] адрес сервера (GET аллокации)"
alloc="$(ptero_allocation)" || { echo "ОШИБКА: не удалось получить аллокацию"; exit 1; }
HOST="${alloc% *}"; PORT="${alloc#* }"
echo "адрес: $HOST:$PORT"

echo "[2] плагины авторизации (GET /plugins)"
lst="$(ptero_files_list /plugins 2>/dev/null)"; lrc=$?
AUTH_KIND="none"; AUTH_NAMES=""
if [[ $lrc -ne 0 || -z "$lst" ]]; then
  echo "WARN: список /plugins не получен: плагины авторизации не проверены (бот отправит /register и /login на всякий случай)"
  AUTH_KIND="unknown"
else
  AUTH_NAMES="$(grep -iE '^- .*(auth|login)' <<<"$lst" | sed 's/^- //' | paste -sd' ' -)"
  if [[ -z "$AUTH_NAMES" ]]; then
    echo "плагины авторизации: не найдены (AuthMe/nLogin/подобные)"
  elif grep -qiE 'authme|nlogin|loginsecurity|fastlogin|openlogin|librelogin' <<<"$AUTH_NAMES"; then
    AUTH_KIND="known"; echo "плагины авторизации: НАЙДЕНЫ: $AUTH_NAMES (бот выполнит /register и /login)"
  else
    AUTH_KIND="other"; echo "плагины авторизации: возможные: $AUTH_NAMES (бот попробует /register и /login; при отказе потребуется ручной вход)"
  fi
fi
if [[ "$CHECK" == 1 ]]; then echo "--check: бот не запускался."; exit 0; fi

img="$(_pt_node_image 2>/dev/null)" || { echo "ОШИБКА: нет локального образа node (docker pull здесь не выполняется)"; exit 1; }

# пароль бота (только в файле 600; не печатается)
if [[ "$AUTH_KIND" != none ]]; then
  if [[ ! -s "$PASS_FILE" ]]; then
    ( umask 077; head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n' | head -c 20 > "$PASS_FILE" ) || { echo "ОШИБКА: не создан файл пароля бота"; exit 1; }
    chmod 600 "$PASS_FILE" || { echo "ОШИБКА: chmod 600 файла пароля бота не выполнен"; exit 1; }
  fi
  twomc_secure_file "$PASS_FILE" || { echo "ОШИБКА: файл пароля бота отвергнут (права ровно 600, владелец - текущий пользователь)"; exit 1; }
  [[ "$(cat "$PASS_FILE")" =~ ^[0-9a-f]{20}$ ]] || { echo "ОШИБКА: файл пароля бота неверного формата (скрипт его не перезаписывает)"; exit 1; }
fi

# рабочий каталог бота: tmpfs (/dev/shm), 700; файл пароля - 600, монтируется в контейнер ro (в env контейнера пароля нет)
SHM=""; [[ -d /dev/shm && -w /dev/shm ]] && SHM=/dev/shm
BOTDIR=""
[[ -z "$SHM" ]] || BOTDIR="$(umask 077; mktemp -d "$SHM/dev-srv-bot.XXXXXX" 2>/dev/null)" || { BOTDIR=""; SHM=""; }   # /dev/shm может быть недоступен для mktemp
[[ -n "$BOTDIR" ]] || BOTDIR="$(umask 077; mktemp -d "${TMPDIR:-/tmp}/dev-srv-bot.XXXXXX")" || exit 1
[[ -n "$SHM" ]] || echo "WARN: /dev/shm недоступен: файл пароля во временном каталоге на диске (затирается и удаляется при выходе)"
bot_cleanup() { { [[ -n "${BOTDIR:-}" && -f "$BOTDIR/p/pass" ]] && : > "$BOTDIR/p/pass"; } 2>/dev/null; [[ -n "${BOTDIR:-}" ]] && { chmod -R u+rwX -- "$BOTDIR" 2>/dev/null; rm -rf -- "$BOTDIR" 2>/dev/null; }; ptero_cleanup; }
trap bot_cleanup EXIT
cat > "$BOTDIR/bot.js" <<'BOT_JS_EOF'
'use strict';
// Временный бот (только внутри контейнера). Значения читает из env; секрет в вывод не попадает.
const mineflayer = require('mineflayer');
const E = process.env;
// пароль читается один раз и сразу удаляется из контейнера (каталог /botpass доступен на запись только для удаления файла)
let PASS = '';
if (E.BOT_AUTH === '1') { const fs = require('fs'); PASS = String(fs.readFileSync('/botpass/pass', 'utf8')).trim(); try { fs.unlinkSync('/botpass/pass'); } catch (e) { fs.writeFileSync('/botpass/pass', ''); } }
const SECS = Number(E.BOT_SECS) || 90;
let bot = null;
const clean = (v) => {
  let s = String(v == null ? '' : v);
  if (PASS) s = s.split(PASS).join('***');
  // ники других игроков (из bot.players) -> <player>; ник бота остаётся
  try {
    for (const n of Object.keys((bot && bot.players) || {})) {
      if (n && n !== E.BOT_NICK && /^[A-Za-z0-9_]{3,16}$/.test(n)) s = s.replace(new RegExp('\\b' + n + '\\b', 'g'), '<player>');
    }
  } catch (_) {}
  s = s.replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, '<uuid>');
  s = s.replace(/\d{1,3}(\.\d{1,3}){3}(:\d{1,5})?/g, '<ip>');
  s = s.replace(/[0-9a-fA-F]{20,}/g, '[REDACTED]');
  return s.replace(/[^\x20-\x7e]/g, '?').slice(0, 300);
};
// текст причины из JSON-компонента чата (строка, {text,extra,translate,with} или NBT-вид {type:'string',value}); без форматирования
const reasonText = (r) => {
  const out = [];
  const walk = (o, d) => {
    if (o == null || d > 8) return;
    if (typeof o === 'string') { out.push(o); return; }
    if (Array.isArray(o)) { o.forEach((x) => walk(x, d + 1)); return; }
    if (typeof o !== 'object') return;
    if (o.type === 'string' && typeof o.value === 'string') { out.push(o.value); return; }
    for (const k of Object.keys(o)) {
      if ((k === 'text' || k === 'translate') && typeof o[k] === 'string') out.push(o[k]);
      else if (o[k] && typeof o[k] === 'object') walk(o[k], d + 1);   // строки других ключей (type, color, ...) не берутся
    }
  };
  let v = r;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (_) { out.push(v); v = null; } }
  walk(v, 0);
  return out.join('').replace(/§./g, '') || '(пусто)';
};
let phase = 'start';
let manual = false;
// hideErrors: false - иначе mineflayer глушит причины сбоев; лишний вывод библиотеки отсекается фильтром префиксов на стороне хоста
bot = mineflayer.createBot({
  host: E.BOT_HOST, port: Number(E.BOT_PORT), username: E.BOT_NICK, auth: 'offline',
  version: E.BOT_VERSION, hideErrors: false, checkTimeoutInterval: 60000,
});
process.on('uncaughtException', (e) => { console.log('ERROR uncaught phase=' + phase + ' ' + clean(e && (e.code || e.message))); process.exit(1); });
try { bot._client.on('error', (e) => console.log('ERROR client-error phase=' + phase + ' ' + clean(e && (e.code || e.message)))); } catch (_) {}
try { bot._client.on('disconnect', (p) => console.log('ERROR disconnect-packet phase=' + phase + ': ' + clean(reasonText(p && p.reason)))); } catch (_) {}
const connectTimer = setTimeout(() => {
  console.log('ERROR connect-timeout (45s)'); process.exit(1);
}, 45000);
bot.once('login', () => { phase = 'connected'; clearTimeout(connectTimer); console.log('STAGE connected'); });
bot.once('spawn', () => {
  phase = 'spawned'; console.log('STAGE spawned');
  if (E.BOT_AUTH === '1') {
    setTimeout(() => { try { bot.chat('/register ' + PASS + ' ' + PASS); } catch (_) {} }, 1500);
    setTimeout(() => { try { bot.chat('/login ' + PASS); console.log('STAGE auth-sent'); } catch (_) {} }, 4000);
  }
  setTimeout(activity, 7000);
  setTimeout(leave, SECS * 1000);
});
function activity() {
  console.log('STAGE activity');
  let i = 0;
  const t = setInterval(() => {
    try {
      i += 1;
      bot.look(bot.entity.yaw + 0.9, 0, true);
      bot.setControlState('forward', i % 4 < 2);
      bot.setControlState('jump', i % 5 === 0);
      bot.setQuickBarSlot(i % 9);
      bot.swingArm('right');
      // инвентарь: клик по ПУСТОМУ слоту с пустым курсором (предметы не перемещаются)
      if (i % 6 === 0 && bot.inventory.slots[9] == null && !bot.inventory.selectedItem) bot.clickWindow(9, 0, 0).catch(() => {});
    } catch (_) {}
  }, 1200);
  t.unref();
}
let leaving = false;
function leave() {
  if (leaving) return;
  leaving = true;
  console.log('STAGE leaving');
  try { bot.clearControlStates(); bot.quit(); } catch (_) {}
  setTimeout(() => { console.log('STAGE left'); process.exit(manual ? 3 : 0); }, 3000).unref();
}
bot.on('end', (why) => {
  if (leaving) { console.log('STAGE left'); process.exit(manual ? 3 : 0); }
  console.log('ERROR connection-ended phase=' + phase + (why ? ' reason=' + clean(reasonText(why)) : ''));
  process.exit(manual ? 3 : 1);
});
bot.on('kicked', (reason, loggedIn) => {
  const r = clean(reasonText(reason));
  console.log('ERROR kicked phase=' + phase + (loggedIn === false ? ' (login)' : '') + ': ' + r);
  if (/log ?in|regist|auth|парол|вход/i.test(r)) { manual = true; console.log('MANUAL_LOGIN_NEEDED'); }
});
bot.on('error', (e) => { console.log('ERROR error phase=' + phase + ' ' + clean(e && (e.code || e.message))); });
bot.on('messagestr', (m) => {
  if (E.BOT_AUTH !== '1' && phase === 'spawned' && /please (log ?in|regist)|\/login|\/register|войдите|зарегистр/i.test(m)) {
    manual = true; console.log('MANUAL_LOGIN_NEEDED');
  }
});
BOT_JS_EOF
chmod 644 "$BOTDIR/bot.js"
if [[ "$AUTH_KIND" == none ]]; then BAUTH=0; else BAUTH=1; fi

# tmpfs контейнера живёт в ОЗУ и входит в лимит памяти: 300 МБ не хватало npm (ENOSPC), теперь tmpfs 1g при лимите памяти 1280m (кэш npm удаляется после установки).
# Перед запуском проверяется доступная память хоста (MemAvailable) и, если /dev/shm используется, место в нём. Значения меняются только в STAND_TEST=1.
BOT_TMPFS=1g; BOT_MEM=1280m; BOT_MIN_AVAIL_MB=1400
MEMINFO=/proc/meminfo; [[ "${STAND_TEST:-0}" == 1 ]] && MEMINFO="${BOT_MEMINFO_FILE:-$MEMINFO}"
avail_kb="$(sed -n 's/^MemAvailable:[[:space:]]*\([0-9][0-9]*\) kB.*/\1/p' "$MEMINFO" 2>/dev/null | head -n1)"
if [[ "$avail_kb" =~ ^[0-9]+$ ]]; then
  if (( avail_kb / 1024 < BOT_MIN_AVAIL_MB )); then echo "ОШИБКА: мало свободной памяти хоста: $(( avail_kb / 1024 )) МБ (нужно не меньше $BOT_MIN_AVAIL_MB МБ: tmpfs 1g + node); бот не запущен"; exit 1; fi
  echo "память хоста: доступно $(( avail_kb / 1024 )) МБ (нужно не меньше $BOT_MIN_AVAIL_MB МБ)"
else echo "WARN: MemAvailable не прочитан: проверка памяти пропущена"; fi
if [[ -n "$SHM" ]]; then
  shm_kb="$(df -Pk "$SHM" 2>/dev/null | awk 'NR==2{print $4}')"
  if [[ "$shm_kb" =~ ^[0-9]+$ ]] && (( shm_kb < 1024 )); then echo "ОШИБКА: в $SHM меньше 1 МБ свободного места: файл пароля не поместится"; exit 1; fi
fi

echo "[3] запуск бота $NICK на $SECS с (контейнер в сети $BOT_NET, npm i --ignore-scripts mineflayer@$MF_VERSION внутри)"
# пользователь контейнера: по умолчанию тот же uid:gid, что у хоста (файл пароля 600 в каталоге 700 читается и удаляется им же).
# Другой uid (BOT_CONTAINER_UID/BOT_CONTAINER_GID, например 1000 = node) - каталог p 777 и файл 644: безопасно, т.к. рабочий каталог $BOTDIR имеет 700
# (посторонние не дойдут до p), в контейнер монтируется только p.
HUID="$(id -u)"; HGID="$(id -g)"
CUID="${BOT_CONTAINER_UID:-$HUID}"; CGID="${BOT_CONTAINER_GID:-$HGID}"
[[ "$CUID" =~ ^[0-9]{1,10}$ && "$CGID" =~ ^[0-9]{1,10}$ ]] || { echo "ОШИБКА: BOT_CONTAINER_UID/GID должны быть числами"; exit 2; }
PASS_PLAIN=""
# каталог p создаётся ВСЕГДА (иначе docker -v создаёт его от root и хост получает Permission denied при затирании/удалении)
( umask 077; mkdir -p "$BOTDIR/p" ) || { echo "ОШИБКА: не создан каталог $BOTDIR/p"; exit 1; }
if [[ "$CUID" == "$HUID" ]]; then DMODE=700; FMODE=600; else DMODE=777; FMODE=644; fi
chmod "$DMODE" "$BOTDIR/p" || { echo "ОШИБКА: chmod каталога пароля не выполнен"; exit 1; }
if [[ "$BAUTH" == 1 ]]; then
  ( umask 077; cat "$PASS_FILE" > "$BOTDIR/p/pass" ) || { echo "ОШИБКА: не создана копия пароля в рабочем каталоге"; exit 1; }
  chmod "$FMODE" "$BOTDIR/p/pass" || { echo "ОШИБКА: chmod копии пароля не выполнен"; exit 1; }
  [[ "$CUID" == "$HUID" ]] || chown "$CUID:$CGID" "$BOTDIR/p/pass" 2>/dev/null || true
  PASS_PLAIN="$(cat "$PASS_FILE")"
  echo "права копии пароля: каталог $(stat -c %a "$BOTDIR/p" 2>/dev/null || echo ?), файл $(stat -c %a "$BOTDIR/p/pass" 2>/dev/null || echo ?); контейнер uid=$CUID (пароль не в env и не в argv, файл удаляется ботом после чтения)"
fi
# редакция вывода: сам пароль (если есть) и любые hex-строки от 20 символов
redact() { if [[ -n "$PASS_PLAIN" ]]; then sed -E -e "s/$PASS_PLAIN/***/g" -e 's/[0-9a-fA-F]{20,}/[REDACTED]/g'; else sed -E 's/[0-9a-fA-F]{20,}/[REDACTED]/g'; fi; }
out="$BOTDIR/bot.out"
timeout $(( SECS + 180 )) docker run --rm --read-only --tmpfs "/tmp:rw,exec,size=$BOT_TMPFS" --cap-drop ALL --security-opt no-new-privileges --memory "$BOT_MEM" --network "$BOT_NET" \
  --user "$CUID:$CGID" -e HOME=/tmp -e npm_config_cache=/tmp/.npm -v "$BOTDIR:/bot:ro" -v "$BOTDIR/p:/botpass" \
  --env-file <(printf 'BOT_HOST=%s\nBOT_PORT=%s\nBOT_NICK=%s\nBOT_SECS=%s\nBOT_VERSION=%s\nBOT_AUTH=%s\nBOT_MF=%s\n' "$HOST" "$PORT" "$NICK" "$SECS" "$BOT_VERSION" "$BAUTH" "$MF_VERSION") \
  -w /tmp "$img" sh -c 'mkdir -p /tmp/b && cd /tmp/b && { npm i --ignore-scripts --no-audit --no-fund --prefer-offline "mineflayer@$BOT_MF" >/tmp/npm-i.log 2>&1 || { echo "ERROR npm-install-failed"; exit 1; }; }; npm ls --all 2>&1 | sed "s/^/NPMLS /" | head -n 400; rm -rf /tmp/.npm; NODE_PATH=/tmp/b/node_modules node /bot/bot.js' \
  </dev/null > "$out" 2>/dev/null
rc=$?
{ [[ -f "$BOTDIR/p/pass" ]] && : > "$BOTDIR/p/pass"; } 2>/dev/null
# в вывод - только строки-этапы нашего бота (фильтр по префиксам), с редакцией пароля; причины kick/end/error печатаются (замаскированы ботом)
grep -E '^(STAGE |ERROR |MANUAL_LOGIN_NEEDED)' "$out" | head -n 40 | redact
grep -E '^NPMLS ' "$out" | head -n 400 | redact   # дерево зависимостей (npm ls --all) в лог, без секретов

# Диагностика connect-timeout: TCP с хоста (bash /dev/tcp) и из контейнера в сетях host и bridge - какой путь работает.
_BJ_TCP_JS='const n=require("node:net");const s=n.connect({host:process.env.TCP_HOST,port:Number(process.env.TCP_PORT)});const t=setTimeout(()=>{console.log("TCP-FAIL:timeout");process.exit(1)},5000);s.on("connect",()=>{clearTimeout(t);console.log("TCP-OK");process.exit(0)});s.on("error",(e)=>{clearTimeout(t);console.log("TCP-FAIL:"+((e&&e.code)||"error"));process.exit(1)});'
bot_tcp_container() { # <сеть> -> «OK» или «FAIL:<код>»
  local r; r="$(timeout 20 docker run --rm --read-only --cap-drop ALL --security-opt no-new-privileges --memory 128m --network "$1" \
    -e TCP_HOST="$HOST" -e TCP_PORT="$PORT" "$img" node -e "$_BJ_TCP_JS" </dev/null 2>/dev/null | head -n1)"
  case "$r" in TCP-OK) echo OK ;; TCP-FAIL:[A-Za-z_-]*) echo "FAIL:${r#TCP-FAIL:}" ;; *) echo "FAIL:no-output" ;; esac
}
bot_diag() {
  local h c_host c_br
  if timeout 6 bash -c 'exec 3<>"/dev/tcp/$0/$1"' "$HOST" "$PORT" </dev/null >/dev/null 2>&1; then h=OK; else h=FAIL; fi
  c_host="$(bot_tcp_container host)"; c_br="$(bot_tcp_container bridge)"
  echo "DIAG: connect-timeout у бота (сеть контейнера $BOT_NET); проверка TCP до $HOST:$PORT"
  echo "DIAG: с хоста (bash /dev/tcp): $h"
  echo "DIAG: из контейнера, сеть host: $c_host"
  echo "DIAG: из контейнера, сеть bridge: $c_br"
  if [[ "$c_host" == OK && "$c_br" != OK ]]; then echo "DIAG: РАБОЧИЙ ПУТЬ: --net host; bridge не доходит (вероятно, ufw/DOCKER-USER FORWARD режет исходящие из docker bridge): бот должен идти в host-сети"
  elif [[ "$c_host" == OK && "$c_br" == OK ]]; then echo "DIAG: TCP доходит из обеих сетей: проблема не в сети, а в протоколе/версии/серверной стороне (см. ERROR-строки бота выше и verify-bridge.sh --log)"
  elif [[ "$h" == OK ]]; then echo "DIAG: с хоста TCP есть, из контейнера нет: ограничение docker/файрвола для контейнеров"
  else echo "DIAG: TCP не проходит и с хоста: сервер не слушает или порт закрыт (slp-check.sh, состояние сервера в панели, файрвол провайдера)"; fi
}
if grep -q '^ERROR connect-timeout' "$out"; then bot_diag; fi

if grep -q '^MANUAL_LOGIN_NEEDED' "$out"; then
  echo "РУЧНОЙ ВХОД: сервер просит авторизацию, которую бот не прошёл. Владелец заходит сам ником $NICK (и вводит /register или /login), затем повторить."; exit 3
fi
if [[ $rc -eq 0 ]] && grep -q '^STAGE left' "$out"; then echo "готово: бот вышел штатно"; exit 0; fi
echo "ОШИБКА: бот завершился с кодом $rc"; exit 1
