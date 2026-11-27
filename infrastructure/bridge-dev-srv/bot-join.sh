#!/usr/bin/env bash
# Тестовый игрок (mineflayer, офлайн-авторизация) заходит на dev-srv на N секунд: двигается, переключает слоты и выходит.
# Запускается НА VDS: run-on-vds.sh script bot-join.sh <ник> [секунды=90] | --check
#   <ник>      3-16 символов [A-Za-z0-9_]; должен совпадать с ником, привязанным к админу стенда (link-account.sh)
#   секунды    10..600 (по умолчанию 90)
#   --check    только чтение: GET аллокации и GET списка /plugins (поиск плагинов авторизации); бот не запускается
# Панель: ТОЛЬКО чтение (PTERO_ALLOW_WRITE=0): аллокация (адрес и порт) и список /plugins сервера из SERVER_UUID.
# Бот: временный контейнер (образ node как в ptero.sh), `npm i mineflayer` ВНУТРИ контейнера (в репозиторий и на хост ничего не ставится),
# --read-only + tmpfs, cap-drop ALL, память 384 МБ. Команды: только /register и /login (если найден плагин авторизации); команд оператора нет.
# Пароль бота: случайный, файл /home/twomc/bridge-dev-bot.pass (600, создаётся при первом запуске, чтобы повторные входы совпадали);
# в контейнер уходит через env-file из process substitution, нигде не печатается (в сообщениях об ошибках вырезается).
# Плагины авторизации: AuthMe/nLogin/LoginSecurity/FastLogin... -> бот делает /register и /login; незнакомый плагин с «auth/login» в имени ->
# бот пробует те же команды и сообщает «РУЧНОЙ ВХОД», если сервер его кикнул с просьбой войти.
# Печатаются только этапы: connected, spawned, auth-sent, activity, leaving, left и ошибки (без секретов). Коды: 0 вышел штатно, 1 ошибка, 2 аргументы, 3 нужен ручной вход.
set -uo pipefail
if ! declare -F ptero_init >/dev/null 2>&1; then source "$(dirname "${BASH_SOURCE[0]}")/ptero.sh"; fi
trap ptero_cleanup EXIT

NICK=""; SECS=90; CHECK=0
for a in "$@"; do
  case "$a" in
    --check) CHECK=1 ;;
    -*) echo "Неизвестный аргумент: $a" >&2; exit 2 ;;
    *) if [[ -z "$NICK" ]]; then NICK="$a"; elif [[ "$a" =~ ^[0-9]+$ ]]; then SECS="$a"; else echo "Лишний аргумент: $a" >&2; exit 2; fi ;;
  esac
done
[[ "$NICK" =~ ^[A-Za-z0-9_]{3,16}$ ]] || { echo "Использование: bot-join.sh <ник 3-16 [A-Za-z0-9_]> [секунды 10-600] | --check" >&2; exit 2; }
{ [[ "$SECS" =~ ^[0-9]{2,3}$ ]] && (( SECS >= 10 && SECS <= 600 )); } || { echo "секунды: 10..600" >&2; exit 2; }
BOT_VERSION="${BOT_MC_VERSION:-1.21.4}"
[[ "$BOT_VERSION" =~ ^1\.[0-9]{1,2}(\.[0-9]{1,2})?$ ]] || { echo "BOT_MC_VERSION: неверный формат" >&2; exit 2; }
PASS_FILE="${BOT_PASS_FILE:-/home/twomc/bridge-dev-bot.pass}"

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
    chmod 600 "$PASS_FILE"
  fi
  [[ "$(cat "$PASS_FILE")" =~ ^[0-9a-f]{20}$ ]] || { echo "ОШИБКА: файл пароля бота неверного формата (скрипт его не перезаписывает)"; exit 1; }
fi

