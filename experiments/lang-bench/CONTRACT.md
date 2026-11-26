# HTTP-контракт расчёта корзины (эксперимент lang-bench)

Источник логики: `apps/api/src/modules/store/pricing.service.ts` (`priceLines`, `getBulkDiscount`, `getLoyaltyDiscountPercent`, `requireValidPromoCode`, `computePromoDiscount`, `computeTotals`), ветка `docs/polyglot-analysis`. Основной код не менялся и не импортируется.

Отличие от боевого эндпоинта (допущение, чтобы сервис был без БД и без авторизации): корзина и «обращения к БД» заменены телом запроса и общим файлом правил `fixtures/dataset.json`, который каждый сервис грузит при старте (переменная `DATASET_PATH`). Эндпоинт называется так же: `POST /store/cart/calculate`.

Все варианты (TS текущий, TS с батч-скидками, Rust, Java 21) обязаны отвечать одинаково: JSON сравнивается как значение (порядок ключей не важен), деньги сравниваются как строки.

## Эндпоинты

| Метод и путь | Ответ |
|---|---|
| `GET /health` | `200 {"status":"ok"}` |
| `POST /store/cart/calculate` | `200` с результатом или `400 {"code","message"}` |

Тело запроса не более 1 МиБ (иначе `413`; в сравнении эквивалентности не участвует). `Content-Type: application/json`.

## Запрос

```json
{
  "now": "2026-11-23T12:00:00Z",
  "userCompletedOrders": 5,
  "promoCode": "SUMMER10",
  "softPromo": true,
  "items": [
    { "id": "i1", "productId": "p001", "productType": "KEY", "unitPrice": "10.00", "quantity": 10 }
  ]
}
```

| Поле | Правило |
|---|---|
| `now` | обязательно, строго `YYYY-MM-DDTHH:MM:SSZ` (UTC). Нужен для детерминизма; сравнение дат — лексикографическое сравнение строк этого формата |
| `userCompletedOrders` | целое `>= 0` либо `null`. `null` = анонимный пользователь (нет скидки лояльности, проверка «первая покупка» пропускается). Заменяет `order.count` боевого кода |
| `promoCode` | `null` или строка `^[A-Za-z0-9_-]{1,32}$`; сервер переводит ASCII в верхний регистр |
| `softPromo` | необязательно, boolean, по умолчанию `true` (так в боевом `getCart`/`calculate` без превью-кода). `false` = отказ промокода возвращается как `400` |
| `items` | обязательно, массив длиной 0..500 |
| `items[].id` | непустая строка до 64 символов (в боевом коде `cartItemId`) |
| `items[].productId` | строка (товар) или `null` (набор, bundle) |
| `items[].productType` | для товара: один из `PRIVILEGE KEY SUBSCRIPTION BADGE BATTLE_PASS BATTLE_PASS_BOOSTER UNMUTE UNBAN CURRENCY DECORATION BUNDLE`; для набора `null` |
| `items[].unitPrice` | десятичная строка `^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$` (не отрицательная, не более 2 знаков). Для набора это `totalPrice`, для товара цена варианта |
| `items[].quantity` | целое 1..9999 |

Лишние поля игнорируются. Отсутствующее поле `userCompletedOrders`, `promoCode`, `items[].productId`, `items[].productType` равно `null`.

### Целые числа (`userCompletedOrders`, `items[].quantity`)

Единое правило для всех четырёх вариантов: число принимается, только если оно ЗАПИСАНО целым JSON-литералом без точки и без экспоненты (`5`, `0`, `10`). Записи `5.0`, `0.0`, `1e2`, `1E+1`, `5.5` дают `400 VALIDATION` (даже если значение численно целое). Дополнительно: `userCompletedOrders` не больше 2147483647 (int32; больше — `400 VALIDATION`), `quantity` — 1..9999. Запись `-0` вне контракта (не тестируется).

Как это достигается: Rust (serde_json без `arbitrary_precision`: `5.0` и `1e2` — f64, `as_i64` даёт `None`) и Java (Jackson: `5.0`/`1e2` — `DoubleNode`, `isIntegralNumber()` ложно) отклоняют такие записи штатно. В TS `JSON.parse` теряет различие между `5` и `5.0`, поэтому `parseJsonBody` (`impl/ts-*/calc.ts`) восстанавливает запись по исходному тексту числа (`context.source` в reviver, Node >= 21) и помечает нецелые записи маркером `NonIntegerLiteral`, который не проходит проверку. Чтобы не замедлять TS на обычных запросах, reviver включается, только если вне строк есть цифра с точкой или экспонентой (иначе обычный `JSON.parse`).

