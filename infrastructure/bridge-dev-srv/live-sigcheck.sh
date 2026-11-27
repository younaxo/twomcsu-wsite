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
set -uo pipefail
if ! declare -F _pt_node_image >/dev/null 2>&1; then source "$(dirname "${BASH_SOURCE[0]}")/ptero.sh"; fi
PTERO_ALLOW_WRITE=0

LOOP=0; PAY=1; BPFX=""
for a in "$@"; do
  case "$a" in --loopback) LOOP=1 ;; --no-payments) PAY=0 ;; --api-prefix) BPFX="/api" ;; *) echo "Неизвестный аргумент: $a (допустимо --loopback | --no-payments | --api-prefix)" >&2; exit 2 ;; esac
done
SECRET_ENV="${BRIDGE_SECRET_ENV:-/home/twomc/bridge-dev-srv.secret.env}"
STAND_ENV="${SIGCHECK_STAND_ENV:-/srv/twomc-stand/stand.env}"
EXPECTED_SITE="https://test-website.twomc.su"   # единственный допустимый адрес; переопределения нет


[[ -f "$SECRET_ENV" ]] || { echo "Нет $SECRET_ENV (сначала register-dev-srv.sh --yes)"; exit 1; }
KEY_ID=""; KEY=""; SITE_URL=""
# shellcheck disable=SC1090
. "$SECRET_ENV"
[[ "$KEY_ID" =~ ^[a-z0-9][a-z0-9-]{1,31}\.[0-9]{1,6}$ && "$KEY" =~ ^[0-9a-f]{64}$ && "$SITE_URL" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]] \
  || { echo "secret.env: неверны KEY_ID, KEY или SITE_URL (значения не печатаются)"; exit 1; }
[[ "$SITE_URL" == "$EXPECTED_SITE" ]] || { echo "ОТКАЗ: SITE_URL в secret.env не совпадает с $EXPECTED_SITE (проверка идёт только на стенде; значение не печатается)"; exit 1; }
HOSTNAME_ONLY="${SITE_URL#https://}"; HOSTNAME_ONLY="${HOSTNAME_ONLY%%:*}"
PAYSECRET=""
if [[ "$PAY" == 1 ]]; then
  if [[ -r "$STAND_ENV" ]]; then
    PAYSECRET="$(grep -E '^PAYMENT_WEBHOOK_SECRET=' "$STAND_ENV" | head -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
  fi
  if ! [[ "$PAYSECRET" =~ ^[^[:space:]]{32,}$ ]]; then
    echo "WARN: PAYMENT_WEBHOOK_SECRET не прочитан (или короче 32): проверки webhook пропущены (SKIP)"; PAYSECRET=""; PAY=0
  fi
fi

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
  const P="/webhooks/payments/test";const url=SITE+"/api"+P;const S=e.PAYSECRET;
  const mkBody=()=>JSON.stringify({orderNumber:"SIGCHECK-NOORDER",paymentId:"sigcheck-"+c.randomBytes(8).toString("hex"),currency:"RUB",status:"failed",amount:"1.00"});
  const sign=(body,tsOff)=>{const ts=String(Math.floor(Date.now()/1000)+tsOff);return {"x-twomc-timestamp":ts,"x-twomc-signature":hm(Buffer.from(S,"utf8"),ts+"."+body)};};
  const safe=(r)=>is2(r)&&/order_not_found|already_processed/.test(r.text);
  let body=mkBody();let h=sign(body,0);
  const a=await post(url,h,body);const b=await post(url,h,body);
  row("webhook 4 верный запрос дважды (заказа нет)","200 и 200 (order_not_found, без изменения данных)",show(a)+" и "+show(b),safe(a)&&safe(b));
  body=mkBody();h=sign(body,0);delete h["x-twomc-signature"];
  let r=await post(url,h,body);row("webhook 1 без подписи","401",show(r),is401(r));
  body=mkBody();h=sign(body,0);h["x-twomc-signature"]=GARBAGE;
  r=await post(url,h,body);row("webhook 2 мусорная подпись","401",show(r),is401(r));
  body=mkBody();h=sign(body,-400);
  r=await post(url,h,body);row("webhook 3 верная подпись, ts -400 с (окно 300 с)","401",show(r),is401(r));
}
(async()=>{await bridge();if(e.PAYSECRET)await payments();console.log("ИТОГ: "+(fails===0?"все PASS":("FAIL: "+fails)));process.exit(fails===0?0:1);})();
'

addhost=(); [[ "$LOOP" == 1 ]] && addhost=(--add-host "$HOSTNAME_ONLY:host-gateway")
echo "режим: $([[ "$LOOP" == 1 ]] && echo 'loopback (с хоста через docker0)' || echo 'публичный адрес'); bridge: ${EXPECTED_SITE}${BPFX}/bridge/v1/events; webhook: $([[ "$PAY" == 1 ]] && echo да || echo пропущен)"
timeout 120 docker run --rm --read-only --cap-drop ALL --security-opt no-new-privileges --memory 128m ${addhost[@]+"${addhost[@]}"} \
  --env-file <(printf 'SITE=%s\nBPFX=%s\nKEYID=%s\nKEYHEX=%s\nPAYSECRET=%s\n' "$SITE_URL" "$BPFX" "$KEY_ID" "$KEY" "$PAYSECRET") \
  "$img" node -e "$JS" </dev/null 2>/dev/null
rc=$?
KEY=""; PAYSECRET=""
[[ $rc -eq 0 ]] && exit 0
[[ $rc -eq 1 ]] || echo "ОШИБКА: проверка не выполнена или прервана (код $rc)"
exit 1
