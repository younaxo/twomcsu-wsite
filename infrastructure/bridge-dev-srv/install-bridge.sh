#!/usr/bin/env bash
# Установка плагина TwoMC Bridge на dev-srv (Pterodactyl). Запускается НА VDS: run-on-vds.sh install [--dry-run|--yes].
#   --dry-run  только чтение (GET): проверки версии/Java, наличие файлов, подписанный handshake сайта; ничего не меняет
#   --yes      выполнить установку (запись на панель: файлы, restart, команды консоли)
#   без флага  usage, ничего не делается
#   --sha256=<64 hex>  ожидаемый sha256 JAR (или переменная EXPECTED_SHA256); по умолчанию sha сборки 0.1.0:
#              6aa484549a3bf7408b41893c1b5ab0f78caf2839a13e4be8a032343297d7a7a8. Несовпадение - BLOCKER, JAR не загружается.
# Запускать через `run-on-vds.sh install ...` (пакет с ptero.sh); плагин ходит на SITE_URL/bridge/v1/* (без /api): на nginx стенда
# /bridge/v1/* должен идти мимо входа стенда (настраивается в другой цепочке, infrastructure/test-website/).
# Порядок (runbook docs/runbooks/bridge-dev-srv.md): stand-bridge-secret -> stand-flags -> register-dev-srv --yes -> link-account --yes ->
#   stage JAR -> install --dry-run -> install --yes -> bot-join -> проверка на стенде -> live-sigcheck. Этот скрипт - шаги install.
# Вход вне репозитория: /home/twomc/bridge-dev-srv.secret.env (права 600), его пишет register-dev-srv.sh (ключ только в файл, не в вывод):
#   KEY_ID=dev-srv.1                         (<slug>.<поколение>; slug ^[a-z0-9][a-z0-9-]{1,31}$, зарегистрирован на сайте)
#   KEY=<64 hex>                             (ключ сервера, вывод bridge:print-key)
#   SITE_URL=https://<домен стенда>          (без пути: плагин добавляет /bridge/v1/... сам)
#   Прежний формат (BRIDGE_SITE_URL, BRIDGE_SERVER_SLUG, BRIDGE_KEY_GEN, BRIDGE_KEY_HEX) тоже принимается.
# Файлы на VDS (кладёт `run-on-vds.sh stage <jar>`): ~/.twomc-inbox/TwoMCBridge.jar и bridge-config.yml.tpl.
# Секреты нигде не печатаются. Коды: 0 установлено и первый успешный запрос подтверждён, 3 установлено, подтверждение ждёт игрока
# онлайн (см. verify-bridge.sh), 1 блокер или ошибка, 2 неверные аргументы.
export LC_ALL=C
set -uo pipefail
if ! declare -F ptero_init >/dev/null 2>&1; then source "$(dirname "${BASH_SOURCE[0]}")/ptero.sh"; fi
trap ptero_cleanup EXIT

# Путь фиксирован, окружением не переопределяется (кроме STAND_TEST=1 для сухих прогонов).
SECRET_ENV=/home/twomc/bridge-dev-srv.secret.env
[[ "${STAND_TEST:-0}" == 1 ]] && SECRET_ENV="${BRIDGE_SECRET_ENV:-$SECRET_ENV}"
INBOX="$HOME/.twomc-inbox"
JAR_SRV_NAME="TwoMCBridge-0.1.0.jar"
EXPECTED_SHA256="${EXPECTED_SHA256:-6aa484549a3bf7408b41893c1b5ab0f78caf2839a13e4be8a032343297d7a7a8}"
MODE=""
for a in "$@"; do
  case "$a" in
    --dry-run) MODE=dry ;;
    --yes) MODE=yes ;;
    --sha256=*) EXPECTED_SHA256="${a#--sha256=}" ;;
    *) echo "Неизвестный аргумент: $a (допустимо --dry-run | --yes | --sha256=<64 hex>)" >&2; exit 2 ;;
  esac