Ограничения: (1) правило касается только полей-чисел; в лишних полях любая запись игнорируется. (2) Реализации Rust/Java в этой ветке не собирались: поведение выведено из документированной семантики библиотек и проверяется только на VDS golden-кейсами G71–G80 и сырыми корзинами `raw-*` (`tools/gen-carts.mjs`). (3) Для нестандартных записей (`1E400`, лишние нули) поведение не специфицировано, кроме перечисленного.

### Порядок проверок и ошибки (`400`)

1. Верхний уровень в порядке: `now`, `userCompletedOrders`, `promoCode`, `softPromo`, `items` (массив) — нарушение даёт `{"code":"VALIDATION"}`.
2. Затем позиции по порядку; для каждой сначала структура (`VALIDATION`), затем сочетание `productId`/`productType`: товар (`productId` задан) без `productType`, либо набор (`productId = null`) с заданным `productType` — `{"code":"CART_ITEM_INVALID"}` (в боевом коде «Некорректная позиция корзины»). Побеждает первая найденная ошибка.
3. Отказ промокода при `softPromo=false`: `400 {"code":"PROMO_..."}` (список ниже).

`message` — произвольный текст, при сравнении не используется. Тело `400` всегда содержит `code`.

## Расчёт (эквивалентно `computeTotals`)

Все суммы — десятичные числа произвольной точности (BigDecimal / rust_decimal / десятичное на BigInt), без float и без округления: при всех входах контракта результат точен.

Для каждой позиции по порядку:
- `lineSubtotal = unitPrice * quantity`.
- Набор (`productId = null`): скидка за объём 0.
- Товар: кандидаты — активные правила `bulkDiscounts`, где (`productId` совпал с товаром) ИЛИ (`productId = null` и `productType` совпал), `minQuantity <= quantity` (количество этой строки, не сумма по товару), `minAmount = null` или `minAmount <= lineSubtotal` (включительно). Скидка кандидата: `PERCENT` — `lineSubtotal * discountValue / 100`; `FIXED` и `BONUS` — `min(discountValue, lineSubtotal)`. Берётся максимальная; кандидатов нет — 0.
- `lineTotal = lineSubtotal - bulkDiscount`.

Итоги:
1. `subtotal = Σ lineSubtotal`; `bulkDiscountTotal = Σ bulkDiscount`; `afterBulk = subtotal - bulkDiscountTotal`.
2. Лояльность: при `userCompletedOrders != null` — среди активных `loyaltyDiscounts` с `minPurchases <= userCompletedOrders` берётся запись с наибольшим `minPurchases`; её `discountPercent` — `loyaltyDiscountPercent`, иначе 0. `loyaltyDiscountTotal = afterBulk * loyaltyDiscountPercent / 100`; `afterLoyalty = afterBulk - loyaltyDiscountTotal`.
3. Промокод (если задан `promoCode`). Поиск по коду в верхнем регистре; проверки по порядку, первая сработавшая даёт ошибку:
   1. нет записи или `isActive = false` — `PROMO_NOT_FOUND`;
   2. `validFrom > now` — `PROMO_NOT_STARTED`;
   3. `validUntil < now` — `PROMO_EXPIRED`;
   4. `maxUses != null` и `usedCount >= maxUses` — `PROMO_EXHAUSTED`;
   5. `applicableToTypes` не пуст и ни один тип товарных позиций корзины (`productType` не `null`) в нём не встречается (корзина без товарных позиций тоже не подходит) — `PROMO_NOT_APPLICABLE`;
   6. `minOrderAmount != null` и `afterLoyalty < minOrderAmount` — `PROMO_MIN_AMOUNT`;
   7. `firstPurchaseOnly` и `userCompletedOrders != null` и `userCompletedOrders > 0` — `PROMO_FIRST_PURCHASE_ONLY`.

   Успех: `promoDiscountTotal` — `PERCENT`: `afterLoyalty * discountValue / 100`; `FIXED`/`BONUS`: `min(discountValue, afterLoyalty)`.
   Отказ при `softPromo=true`: `promoDiscountTotal = 0`, `promoError = {"code": "..."}`; при `false` — `400`.
