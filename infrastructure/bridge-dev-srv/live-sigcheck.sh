#!/usr/bin/env bash
# Живая проверка подписей на сайте стенда: POST https://test-website.twomc.su/bridge/v1/events (как ходит плагин: siteUrl без /api) и
# POST /api/webhooks/payments/test, без cookie входа стенда. Адрес стенда зафиксирован: SITE_URL из secret.env обязан быть https://test-website.twomc.su.
# Запускается НА VDS: run-on-vds.sh script live-sigcheck.sh [--loopback] [--no-payments] [--api-prefix]
#   --api-prefix   Bridge бьёт в /api/bridge/v1/events вместо /bridge/v1/events (если на стенде отдельного location /bridge/v1/ нет). Подписанный путь
#                  в обоих случаях /bridge/v1/events (nginx срезает /api). Webhook всегда под /api.
#                  Стенд будет маршрутизировать /bridge/v1/* мимо формы входа (настраивает другая цепочка, infrastructure/test-website/).
#   --loopback     запросы идут с хоста стенда ЧЕРЕЗ docker0 (--add-host <домен>:host-gateway): nginx видит адрес 172.16.0.0/12 и пропускает вход
#                  стенда; проверяется цепочка nginx -> API, но НЕ доступность снаружи. Без флага запрос идёт с VDS по публичному адресу:
#                  если на /api/bridge/v1/* нет обхода входа стенда, придёт basic auth (401 с WWW-Authenticate) - случай помечается FAIL (GATE),
#                  а не PASS (иначе «401» ложно подтверждал бы подпись).
#   --no-payments  проверять только Bridge
#   --payments-only  проверять только webhook оплаты (4 случая); файл ключа Bridge (secret.env) НЕ нужен и не читается; нужен только PAYMENT_WEBHOOK_SECRET из stand.env
#                  (нет или короче 32 - ошибка, не SKIP). Адрес стенда фиксирован (EXPECTED_SITE). Несовместим с --no-payments; --loopback допустим.
#   --provider <slug>  провайдер, на чей адрес идёт webhook (/api/webhooks/payments/<slug>); подпись у всех провайдеров одна (webhook-signature.ts). По умолчанию "test";
#                  с --order без --provider slug берётся из БД стенда (read-only psql в twomc-stand-postgres по orderNumber, печатается только slug).
#   --order <номер>  4-й случай webhook идёт на РЕАЛЬНЫЙ тестовый заказ стенда с этим orderNumber: два одинаковых запроса status=failed,
#                  ожидается 2xx (accepted) и затем 2xx already_processed. ВНИМАНИЕ: заказ в статусе PENDING без paymentId будет переведён в FAILED (для заказа необратимо;
#                  брать только одноразовый тестовый заказ). Без --order и с --payments-only 4-й случай пропускается (SKIP) с пометкой; без --order и без --payments-only
#                  остаётся прежняя проверка с несуществующим заказом SIGCHECK-NOORDER (order_not_found).
# Подпись Bridge ровно как bridge-signature.guard.ts и Signer плагина:
#   canonical = "twomc-bridge-v1" LF key-id LF timestamp LF nonce LF METHOD LF path LF sha256hex(сырое тело); signature = hex(HMAC-SHA256(ключ_сервера, canonical))
#   ключ_сервера - 32 байта из KEY (hex) в secret.env; заголовки x-twomc-key-id, x-twomc-timestamp (секунды, 10 цифр), x-twomc-nonce (base64url, 22 символа),
#   x-twomc-protocol: 1, x-twomc-signature, Content-Type: application/json. path - как его видит API: /bridge/v1/events (с --api-prefix nginx срезает /api).
#   окно времени 60 с (BRIDGE_TIMESTAMP_WINDOW_S), нонс одноразовый (повтор того же запроса -> 401).
# Webhook (webhook-signature.ts): signature = hex(HMAC-SHA256(PAYMENT_WEBHOOK_SECRET, "<timestamp>." + сырое тело)), заголовки x-twomc-signature, x-twomc-timestamp;
#   окно 300 с (поэтому случай 3 использует ts на 400 с старше), нонса нет.
# Безопасность данных: событие Bridge - с чужим serverId (sigcheck-probe): сайт отвечает 200 и отклоняет его покейсово (server_mismatch), ничего не применяя
# (меняются только lastSeenAt и сдвиг часов сервера dev-srv). Webhook - с несуществующим заказом SIGCHECK-NOORDER: 200 accepted=false order_not_found, данных не меняет.
# Порядок случаев: сначала 4 (валидный запрос дважды), затем 1, 2, 3. Секреты (ключ, PAYMENT_WEBHOOK_SECRET) идут в контейнер через env-file из process
# substitution и не печатаются; печатаются только строки «проверка | ожидалось | получено | PASS/FAIL».
# Вход: /home/twomc/bridge-dev-srv.secret.env (KEY_ID, KEY, SITE_URL), PAYMENT_WEBHOOK_SECRET - из /srv/twomc-stand/stand.env (строка читается grep-ом).
# Коды: 0 все PASS, 1 есть FAIL или ошибка, 2 аргументы.
export LC_ALL=C
set -uo pipefail
if ! declare -F _pt_node_image >/dev/null 2>&1; then source "$(dirname "${BASH_SOURCE[0]}")/ptero.sh"; fi
PTERO_ALLOW_WRITE=0

