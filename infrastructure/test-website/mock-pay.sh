#!/usr/bin/env bash
# Симулятор мок-оплаты стенда НА СЕРВЕРЕ: отправляет подписанный вебхук платёжного мока на api стенда (как это сделал бы провайдер).
#   mock-pay.sh <orderId|orderNumber|paymentId> [paid|failed|refunded] [--dry-run]     (по умолчанию paid)
# Обычно запускается ЛОКАЛЬНО через run-mock-pay.sh.
# Как устроено (источники истины: apps/api/src/modules/store/payments-webhook.controller.ts, payment/webhook-signature.ts):
#   - заказ ищется в БД стенда (docker exec twomc-stand-postgres psql): нужны orderNumber, провайдер, paymentId, сумма;
#   - тело: {"orderNumber","paymentId","status":"succeeded|failed","amount":"<total>","currency":"RUB"};
#   - заголовки x-twomc-timestamp (секунды) и x-twomc-signature = hex HMAC-SHA256(PAYMENT_WEBHOOK_SECRET, "<timestamp>.<тело>");
#   - POST http://127.0.0.1:$API_PORT/webhooks/payments/<провайдер заказа> (loopback api, мимо nginx и формы входа: токен не нужен).
# Секрет PAYMENT_WEBHOOK_SECRET читается из stand.env в переменную окружения и попадает только в окружение одноразового контейнера node
# (docker run -e ИМЯ без значения: в argv не попадает). Печатается только HTTP-код и поля accepted/reason ответа.
# refunded: вебхук-контракт знает только succeeded|failed. Возврат на стенде делается в админке заказа (/admin/store/orders/<id>, нужен STORE_REFUNDS_ENABLED=true).
# Только NODE_ENV=development в stand.env. STAND_ROOT, GATE_IMAGE (образ node, по умолчанию node:20-alpine, он уже на сервере) переопределяют значения.
set -euo pipefail
umask 077

STAND_ROOT="${STAND_ROOT:-/srv/twomc-stand}"
NODE_IMAGE="${NODE_IMAGE:-${GATE_IMAGE:-node:20-alpine}}"
ENV_FILE="$STAND_ROOT/stand.env"
REF=""; ACTION="paid"; DRY=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    paid|failed|refunded) ACTION="$a" ;;
    -*) echo "Неизвестный аргумент: $a" >&2; exit 2 ;;
    *) [[ -z "$REF" ]] || { echo "Лишний аргумент" >&2; exit 2; }; REF="$a" ;;
  esac
done
[[ "$REF" =~ ^[A-Za-z0-9_-]{1,64}$ ]] || { echo "Использование: mock-pay.sh <orderId|orderNumber|paymentId> [paid|failed|refunded] [--dry-run]" >&2; exit 2; }
[[ "$NODE_IMAGE" =~ ^[a-z0-9./:_-]+$ ]] || { echo "Недопустимый NODE_IMAGE" >&2; exit 2; }
if [[ "$ACTION" == refunded ]]; then
  echo "refunded не поддерживается вебхуком (контракт: succeeded|failed). Возврат: админка заказа /admin/store/orders (STORE_REFUNDS_ENABLED=true)." >&2
  exit 2
fi
[[ -f "$ENV_FILE" && -r "$ENV_FILE" ]] || { echo "Нет $ENV_FILE" >&2; exit 1; }
envval() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '[:cntrl:]"' || true; }
[[ "$(envval NODE_ENV)" == "development" ]] || { echo "Отказ: NODE_ENV в stand.env не development" >&2; exit 1; }
PG_USER="$(envval POSTGRES_USER)"; PG_DB="$(envval POSTGRES_DB)"; API_PORT="$(envval API_PORT)"; API_PORT="${API_PORT:-4000}"
[[ "$PG_USER" =~ ^[A-Za-z0-9_]+$ && "$PG_DB" =~ ^[A-Za-z0-9_]+$ && "$API_PORT" =~ ^[0-9]{2,5}$ ]] || { echo "Некорректные POSTGRES_USER/POSTGRES_DB/API_PORT в stand.env" >&2; exit 1; }