BOTDIR="$(umask 077; mktemp -d "${TMPDIR:-/tmp}/dev-srv-bot.XXXXXX")" || exit 1
trap 'rm -rf -- "$BOTDIR"; ptero_cleanup' EXIT
cat > "$BOTDIR/bot.js" <<'BOT_JS_EOF'
'use strict';
// Временный бот (только внутри контейнера). Значения читает из env; секрет в вывод не попадает.
const mineflayer = require('mineflayer');
const E = process.env;
const PASS = E.BOT_PASS || '';
const SECS = Number(E.BOT_SECS) || 90;
const clean = (v) => {
  let s = String(v == null ? '' : v);
  if (PASS) s = s.split(PASS).join('***');
  return s.replace(/[^\x20-\x7e]/g, '?').slice(0, 120);
};
let phase = 'start';
let manual = false;
const bot = mineflayer.createBot({
  host: E.BOT_HOST, port: Number(E.BOT_PORT), username: E.BOT_NICK, auth: 'offline',
  version: E.BOT_VERSION, hideErrors: true, checkTimeoutInterval: 60000,
});
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
bot.on('end', () => {
  if (leaving) { console.log('STAGE left'); process.exit(manual ? 3 : 0); }
  console.log('ERROR connection-ended phase=' + phase);
  process.exit(manual ? 3 : 1);
});
bot.on('kicked', (reason) => {
  const r = clean(typeof reason === 'string' ? reason : JSON.stringify(reason));
  console.log('ERROR kicked: ' + r);
  if (/log ?in|regist|auth|парол|вход/i.test(r)) { manual = true; console.log('MANUAL_LOGIN_NEEDED'); }
});
bot.on('error', (e) => { console.log('ERROR ' + clean(e && (e.code || e.message))); });
bot.on('messagestr', (m) => {
  if (E.BOT_AUTH !== '1' && phase === 'spawned' && /please (log ?in|regist)|\/login|\/register|войдите|зарегистр/i.test(m)) {
    manual = true; console.log('MANUAL_LOGIN_NEEDED');
  }
});
BOT_JS_EOF
chmod 644 "$BOTDIR/bot.js"
if [[ "$AUTH_KIND" == none ]]; then BAUTH=0; else BAUTH=1; fi

echo "[3] запуск бота $NICK на $SECS с (контейнер, npm i mineflayer внутри)"
passline=""; [[ "$BAUTH" == 1 ]] && passline="BOT_PASS=$(cat "$PASS_FILE")"
out="$BOTDIR/bot.out"
timeout $(( SECS + 180 )) docker run --rm --read-only --tmpfs /tmp:rw,exec,size=300m --cap-drop ALL --security-opt no-new-privileges --memory 384m \
  --user "$(id -u):$(id -g)" -e HOME=/tmp -e npm_config_cache=/tmp/.npm -v "$BOTDIR:/bot:ro" \
  --env-file <(printf 'BOT_HOST=%s\nBOT_PORT=%s\nBOT_NICK=%s\nBOT_SECS=%s\nBOT_VERSION=%s\nBOT_AUTH=%s\n%s\n' "$HOST" "$PORT" "$NICK" "$SECS" "$BOT_VERSION" "$BAUTH" "$passline") \
  -w /tmp "$img" sh -c 'mkdir -p /tmp/b && cd /tmp/b && { npm i --no-audit --no-fund --silent mineflayer >/dev/null 2>&1 || { echo "ERROR npm-install-failed"; exit 1; }; }; NODE_PATH=/tmp/b/node_modules node /bot/bot.js' \
  </dev/null > "$out" 2>/dev/null
rc=$?
passline=""
# в вывод - только строки-этапы нашего бота (фильтр по префиксам)
grep -E '^(STAGE |ERROR |MANUAL_LOGIN_NEEDED)' "$out" | head -n 40
if grep -q '^MANUAL_LOGIN_NEEDED' "$out"; then
  echo "РУЧНОЙ ВХОД: сервер просит авторизацию, которую бот не прошёл. Владелец заходит сам ником $NICK (и вводит /register или /login), затем повторить."; exit 3
fi
if [[ $rc -eq 0 ]] && grep -q '^STAGE left' "$out"; then echo "готово: бот вышел штатно"; exit 0; fi
echo "ОШИБКА: бот завершился с кодом $rc"; exit 1