done
EXPECTED_SHA256="${EXPECTED_SHA256,,}"
[[ "$EXPECTED_SHA256" =~ ^[0-9a-f]{64}$ ]] || { echo "EXPECTED_SHA256: нужно 64 hex" >&2; exit 2; }
[[ -n "$MODE" ]] || { echo "Укажите --dry-run (только чтение) или --yes (установка). Без флагов ничего не выполняется."; exit 2; }
if [[ "$MODE" == yes ]]; then PTERO_ALLOW_WRITE=1; else PTERO_ALLOW_WRITE=0; fi
export PTERO_ALLOW_WRITE

BLOCKERS=0
say() { echo "$*"; }
block() {
  say "BLOCKER: $*"; BLOCKERS=$((BLOCKERS + 1))
  if [[ "$MODE" == yes ]]; then say "Остановлено на этом шаге (дальнейшие шаги не выполнялись)."; exit 1; fi
}
step() { say; say "[$1] $2"; }

say "режим: $MODE"
ptero_init || exit 1

# ---- 0. вход Chief (вне репозитория), значения не печатаются
HAVE_SECRET=0; BRIDGE_SITE_URL=""; BRIDGE_SERVER_SLUG=""; BRIDGE_KEY_GEN=""; BRIDGE_KEY_HEX=""
KEY_ID=""; KEY=""; SITE_URL=""
step 0 "входной файл ключа"
if [[ -f "$SECRET_ENV" ]]; then
  twomc_secure_file "$SECRET_ENV" || { say "BLOCKER: secret.env отвергнут (права ровно 600, владелец - текущий пользователь)"; exit 1; }
  # shellcheck disable=SC1090
  . "$SECRET_ENV"
  # Формат register-dev-srv.sh: KEY_ID=<slug>.<gen>, KEY=<64 hex>, SITE_URL=...; прежний формат BRIDGE_* тоже принимается.
  if [[ -n "$KEY_ID" ]]; then
    : "${BRIDGE_SERVER_SLUG:=${KEY_ID%.*}}" "${BRIDGE_KEY_GEN:=${KEY_ID##*.}}" "${BRIDGE_KEY_HEX:=$KEY}" "${BRIDGE_SITE_URL:=$SITE_URL}"
  fi
  KEY=""
  BRIDGE_KEY_GEN="${BRIDGE_KEY_GEN:-1}"; BRIDGE_KEY_HEX="${BRIDGE_KEY_HEX,,}"
  bad=""
  [[ "$BRIDGE_SITE_URL" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]] || bad+=" BRIDGE_SITE_URL(https://хост без пути)"
  [[ "$BRIDGE_SERVER_SLUG" =~ ^[a-z0-9][a-z0-9-]{1,31}$ ]] || bad+=" BRIDGE_SERVER_SLUG"
  [[ "$BRIDGE_KEY_GEN" =~ ^[1-9][0-9]{0,5}$ ]] || bad+=" BRIDGE_KEY_GEN"
  [[ "$BRIDGE_KEY_HEX" =~ ^[0-9a-f]{64}$ ]] || bad+=" BRIDGE_KEY_HEX(64 hex)"
  if [[ -n "$bad" ]]; then
    block "в secret.env неверны:$bad"
  else
    HAVE_SECRET=1; say "secret.env: формат верен (slug=$BRIDGE_SERVER_SLUG gen=$BRIDGE_KEY_GEN; значение ключа не печатается)"
  fi
else
  block "нет входного файла secret.env (его создаёт Chief)"
fi
KEY_ID="${BRIDGE_SERVER_SLUG}.${BRIDGE_KEY_GEN}"

# ---- 1. версия сервера и Java
step 1 "версия сервера, Java, online-mode"
ptero_status || block "панель dev-srv недоступна"
img="$(ptero_server_image 2>/dev/null)"; say "docker image: ${img:-?}"
[[ "$img" == *java_21* ]] || block "образ сервера не Java 21 (нужен java_21_graalvm или java_21)"
vh="$(ptero_file_read /version_history.json 2>/dev/null)"; say "version_history: $(head -c 120 <<<"$vh")"
mcv="$(sed -n 's/.*MC: \(1\.[0-9][0-9]*\.[0-9][0-9]*\).*/\1/p' <<<"$vh" | head -n1)"
if [[ "$mcv" =~ ^1\.21\.([0-9]+)$ ]] && (( BASH_REMATCH[1] >= 4 && BASH_REMATCH[1] <= 11 )); then
  say "Minecraft $mcv: допустимо (1.21.4 - 1.21.11)"