4. `discountAmount = bulkDiscountTotal + loyaltyDiscountTotal + promoDiscountTotal`; `total = subtotal - discountAmount`, но не меньше 0.

## Ответ `200`

```json
{
  "lines": [
    { "cartItemId": "i1", "productId": "p001", "quantity": 10, "unitPrice": "10",
      "lineSubtotal": "100", "bulkDiscount": "5", "lineTotal": "95" }
  ],
  "subtotal": "100", "bulkDiscountTotal": "5",
  "loyaltyDiscountPercent": "0", "loyaltyDiscountTotal": "0",
  "promoDiscountTotal": "0", "promoError": null,
  "discountAmount": "5", "total": "95"
}
```

Канонический вид денег (обязателен, строки сравниваются побуквенно): десятичная запись без экспоненты, без «+», без лишних нулей в дробной части, целое без точки (`"100"`, `"4.75"`, `"0"`, никогда `"100.00"`, `"1E+2"`, `"-0"`). Количество знаков не округляется (например, `"7.49925"`). Округление до копеек — задача платёжного слоя, не этого расчёта (допущение: как в боевом коде, где расчёт не округляет).

`lines` — в порядке запроса; `promoError` — `null` или `{"code": "PROMO_..."}`.

## Область определения (эквивалентность гарантируется только в ней)

Боевой код использует `Prisma.Decimal` (decimal.js, 20 значащих цифр, при превышении округляет), эталонные TS-копии, Rust и Java считают точно. Чтобы результаты не зависели от этого предела:
- проценты в правилах и промокодах — не более 1 знака после запятой; суммы в правилах — не более 2 знаков;
- `subtotal` не более 10^8, в результате не более 19 значащих цифр.

Генератор (`tools/gen-carts.mjs`) эту область соблюдает. Замечание для боевого кода: в БД проценты имеют 2 знака (`Decimal(5,2)`), и при больших суммах боевой результат может быть округлён decimal.js — это вне области эксперимента. Кроме того, боевой код сравнивает `minAmount` через `toNumber()` (float); в эксперименте сравнение точное (расхождение возможно только на границах за пределами точности double, для сумм с 2 знаками отсутствует).

## Упрощённая модель обращений к данным (для сквозного замера)

Параметр `DB_LATENCY_MS` (по умолчанию 0) добавляет задержку на каждое «обращение к БД»:
- лояльность: 1 обращение (если `userCompletedOrders != null`);
- скидки за объём: текущий TS — 1 обращение НА ТОВАРНУЮ ПОЗИЦИЮ (как `getBulkDiscount` в цикле, N+1); TS с батчем, Rust и Java — 1 обращение на всю корзину (если есть товарные позиции);
- промокод: 1 обращение (если задан `promoCode`).

Это модель, а не реальная БД; реальную БД с одинаковым пулом соединений и объёмом данных ставит сквозной замер (см. `docs/reports/lang-bench-plan.md`). Обращения выполняются последовательно в порядке: скидки за объём, лояльность, промокод (как в боевом коде: `priceLines`, затем `getLoyaltyDiscountPercent`, затем `requireValidPromoCode`).

## Источник данных `fixtures/dataset.json`

`bulkDiscounts[]`, `loyaltyDiscounts[]`, `promoCodes[]` — поля повторяют колонки Prisma-моделей `BulkDiscount`, `LoyaltyDiscount`, `PromoCode`; суммы и проценты — строки, даты — `YYYY-MM-DDTHH:MM:SSZ` или `null`. Большой набор для замера: `node tools/gen-carts.mjs --rules 5000` (пишет `generated/dataset-large.json`, исходные правила включены).

## Приватность и секреты

Фикстуры синтетические: идентификаторы `p001…`, `i1…`, коды `SUMMER10…`. Нет ников, IP, почты, ключей. Сервисы не читают переменные окружения, кроме `PORT`, `DATASET_PATH`, `DB_LATENCY_MS` (в Java — ещё стандартные `JAVA_OPTS`).