LOOP=0; PAY=1; PAYONLY=0; ORDER=""; BPFX=""; PROVIDER=""; PAYID=""
while (( $# )); do
  case "$1" in
    --loopback) LOOP=1 ;; --no-payments) PAY=0 ;; --api-prefix) BPFX="/api" ;; --payments-only) PAYONLY=1 ;;
    --order) [[ $# -ge 2 ]] || { echo "--order требует номер заказа" >&2; exit 2; }; ORDER="$2"; shift ;;
    --provider) [[ $# -ge 2 ]] || { echo "--provider требует slug" >&2; exit 2; }; PROVIDER="$2"; shift ;;
    *) echo "Неизвестный аргумент: $1 (допустимо --loopback | --no-payments | --api-prefix | --payments-only | --order <номер> | --provider <slug>)" >&2; exit 2 ;;
  esac
  shift
done
[[ "$PAYONLY" == 0 || "$PAY" == 1 ]] || { echo "--payments-only несовместим с --no-payments" >&2; exit 2; }
[[ "$PAY" == 1 || -z "$ORDER" ]] || { echo "--order несовместим с --no-payments" >&2; exit 2; }
[[ -z "$ORDER" || "$ORDER" =~ ^[A-Za-z0-9_-]{3,64}$ ]] || { echo "--order: недопустимый номер заказа" >&2; exit 2; }
[[ -z "$PROVIDER" || "$PROVIDER" =~ ^[a-z0-9-]{1,32}$ ]] || { echo "--provider: недопустимый slug" >&2; exit 2; }
[[ "$PAY" == 1 || -z "$PROVIDER" ]] || { echo "--provider несовместим с --no-payments" >&2; exit 2; }
# Путь фиксирован, окружением не переопределяется (кроме STAND_TEST=1 для сухих прогонов).
SECRET_ENV=/home/twomc/bridge-dev-srv.secret.env
[[ "${STAND_TEST:-0}" == 1 ]] && SECRET_ENV="${BRIDGE_SECRET_ENV:-$SECRET_ENV}"
STAND_ENV="${SIGCHECK_STAND_ENV:-/srv/twomc-stand/stand.env}"
EXPECTED_SITE="https://test-website.twomc.su"   # единственный допустимый адрес; переопределения нет


KEY_ID=""; KEY=""; SITE_URL=""
if [[ "$PAYONLY" == 1 ]]; then
  SITE_URL="$EXPECTED_SITE"   # файл ключа Bridge не читается
else
  [[ -f "$SECRET_ENV" ]] || { echo "Нет $SECRET_ENV (сначала register-dev-srv.sh --yes)"; exit 1; }
  twomc_secure_file "$SECRET_ENV" || exit 1
  # shellcheck disable=SC1090
  . "$SECRET_ENV"
  [[ "$KEY_ID" =~ ^[a-z0-9][a-z0-9-]{1,31}\.[0-9]{1,6}$ && "$KEY" =~ ^[0-9a-f]{64}$ && "$SITE_URL" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]] \
    || { echo "secret.env: неверны KEY_ID, KEY или SITE_URL (значения не печатаются)"; exit 1; }
  [[ "$SITE_URL" == "$EXPECTED_SITE" ]] || { echo "ОТКАЗ: SITE_URL в secret.env не совпадает с $EXPECTED_SITE (проверка идёт только на стенде; значение не печатается)"; exit 1; }
fi
HOSTNAME_ONLY="${SITE_URL#https://}"; HOSTNAME_ONLY="${HOSTNAME_ONLY%%:*}"
PAYSECRET=""
if [[ "$PAY" == 1 ]]; then
  if [[ -r "$STAND_ENV" ]]; then
    PAYSECRET="$(grep -E '^PAYMENT_WEBHOOK_SECRET=' "$STAND_ENV" | head -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
  fi
  if ! [[ "$PAYSECRET" =~ ^[^[:space:]]{32,}$ ]]; then
    if [[ "$PAYONLY" == 1 ]]; then echo "ОШИБКА: PAYMENT_WEBHOOK_SECRET не прочитан (или короче 32), --payments-only без него невозможен"; exit 1; fi
    echo "WARN: PAYMENT_WEBHOOK_SECRET не прочитан (или короче 32): проверки webhook пропущены (SKIP)"; PAYSECRET=""; PAY=0
  fi
fi

# Провайдер реального заказа: явный --provider, иначе read-only запрос к БД стенда по orderNumber (печатается только slug; paymentId заказа берётся для тела, не печатается).
if [[ "$PAY" == 1 && -n "$ORDER" && -z "$PROVIDER" ]]; then
  _sv() { grep -E "^$1=" "$STAND_ENV" 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '[:cntrl:]"'; }
  PG_USER="$(_sv POSTGRES_USER)"; PG_DB="$(_sv POSTGRES_DB)"
  [[ "$PG_USER" =~ ^[A-Za-z0-9_]+$ && "$PG_DB" =~ ^[A-Za-z0-9_]+$ ]] || { echo "ОШИБКА: POSTGRES_USER/POSTGRES_DB не прочитаны из stand.env; укажите --provider <slug>"; exit 1; }
  ROW="$(docker exec twomc-stand-postgres psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 -tA -F '|' \
    -c "SELECT COALESCE(\"paymentProvider\",''), COALESCE(\"paymentId\",'') FROM orders WHERE \"orderNumber\"='$ORDER' LIMIT 2" </dev/null 2>/dev/null)"
  [[ -n "$ROW" && "$(wc -l <<<"$ROW")" -eq 1 ]] || { echo "ОШИБКА: заказ $ORDER не найден (или не единственный); укажите --provider <slug>"; exit 1; }
  IFS='|' read -r PROVIDER PAYID <<<"$ROW"
  [[ "$PROVIDER" =~ ^[a-z0-9-]{1,32}$ ]] || { echo "ОШИБКА: у заказа $ORDER не выбран провайдер (не нажата «Оплатить»); укажите --provider <slug>"; exit 1; }
  [[ "$PAYID" =~ ^[A-Za-z0-9_-]{1,100}$ ]] || PAYID=""
  echo "провайдер заказа: $PROVIDER"
fi
PROVIDER="${PROVIDER:-test}"

img="$(_pt_node_image 2>/dev/null)" || { echo "ОШИБКА: нет локального образа node (docker pull здесь не выполняется)"; exit 1; }

JS='
const c=require("node:crypto");const e=process.env;
const SITE=e.SITE,BPFX=e.BPFX||"",KEYID=e.KEYID,KEY=Buffer.from(e.KEYHEX,"hex");
const rnd=(n)=>c.randomBytes(n).toString("base64url");
const sha=(b)=>c.createHash("sha256").update(b).digest("hex");
const hm=(k,s)=>c.createHmac("sha256",k).update(s).digest("hex");
const GARBAGE="ab".repeat(32);
let fails=0;
function row(name,exp,got,ok){if(!ok)fails++;console.log([name,"ожидалось "+exp,"получено "+got,ok?"PASS":"FAIL"].join(" | "));}
async function post(url,headers,body){
  try{
    const r=await fetch(url,{method:"POST",redirect:"manual",signal:AbortSignal.timeout(20000),headers:Object.assign({"content-type":"application/json"},headers),body});
    const t=(await r.text()).slice(0,400);
    return {status:r.status,gate:r.headers.has("www-authenticate"),text:t};
  }catch(x){return {status:0,gate:false,text:"",err:String((x.cause&&x.cause.code)||x.name).replace(/[^A-Za-z0-9_ -]/g,"").slice(0,30)};}
}
const show=(r)=>r.status===0?("NETERR "+r.err):(String(r.status)+(r.gate?" GATE(basic auth стенда: нет обхода входа для этого пути)":""));
const is2=(r)=>!r.gate&&r.status>=200&&r.status<300;
const is401=(r)=>!r.gate&&r.status===401;

async function bridge(){
  const P="/bridge/v1/events";const url=SITE+BPFX+P;
  const mkBody=()=>{const now=new Date().toISOString();return JSON.stringify({schema:"twomc.bridge.v1",sentAt:now,events:[{eventId:"sigcheck-"+c.randomBytes(12).toString("hex"),type:"bridge.hello",serverId:"sigcheck-probe",streamId:"sigcheck",seq:1,occurredAt:now,data:{}}]});};
  const sign=(body,tsOff)=>{const ts=String(Math.floor(Date.now()/1000)+tsOff);const nonce=rnd(16);
    const canon=["twomc-bridge-v1",KEYID,ts,nonce,"POST",P,sha(body)].join("\n");
    return {"x-twomc-key-id":KEYID,"x-twomc-timestamp":ts,"x-twomc-nonce":nonce,"x-twomc-protocol":"1","x-twomc-signature":hm(KEY,canon)};};
  // 4: верный запрос дважды (тот же нонс): первый 2xx, второй 401
  let body=mkBody();let h=sign(body,0);
  const a=await post(url,h,body);const b=await post(url,h,body);
  row("bridge 4 верный запрос дважды","2xx затем 401",show(a)+" затем "+show(b),is2(a)&&is401(b));
  // 1: без подписи
  body=mkBody();h=sign(body,0);delete h["x-twomc-signature"];
  let r=await post(url,h,body);row("bridge 1 без подписи","401",show(r),is401(r));
  // 2: мусорная подпись (формат верный, значение нет)
  body=mkBody();h=sign(body,0);h["x-twomc-signature"]=GARBAGE;
  r=await post(url,h,body);row("bridge 2 мусорная подпись","401",show(r),is401(r));
  // 3: верная подпись, ts на 120 с старше (окно 60 с)
  body=mkBody();h=sign(body,-120);
  r=await post(url,h,body);row("bridge 3 верная подпись, ts -120 с","401",show(r),is401(r));
}
async function payments(){
  const P="/webhooks/payments/"+e.PROVIDER;const url=SITE+"/api"+P;const S=e.PAYSECRET;
  const mkBody=()=>JSON.stringify({orderNumber:"SIGCHECK-NOORDER",paymentId:"sigcheck-"+c.randomBytes(8).toString("hex"),currency:"RUB",status:"failed",amount:"1.00"});
  const sign=(body,tsOff)=>{const ts=String(Math.floor(Date.now()/1000)+tsOff);return {"x-twomc-timestamp":ts,"x-twomc-signature":hm(Buffer.from(S,"utf8"),ts+"."+body)};};
  const safe=(r)=>is2(r)&&/order_not_found|already_processed/.test(r.text);
  const ORD=e.ORDER||"";
  if(ORD){
    // реальный тестовый заказ: status=failed дважды (одно и то же тело и подпись); первый принят, второй already_processed
    const bodyO=JSON.stringify({orderNumber:ORD,paymentId:e.PAYID||("sigcheck-"+c.randomBytes(8).toString("hex")),currency:"RUB",status:"failed",amount:"1.00"});
    const hO=sign(bodyO,0);
    const a=await post(url,hO,bodyO);const b=await post(url,hO,bodyO);
    const okA=is2(a)&&/"accepted" ?: ?true/.test(a.text)&&!/already_processed/.test(a.text);const okB=is2(b)&&/already_processed/.test(b.text);
    row("webhook 4 повтор на реальном тестовом заказе","200 (accepted) и 200 already_processed",show(a)+" и "+show(b),okA&&okB);
  }else if(e.PAYONLY==="1"){
    console.log("webhook 4 повтор | SKIP: нужен реальный тестовый заказ (--order <номер>)");
  }else{
    const body0=mkBody();const h0=sign(body0,0);
    const a=await post(url,h0,body0);const b=await post(url,h0,body0);
    row("webhook 4 верный запрос дважды (заказа нет)","200 и 200 (order_not_found, без изменения данных)",show(a)+" и "+show(b),safe(a)&&safe(b));
  }
  let body=mkBody();let h;
  body=mkBody();h=sign(body,0);delete h["x-twomc-signature"];
  let r=await post(url,h,body);row("webhook 1 без подписи","401",show(r),is401(r));
  body=mkBody();h=sign(body,0);h["x-twomc-signature"]=GARBAGE;
  r=await post(url,h,body);row("webhook 2 мусорная подпись","401",show(r),is401(r));
  body=mkBody();h=sign(body,-400);
  r=await post(url,h,body);row("webhook 3 верная подпись, ts -400 с (окно 300 с)","401",show(r),is401(r));
}
(async()=>{if(e.PAYONLY!=="1")await bridge();if(e.PAYSECRET)await payments();console.log("ИТОГ: "+(fails===0?"все PASS":("FAIL: "+fails)));process.exit(fails===0?0:1);})();
'

addhost=(); [[ "$LOOP" == 1 ]] && addhost=(--add-host "$HOSTNAME_ONLY:host-gateway")
echo "провайдер webhook: $PROVIDER"; echo "режим: $([[ "$LOOP" == 1 ]] && echo 'loopback (с хоста через docker0)' || echo 'публичный адрес'); bridge: $([[ "$PAYONLY" == 1 ]] && echo 'пропущен (--payments-only)' || echo "${EXPECTED_SITE}${BPFX}/bridge/v1/events"); webhook: $([[ "$PAY" == 1 ]] && echo да || echo пропущен); заказ: $([[ -n "$ORDER" ]] && echo 'реальный тестовый' || echo нет)"
timeout 120 docker run --rm --read-only --cap-drop ALL --security-opt no-new-privileges --memory 128m ${addhost[@]+"${addhost[@]}"} \
  --env-file <(printf 'SITE=%s\nBPFX=%s\nKEYID=%s\nKEYHEX=%s\nPAYSECRET=%s\nORDER=%s\nPAYONLY=%s\nPROVIDER=%s\nPAYID=%s\n' "$SITE_URL" "$BPFX" "$KEY_ID" "$KEY" "$PAYSECRET" "$ORDER" "$PAYONLY" "$PROVIDER" "$PAYID") \
  "$img" node -e "$JS" </dev/null 2>/dev/null
rc=$?
KEY=""; PAYSECRET=""
[[ $rc -eq 0 ]] && exit 0
[[ $rc -eq 1 ]] || echo "ОШИБКА: проверка не выполнена или прервана (код $rc)"
exit 1