else
  block "версия Minecraft '${mcv:-не определена}' вне 1.21.4 - 1.21.11"
fi
props="$(ptero_file_read /server.properties 2>/dev/null)"
say "server.properties: $(grep -E '^(online-mode|server-port)=' <<<"$props" | paste -sd' ' -)"
if grep -qE '^online-mode=false' <<<"$props"; then
  say "NOTE: online-mode=false: UUID игроков офлайн (UUID v3 от OfflinePlayer:<ник>); MinecraftAccount на стенде должен иметь этот UUID (offline-uuid.sh)."
fi
unset props

# ---- 2. уже установленное
step 2 "наличие плагина"
lst="$(ptero_files_list /plugins 2>/dev/null)"; lrc=$?
[[ $lrc -eq 0 ]] || block "не удалось получить список /plugins (проверить установленный плагин нельзя)"
# Установленным считается ТОЧНОЕ имя TwoMCBridge-0.1.0.jar; TwoMCBridge-0.1.0.jar.disabled-<время> (после отката) установкой не считается.
if grep -qxF -- "- $JAR_SRV_NAME" <<<"$lst"; then
  block "в /plugins уже есть $JAR_SRV_NAME (повторная установка поверх запрещена; сначала rollback-bridge.sh)"
else
  say "$JAR_SRV_NAME в /plugins нет: ок"
  other="$(grep -E '^- TwoMCBridge' <<<"$lst" | grep -vE '\.disabled-[0-9]{8}T[0-9]{6}Z$' | sed 's/^- //' | paste -sd' ' -)"
  [[ -z "$other" ]] || say "WARN: в /plugins есть другие файлы TwoMCBridge* (не .disabled-): $other (возможен двойной плагин; проверьте вручную)"
  dis="$(grep -cE '^- TwoMCBridge.*\.disabled-[0-9]{8}T[0-9]{6}Z$' <<<"$lst" || true)"
  [[ "${dis:-0}" == 0 ]] || say "NOTE: найдено отключённых jar (.disabled-*): $dis (установке не мешают)"
fi
# list разрешён только для / и /plugins: наличие config.yml и bridge-key.txt проверяется пробным GET содержимого в локальный файл 600
# (200 = есть, иначе нет; значения не печатаются, файл затирается). Каталог TwoMCBridge: mkdir на шаге 6 (повторное создание не критично).
HAVE_DIR=0
cfg_exists=0; key_exists=0
_pt_mktemp || exit 1; probe="$_PT_LAST"
ptero_file_fetch /plugins/TwoMCBridge/config.yml "$probe" >/dev/null 2>&1 && cfg_exists=1
ptero_file_fetch /plugins/TwoMCBridge/bridge-key.txt "$probe" >/dev/null 2>&1 && key_exists=1
: > "$probe"
[[ "$cfg_exists" == 1 || "$key_exists" == 1 ]] && HAVE_DIR=1
say "plugins/TwoMCBridge: каталог=$HAVE_DIR config.yml=$cfg_exists bridge-key.txt=$key_exists"

# ---- 3. подготовленные файлы на VDS
step 3 "JAR и шаблон на VDS"
if [[ -f "$INBOX/TwoMCBridge.jar" && -f "$INBOX/bridge-config.yml.tpl" ]]; then
  sz="$(stat -c %s "$INBOX/TwoMCBridge.jar")"
  jar_sha="$(sha256sum "$INBOX/TwoMCBridge.jar" | cut -d' ' -f1)"
  say "TwoMCBridge.jar: $sz байт sha256=$jar_sha"
  [[ "$jar_sha" == "$EXPECTED_SHA256" ]] || block "sha256 JAR не совпадает с ожидаемым ($EXPECTED_SHA256): JAR не будет загружен (другая сборка? тогда укажите --sha256=<hex> осознанно)"
  { [[ "$(head -c2 "$INBOX/TwoMCBridge.jar")" == "PK" ]] && (( sz > 50000 )); } || block "JAR не похож на архив (PK, больше 50 КБ)"
  { grep -q '__SITE_URL__' "$INBOX/bridge-config.yml.tpl" && grep -q '__KEY_ID__' "$INBOX/bridge-config.yml.tpl"; } || block "шаблон без __SITE_URL__ или __KEY_ID__"