# Поиск заказа (ввод проверен регулярным выражением выше: только [A-Za-z0-9_-]).
ROW="$(docker exec twomc-stand-postgres psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 -tA -F '|' \
  -c "SELECT \"orderNumber\", COALESCE(\"paymentProvider\",''), COALESCE(\"paymentId\",''), total::text, status::text FROM orders WHERE id='$REF' OR \"orderNumber\"='$REF' OR \"paymentId\"='$REF' LIMIT 2" </dev/null)"
[[ -n "$ROW" ]] || { echo "Заказ не найден: $REF" >&2; exit 3; }
[[ "$(wc -l <<<"$ROW")" -eq 1 ]] || { echo "Найдено несколько заказов: уточните номер заказа" >&2; exit 3; }
IFS='|' read -r ORDER_NUMBER PROVIDER PAYMENT_ID TOTAL STATUS <<<"$ROW"
[[ -n "$PROVIDER" ]] || { echo "У заказа $ORDER_NUMBER нет платежа (провайдер не выбран): сначала нажмите «Оплатить» в оформлении заказа на стенде." >&2; exit 3; }
[[ "$PROVIDER" =~ ^[a-z0-9-]{1,32}$ && "$ORDER_NUMBER" =~ ^[A-Za-z0-9_-]{1,64}$ && "$TOTAL" =~ ^[0-9]{1,8}(\.[0-9]{1,2})?$ ]] || { echo "Нечитаемые данные заказа" >&2; exit 3; }
[[ -n "$PAYMENT_ID" ]] || PAYMENT_ID="sim_${ORDER_NUMBER}"
[[ "$PAYMENT_ID" =~ ^[A-Za-z0-9_-]{1,100}$ ]] || { echo "Нечитаемый paymentId" >&2; exit 3; }
case "$ACTION" in paid) EVENT=succeeded ;; failed) EVENT=failed ;; esac
echo "Заказ $ORDER_NUMBER: статус $STATUS, провайдер $PROVIDER, сумма $TOTAL RUB -> вебхук $EVENT"
if [[ "$STATUS" != "PENDING" ]]; then echo "Предупреждение: заказ не в статусе PENDING; решение примет API (ответ already_processed допустим)." >&2; fi
if (( DRY == 1 )); then echo "Сухой прогон: POST http://127.0.0.1:${API_PORT}/webhooks/payments/${PROVIDER} не отправлен."; exit 0; fi

PAYMENT_WEBHOOK_SECRET="$(envval PAYMENT_WEBHOOK_SECRET)"
[[ ${#PAYMENT_WEBHOOK_SECRET} -ge 32 ]] || { echo "PAYMENT_WEBHOOK_SECRET не задан или короче 32 символов в stand.env" >&2; exit 1; }
MP_BODY="$(printf '{"orderNumber":"%s","paymentId":"%s","status":"%s","amount":"%s","currency":"RUB"}' "$ORDER_NUMBER" "$PAYMENT_ID" "$EVENT" "$TOTAL")"
MP_URL="http://127.0.0.1:${API_PORT}/webhooks/payments/${PROVIDER}"
export PAYMENT_WEBHOOK_SECRET MP_BODY MP_URL
JS='const c=require("node:crypto");const s=process.env.PAYMENT_WEBHOOK_SECRET,b=process.env.MP_BODY,u=process.env.MP_URL;const ts=String(Math.floor(Date.now()/1000));const sig=c.createHmac("sha256",s).update(ts+"."+b).digest("hex");fetch(u,{method:"POST",headers:{"content-type":"application/json","x-twomc-timestamp":ts,"x-twomc-signature":sig},body:b}).then(async(r)=>{let j={};try{j=await r.json()}catch{}console.log("HTTP "+r.status+" accepted="+String(j.accepted)+" reason="+String(j.reason===undefined?"-":j.reason));process.exit(r.status<300?0:1)}).catch(()=>{console.log("Ошибка сети: api не отвечает");process.exit(1)})'
# --network host: loopback api. Песочница: без capabilities, read-only, лимиты. Секрет передаётся как -e ИМЯ (значение из окружения, не из argv).
docker run --rm --network host --user "$(id -u):$(id -g)" --cap-drop ALL --security-opt no-new-privileges --read-only \
  --memory 128m --pids-limit 64 -e PAYMENT_WEBHOOK_SECRET -e MP_BODY -e MP_URL "$NODE_IMAGE" node -e "$JS" </dev/null
