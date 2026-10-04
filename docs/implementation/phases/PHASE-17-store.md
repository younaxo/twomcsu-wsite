# PHASE 17 — Store

## Сделано

- `modules/store/` — каталог: `CategoriesController`/`CategoriesAdminController`
  (дерево через `parentId`, нельзя удалить категорию с подкатегориями/
  товарами), `ProductsController`/`ProductsAdminController` (CRUD товара +
  вариантов цен по `ProductDuration`, реальная аналитика «часто покупают
  вместе» через агрегацию `OrderItem` по завершённым заказам, `inWishlist`
  для авторизованного viewer), `BundlesController`/`BundlesAdminController`
  (наборы товаров с собственной ценой и окном действия `validFrom/
  validUntil`).
- Скидки и промокоды: `DiscountsController`/`DiscountsAdminController`
  (`BulkDiscount` по товару/типу+количеству/сумме, `LoyaltyDiscount` по
  числу завершённых заказов), `PromocodesController`/
  `PromocodesAdminController` (валидация публична, применение — через
  корзину). `CurrenciesController`/`CurrenciesAdminController` — курсы
  валют + калькулятор обмена (без баланса — ADR-0035).
- `PricingService` — единая точка пересчёта: bulk-скидка на каждую строку
  (лучшая из подходящих) → loyalty-скидка от остатка → promo-код от
  остатка (ADR-0036); используется и `CartService.calculate()`, и
  `OrdersService.createFromCart()/quickBuy()` — итог всегда пересчитывается
  сервером (ADR-0009), клиентским ценам не доверяет.
- `CartController`/`CartService` — получение/добавление/изменение/удаление
  позиции, очистка, применение/снятие промокода, пересчёт с опциональным
  превью кода; подарок товара (`giftToUsername`) проверяет
  `isGiftable`/`isSelfOnly` и резолвит получателя.
- `WishlistController`/`WishlistService` — получение/добавление/удаление,
  видимость (публичная страница по username), «подарить из своего списка
  желаний» (добавляет в свою корзину с `giftToUserId` получателя).
- `OrdersController`/`OrdersAdminController`/`StoreExtrasController` —
  оформление заказа из корзины (с `targetMinecraftNick`), `quick-buy`
  (всегда анонимный — ADR-0038, обязателен `guestMinecraftNick`), список
  своих заказов/деталь (доступ только автору), `recent-purchases`
  (публичная лента по завершённым заказам), admin список/статистика/
  отмена PENDING/возврат COMPLETED.
- `modules/store/payment/` — `PaymentProvider`-интерфейс, `TestPaymentProvider`
  (не регистрируется в production), `PaymentProviderRegistry`. Заказ
  создаётся в `PENDING`, переходит в `COMPLETED` только через
  `POST /webhooks/payments/:provider` с секретом в теле (`PAYMENT_WEBHOOK_SECRET`,
  constant-time сравнение — ADR-0034), всегда отвечает `200 {accepted,
  reason?}`, идемпотентен. Проверка `isUnique` — при оформлении заказа, не
  при добавлении в корзину (ADR-0037).
- `StoreStatsAdminController`/`StoreStatsService` — overview/sales-by-day
  (реальный `$queryRaw` по `paidAt`)/sales-by-category/top-products/
  revenue-by-week.
- 35 новых permission-ключей (`store.*`, `promocodes.*`, `orders.*`).

## Проверено реальным запуском

`apps/api/test/store-catalog.e2e-spec.ts` — **8 тестов** (категории
permission-gated/публичный список/нельзя удалить с товарами; товары с
вариантами + отдельные CRUD-эндпоинты вариантов; наборы; bulk/loyalty
скидки видны в публичных списках; валюты CRUD + калькулятор обмена
считает верно и требует авторизации; промокоды публичная валидация
валидного/невалидного кода).

`apps/api/test/store-checkout.e2e-spec.ts` — **13 тестов** против
реального Postgres+Redis: добавление в корзину и пересчёт; bulk-скидка
реально применяется при достижении порога количества; подарок отклоняется
для не-giftable и разрешается для giftable с резолвом получателя по
username; применение/снятие промокода и превью через calculate; создание
заказа переводит в PENDING с провайдером `test`, очищает корзину; доступ
к заказу — автору 200, чужому 403; вебхук — неверный секрет отклоняется,
верный завершает заказ и идемпотентен при повторе; повторная покупка
`isUnique`-товара отклоняется; `quick-buy` создаёт анонимный заказ с
`guestMinecraftNick`; admin — список/статистика/отмена PENDING/возврат
COMPLETED; wishlist — добавление/видимость/публичный просмотр/gift из
списка желаний добавляет в корзину с нужным получателем; recent-purchases
отдаёт публичную ленту.

Полный набор из корня (20 e2e suite, 157 тестов) + `lint`/`format:check`/
`typecheck`/`build`/`test` — все зелёные.

## Не входит в эту фазу

- `POST /store/orders/:orderId/mock-complete` — не перенесён: решение уже
  принято в PHASE 00 (ADR-0009, COVERAGE.md «Сознательно не переносится»,
  CRITICAL S2 старого проекта). Заказ завершается только вебхуком.
- Реальный платёжный провайдер (ЮKassa/CloudPayments/Stripe) — выбор и
  credentials за владельцем проекта (RISKS.md R2); до этого работает
  `TestPaymentProvider`, не регистрируется в production.
- Доставка товара на игровой сервер (`Product.gameCommands` → RCON/API) —
  зависит от Minecraft-интеграции (PHASE 18). `OrderItem.isDelivered`
  остаётся `false` после оплаты — честно, не создаёт иллюзию выполненной
  доставки (ADR-0039).
- Загрузка изображений товара/категории/набора — зависит от `StorageService`
  (PHASE 23, RISKS.md R3); поля `image`/`images` принимают готовые URL.
- Баланс премиум-валюты (списание/начисление RUBIES/COINS) — в схеме нет
  поля баланса; `POST /store/exchange` — калькулятор без побочных эффектов
  (ADR-0035).