else
  block "нет $INBOX/TwoMCBridge.jar или bridge-config.yml.tpl (выполните: run-on-vds.sh stage <jar>)"
fi

# ---- 4. подписанный handshake сайта (GET): путь, обход входа стенда, ключ, BRIDGE_ENABLED. Сеть самого dev-srv не проверяется.
PREFLIGHT_JS='
const c=require("node:crypto");const e=process.env;const p="/bridge/v1/handshake";
const ts=String(Math.floor(Date.now()/1000));const nonce=c.randomBytes(16).toString("base64url");
const canon=["twomc-bridge-v1",e.KEYID,ts,nonce,"GET",p,c.createHash("sha256").update("").digest("hex")].join("\n");
const sig=c.createHmac("sha256",Buffer.from(e.KEYHEX,"hex")).update(canon).digest("hex");
fetch(e.SITEURL+p,{method:"GET",redirect:"manual",signal:AbortSignal.timeout(20000),headers:{"x-twomc-key-id":e.KEYID,"x-twomc-timestamp":ts,"x-twomc-nonce":nonce,"x-twomc-protocol":"1","x-twomc-signature":sig}})
.then(async r=>{const t=(await r.text()).slice(0,300);let er="";try{er=JSON.parse(t).error||""}catch{}
console.log("HTTP "+r.status+(r.headers.get("www-authenticate")?" basic-auth-gate":"")+(er?" error="+String(er).replace(/[^A-Za-z0-9_ -]/g,"").slice(0,40):"")+(r.status===200&&/minProtocol/.test(t)?" handshake=ok":""));})
.catch(x=>console.log("NETERR "+String((x.cause&&x.cause.code)||x.name).replace(/[^A-Za-z0-9_ -]/g,"").slice(0,40)));
'
step 4 "подписанный handshake сайта (GET /bridge/v1/handshake)"
if [[ "$HAVE_SECRET" == 1 ]]; then
  nimg="$(_pt_node_image 2>/dev/null)" || nimg=""
  if [[ -z "$nimg" ]]; then
    block "нет образа node для проверки handshake"
  else
    hs="$(timeout 60 docker run --rm --read-only --cap-drop ALL --security-opt no-new-privileges --memory 128m \
      --env-file <(printf 'KEYID=%s\nKEYHEX=%s\nSITEURL=%s\n' "$KEY_ID" "$BRIDGE_KEY_HEX" "$BRIDGE_SITE_URL") \
      "$nimg" node -e "$PREFLIGHT_JS" </dev/null 2>/dev/null)"
    say "handshake: ${hs:-нет ответа}"
    [[ "$hs" == *"handshake=ok"* ]] || block "handshake не прошёл (503: BRIDGE_ENABLED или секрет не заданы; 401: ключ или slug не зарегистрированы; basic-auth-gate или 404: на nginx стенда нет location /bridge/v1/ -> API без входа стенда (плагин ходит на SITE_URL/bridge/v1/..., без /api); NETERR: сеть или TLS)"
  fi
else
  say "пропущено: нет корректного secret.env"
fi

# ---- 5. игроки онлайн
step 5 "игроки онлайн"
if [[ "$MODE" == yes ]]; then
  # ptero_restart_guard: list -> при игроках say-предупреждение, 60 с, повторная проверка (новые игроки -> ещё предупреждение и 30 с)
  ptero_restart_guard install || block "проверка игроков перед restart не пройдена"
else
  pl="$(ptero_players_online 2>/dev/null)"; say "$pl"
  say "dry-run: число игроков берётся через SLP (только чтение); команда list не отправляется"
fi

if [[ "$MODE" == dry ]]; then
  say; say "DRY-RUN завершён: блокеров $BLOCKERS. Изменений на панели и сервере не сделано."
  [[ "$BLOCKERS" == 0 ]] && exit 0 || exit 1
fi

# ---- 6. запись файлов (config и ключ, затем jar: jar подхватывается только при restart)
step 6 "запись config.yml, ключа и JAR"
_pt_mktemp || exit 1; tmp="$_PT_LAST"
TS_NOW="$(date -u +%Y%m%dT%H%M%SZ)"
if [[ "$HAVE_DIR" == 0 ]]; then
  ptero_mkdir /plugins TwoMCBridge || say "WARN: create-folder не удался (HTTP $PTERO_HTTP), рассчитываем на автосоздание при записи"
fi
if [[ "$cfg_exists" == 1 ]]; then
  if ptero_file_fetch /plugins/TwoMCBridge/config.yml "$tmp" 2>/dev/null \
     && ptero_file_write "/plugins/TwoMCBridge/config.yml.bak-$TS_NOW" "$tmp"; then
    say "прежний config.yml сохранён копией (config.yml.bak-$TS_NOW)"
  else
    : > "$tmp"; block "не удалось сохранить копию существующего config.yml"
  fi
fi
if [[ "$key_exists" == 1 ]]; then
  # бэкап прежнего ключа ДО перезаписи: локальная копия 600 -> bridge-key.txt.bak-<время> (права 600), значение не печатается
  if ptero_file_fetch /plugins/TwoMCBridge/bridge-key.txt "$tmp" 2>/dev/null \
     && ptero_file_write "/plugins/TwoMCBridge/bridge-key.txt.bak-$TS_NOW" "$tmp"; then
    : > "$tmp"
    if ! ptero_chmod /plugins/TwoMCBridge "bridge-key.txt.bak-$TS_NOW" 600; then
      chmod_http="$PTERO_HTTP"; : > "$tmp"
      # откат: на панели нет удаления, поэтому копия обнуляется (незащищённая копия ключа не остаётся)
      ptero_file_write "/plugins/TwoMCBridge/bridge-key.txt.bak-$TS_NOW" "$tmp" >/dev/null 2>&1 || say "WARN: не удалось обнулить копию ключа на панели: сделайте это вручную (bridge-key.txt.bak-$TS_NOW)"
      block "chmod 600 для копии ключа не выполнен (HTTP $chmod_http): копия обнулена, перезапись ключа отменена (откат)"
    fi
    say "прежний bridge-key.txt сохранён копией (bridge-key.txt.bak-$TS_NOW, значение не печатается)"
  else
    : > "$tmp"; block "не удалось сохранить копию существующего bridge-key.txt (перезапись отменена)"
  fi
fi
tpl="$(cat "$INBOX/bridge-config.yml.tpl")"; tpl="${tpl//__SITE_URL__/$BRIDGE_SITE_URL}"; tpl="${tpl//__KEY_ID__/$KEY_ID}"
printf '%s\n' "$tpl" > "$tmp"
ptero_file_write /plugins/TwoMCBridge/config.yml "$tmp" || block "запись config.yml не удалась (HTTP $PTERO_HTTP)"
say "config.yml записан (без секрета)"
printf '%s\n' "$BRIDGE_KEY_HEX" > "$tmp"
ptero_file_write /plugins/TwoMCBridge/bridge-key.txt "$tmp" || { : > "$tmp"; block "запись bridge-key.txt не удалась (HTTP $PTERO_HTTP)"; }
: > "$tmp"
if ptero_chmod /plugins/TwoMCBridge bridge-key.txt 600; then
  say "bridge-key.txt: права 600"
else
  chmod_http="$PTERO_HTTP"; : > "$tmp"
  # откат загрузки ключа: на панели нет удаления, поэтому файл обнуляется (значение ключа с панели исчезает); прежний ключ - в bridge-key.txt.bak-<время>
  ptero_file_write /plugins/TwoMCBridge/bridge-key.txt "$tmp" >/dev/null 2>&1 || say "WARN: не удалось обнулить bridge-key.txt на панели: сделайте это вручную"
  block "chmod 600 для bridge-key.txt не выполнен (HTTP $chmod_http): загрузка ключа откатана (файл обнулён), установка остановлена"
fi
# JAR: приватная копия (umask 077) и повторная сверка sha256 прямо перед загрузкой (между шагом 3 и загрузкой файл в INBOX могли подменить)
_pt_mktemp || exit 1; jar_copy="$_PT_LAST"
cp -- "$INBOX/TwoMCBridge.jar" "$jar_copy" || block "не удалось скопировать JAR"
copy_sha="$(sha256sum "$jar_copy" | cut -d' ' -f1)"
[[ "$copy_sha" == "$EXPECTED_SHA256" ]] || block "sha256 JAR изменился перед загрузкой (ожидалось $EXPECTED_SHA256, получено $copy_sha): загрузка отменена"
ptero_upload "$jar_copy" /plugins "$JAR_SRV_NAME" || block "загрузка JAR не удалась"
if ptero_files_list /plugins | grep -qxF -- "- $JAR_SRV_NAME"; then say "JAR на месте: /plugins/$JAR_SRV_NAME (sha256 проверен до загрузки)"; else block "после загрузки JAR не виден в /plugins"; fi

# ---- 7. restart
step 7 "restart сервера"
ptero_power restart || block "команда restart не принята (HTTP $PTERO_HTTP)"
seen_down=0
for _ in $(seq 1 12); do sleep 10; st="$(ptero_state)"; if [[ -n "$st" && "$st" != running ]]; then seen_down=1; break; fi; done
[[ "$seen_down" == 1 ]] || say "WARN: остановка сервера не замечена за 120 с (ждём running)"
up=0
for _ in $(seq 1 36); do sleep 10; if [[ "$(ptero_state)" == running ]]; then up=1; break; fi; done
if [[ "$up" == 1 ]]; then say "сервер: running"; else block "сервер не вернулся в running за 360 с (смотрите консоль в панели)"; fi

# ---- 8. включение плагина
step 8 "проверка включения плагина"
ptero_console_tail 20 'TwoMCBridge|TwoMC Bridge|Снимки|Инвентарь|ВЫКЛЮЧЕН|Could not load|Error occurred while enabling' | head -n 30 || true
resp=""
for _ in 1 2 3; do
  resp="$(ptero_command_capture "twomcbridge events" 20 'TwoMC Bridge: ' 'TwoMC Bridge|Unknown command|Unknown or incomplete' 2>/dev/null)"
  grep -q 'TwoMC Bridge: ' <<<"$resp" && break
  sleep 20
done
grep -E '^L: ' <<<"$resp" | head -n 5
if grep -q 'БЕЗОПАСНЫЙ РЕЖИМ' <<<"$resp"; then
  block "инвентарь в безопасном режиме (причина в строке выше)"
elif grep -q 'статистика вкл' <<<"$resp" && grep -q 'инвентарь вкл' <<<"$resp"; then
  say "OK: плагин включён, статистика и инвентарь включены"
else
  block "плагин не ответил на /twomcbridge events: не загрузился или снимки выключены (смотрите консоль и config.yml)"
fi

# ---- 9. первый успешный запрос
step 9 "первый успешный запрос к сайту"
acc="$(sed -n 's/.*принято \([0-9][0-9]*\).*/\1/p' <<<"$resp" | head -n1)"
if (( ${acc:-0} >= 1 )); then say "OK: сайт принял событий: $acc"; say; say "УСТАНОВКА ЗАВЕРШЕНА, блокеров 0"; exit 0; fi
say "PENDING: принятых событий пока 0: плагин ничего не шлёт, пока нет игроков онлайн."
say "Зайдите тестовым клиентом (online-mode=false, ник тестового аккаунта), подождите до 5 минут, затем: run-on-vds.sh script verify-bridge.sh"
exit 3
