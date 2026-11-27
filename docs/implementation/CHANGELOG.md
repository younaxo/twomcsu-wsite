# CHANGELOG

Формат: по факту реализованных и смёрженных в `main` функций. Ничего
"запланированного" сюда не добавляется — см. `ROADMAP.md`.

## [Unreleased]

### Отчёт готовности (27.11)

- Отчёт готовности в процентах по фактам: docs/reports/2026-11-27-readiness-percentages.md.

### Production-минимум 0.10 — документы (28.11)

- Обновлены docs/runbooks: production-env-checklist (все переменные с правилами production и fail-closed, в т. ч. PAYMENT_METHODS, Bridge-выдача, retention, stats), deploy (миграции слоя 0–1, что нельзя удалять, откат флагами), payments, acceptance-checklist (разделы M, N), smoke-test, monitoring (очереди выдачи, UNKNOWN, вебхуки, realtime, CDN). Новый go-live-plan.md.

### Слой 2: контент и realtime — изменения поведения (28.11)

- Правка комментария к новости (`PATCH /news/:slug/comments/:id`): комментарий должен принадлежать новости из slug (иначе 404, неразличимо с несуществующим); при `allowComments=false` — 403; забаненный автор не может править и создавать комментарии. Правка комментария к снятой с публикации новости больше не работает (404) — так же, как создание.
- Web: тексты ошибок по статусам сведены в одну таблицу; 401 — «Войдите в аккаунт, чтобы продолжить.» (было «Сессия закончилась…»); 400/409/422 — отдельные понятные тексты вместо общего; публичные страницы показывают доменный текст API только если он безопасен (без латиницы, email, IP, URL, путей, SQL; ≤ 200 символов), иначе нейтральный текст по статусу.
- Realtime: относительный `NEXT_PUBLIC_API_URL` (`/api`) поддержан (origin из адресной строки, path `/api/socket.io`); отключение сервером/клиентом не показывается как «нет связи».

### Правила агентов, хук deny-python, демо-стенд, приём статистики Bridge (27.11)

- #260 (правила): выкладку стенда выполняет директор платформы; учётные данные стенда — только у chief; Python в исполнении запрещён.
- #261: хук deny-python (барьер, не граница безопасности; риск R178).
- #262: исправлена гонка лимита участников события (J-09-2).
- #263: демо-соцданные стенда; спеки сида покрыты unit-тестами.
- #264: приём `player.stats.snapshot` через Bridge, флаг `BRIDGE_STATS_ENABLED`.
- В CI, не слито: #265 автодополнение @ (по данным агента state OPEN; вопрос Q118).

### Слой 0: магазин — публичные поля, корзина, витрина, админка, оформление (отчёты `docs/reports/2026-11-18-*`; перенос chief 2026-11-18, 0.5 web не включено)

- Магазин, публичные ответы: каталог, наборы, список желаний (в т.ч. публичный по нику) и заказы покупателя отдают только белый список полей (`public-product.ts`); `gameCommands`, `server`, `currencyType`, `currencyAmount`, `positionId`, `decorationId` наружу не уходят; `giftToUser` только публичные поля пользователя (ADR-0107); `bought-together` для скрытого товара даёт 404. Типы `PublicProductDto`, `PublicProductVariantDto` в `@twomc/shared`. Отчёт `store-public-fields`; риск R151.
- Корзина, API: серверный контроль `isUnique`/`maxPerPurchase` при добавлении, изменении и оформлении заказа; слияние одинаковых позиций; машинные коды ошибок промокода и подарков; `promoError` в ответе корзины; публичный белый список полей промокода; `cartItemId` в расчёте; подарок самому себе запрещён. Строгий лимит операций с подарком (10/мин, 60/час на пользователя; на IP мягче), 429 с `Retry-After` и кодом `CART_GIFT_RATE_LIMITED`, при недоступности Redis 503 (fail closed). Типы в `@twomc/shared`: `STORE_CART_ERROR_CODES`, `StoreCartErrorCode`, `StorePromoErrorCode`, `StoreCartErrorBody`, `CartPromoError`, `CartPromoCodePublic`, `CartLineRef`. Миграций нет. Отчёт `store-cart-server-limits`; риски R159, R160.
- 0.1 Витрина: `/shop` — поиск, фильтр по категориям, пагинация, состояния; новая `/shop/[slug]` — варианты и цены из API, количество с `maxPerPurchase`, «Покупают вместе»; «В корзину» была неактивна до 0.2. Требование к API: поле `alreadyPurchased`. Доступность по ревью (фокус, `aria-disabled`, статусные области, `text-foreground` на soft-фонах). Отчёт `l0-01-storefront`.
- 0.2 Корзина, web: `/shop/cart` по API корзины — количество, удаление, очистка с подтверждением, промокод с понятными ошибками, разбор скидок (объём, лояльность, промокод) по ответу сервера, подарок (ник и сообщение); «В корзину» на `/shop/[slug]` работает (слияние вариантов, `maxPerPurchase`, уникальные); ссылки поповера корзины исправлены; «Оформить заказ» неактивна до 0.5. Требования к API: недействительный промокод не роняет GET корзины, `cartItemId` в строках, slug/изображение/duration/maxPerPurchase в позициях, ник получателя, слияние и уникальность на сервере, белый список `promoCode`. Совместимость со старым и новым API через локальные типы (заменить на `@twomc/shared` после публикации API). Отчёт `l0-02-cart`.
- 0.3 Админка товаров, API: `gameCommands` и `isActive` удалены из DTO создания (новый товар всегда `isActive=false`, ADR-0185 п. 6), `gameCommands` в PATCH — 400; цена варианта строкой Decimal; `image`/`images` только https с белым списком хостов (нормализация `url.href`); активация типа вне списка — 422 `PRODUCT_TYPE_NOT_SELLABLE` (`DEFAULT_SELLABLE_TYPES`, TODO(0.11): настройка `store.sellableTypes`); удаление: при заказах деактивация (`mode: deactivated`), иначе жёсткое; 409 `PRODUCT_IN_BUNDLE`, `VARIANT_IN_BUNDLE`, `CATEGORY_HAS_CHILDREN`, `CATEGORY_HAS_PRODUCTS` (было 400); проверки и удаление под `SELECT ... FOR UPDATE`; аудит `store.product.*` в той же транзакции (`AuditLogInput.tx`/`strict`); 2FA персонала проверена e2e. Миграций нет. Отчёт `l0-03-admin-products-api`. Остаётся: обновить `docs/technical/API-REFERENCE` (Decimal-строки, `mode` в DELETE, коды 409/422, `VARIANT_IN_BUNDLE`, атомарность, новые action аудита); серверная проверка типа в корзине и заказе (ADR-0185 Р1).
- 0.3 Админка товаров, web: `/admin/store/products` (список, создание, правка, варианты, быстрая активация, мягкое удаление, предпросмотр) и `/admin/store/categories`; навигация «Магазин -> Товары магазина»; PermissionGate по `store.products.*` и `store.categories.*`; обработка 403, `admin_2fa_required`, 409, 422; поле выдачи и `gameCommands` не показываются и не отправляются. Риски (без номера): типы `AdminProduct` надо синхронизировать с API; хосты картинок продублированы в трёх местах (`next.config`, API, клиент); визуально в браузере не проверялось; эвристика сопоставления 400 с полями зависит от текста API; `FormField` повторяет разметку `ui/Field`. Отчёт `l0-03-admin-products-web`.
- 0.4 Заказы, промокоды, скидки, API: `GET /admin/orders` (фильтры, пагинация), карточка `GET /admin/orders/:id` со сводкой оплаты, отмена PENDING `PATCH /admin/orders/:id/cancel` (причина обязательна, 409 `ORDER_NOT_CANCELLABLE`, аудит в транзакции); суженный `ADMIN_ORDER_INCLUDE` без `gameCommands`; промокоды и скидки Decimal-строкой с аудитом; право `store.discounts.view`; единая `parseDateRange` (`dateTo` вида YYYY-MM-DD = конец суток UTC, действует для всех CSV-экспортов); аудит `orders.export.completed`; защита CSV от инъекций (префикс-апостроф перед `= + - @ TAB CR`); e2e `store-admin-2fa.e2e-spec.ts`. Миграций нет. Отчёт `l0-04-admin-orders-api`. Остаётся: журнал событий вебхука оплаты (нужна модель, решение владельца); выдача `store.discounts.view` существующим ролям при деплое (seed не запускался; решение владельца); другие экспорты (пользователи, жалобы, новости, аудит) без своих аудит-событий.
- 0.4 Заказы, промокоды, скидки, web: `/admin/store/orders` (фильтры, экспорт CSV), `/admin/store/orders/[id]` (отмена PENDING в диалоге с фокус-ловушкой; кнопка возврата выключена флагом `ORDER_REFUND_UI_ENABLED = false`, включение по решению владельца в 0.9), `/admin/store/promocodes`, `/admin/store/discounts`; права и поля `orderNumber`/`nickname` в `packages/shared`. Ограничения: экспорт знает только status/userId/dateFrom/dateTo; API не снимает заданные даты и лимиты; журнала вебхука в БД нет; права `store.discounts.bulk/loyalty.*` и `promocodes.*` выдаются ролям отдельно; навигация `lib/admin/navigation.ts` может конфликтовать с другими ветками админки. Отчёт `l0-04-admin-orders-web`.
- 0.5 Оформление, API: акцепт оферты (`offerVersion`/`offerAcceptedAt`), проверка ника получателя, флаг `QUICK_BUY_ENABLED`, `GET /store/checkout-config`, 503 `payment_unavailable` без висячих заказов; миграция `20261118090000` (expand-only); `GET /store/orders/:orderNumber` для чужого и гостевого заказа даёт 404; проверка `store.offerVersion` в `PATCH /admin/settings`; dev-симулятор вебхука (`docs/runbooks/payment-webhook-sim.md`). Отчёт `l0-05-checkout-api`; риски R161-R166; решения ADR-0184..0186 (см. DECISIONS).

### Транзакции Prisma: общие maxWait/timeout и 503 busy (ADR-0183, ветка fix/prisma-tx-defaults, не смержено, миграций нет)

- `PrismaService`: `transactionOptions` из конфигурации `PRISMA_TX_MAX_WAIT_MS` и `PRISMA_TX_TIMEOUT_MS` (Joi, 1000-30000 и 1000-60000, по умолчанию 10000/10000). Точечные 10_000/10_000 в формах и вебхуке оплаты заказа убраны; Bridge и зеркало наказаний сохраняют 2000/6000.
- Глобальный `PrismaExceptionFilter` (`APP_FILTER` в `PrismaModule`): `P2028`, `P2024`, `P2034` -> 503 `{ code: 'busy' }` с `Retry-After` вместо 500; `/bridge/v1` - тело `{ error: 'unavailable' }`; прочие коды -> 500 без деталей.
- Чек-лист production-env: рекомендация `connection_limit`/`pool_timeout`. Отчёт `docs/reports/2026-11-17-prisma-tx-defaults.md`; риски R138-R142.

### Этап 03, срез 1: приёмник Bridge (ADR-0182, ветка feature/stage-03-s1-bridge-receiver, не смержено, миграции не применялись)

- Модуль `apps/api/src/modules/bridge`: крипто (HKDF-ключ сервера по `slug` как соль, HMAC-SHA256 над сырым телом, `timingSafeEqual`), конфиг (`BRIDGE_ENABLED`, `BRIDGE_MASTER_SECRET` не короче 32 байт; без них все пути отвечают 503), схемы конверта и событий v1, `BridgeSignatureGuard` (порядок проверок раздела 2.3, нонс после подписи, fail-closed 503 при недоступном Redis), `BridgeRateLimitGuard` и Redis-лимиты (запросы на ключ, события в минуту, параллельные запросы, счётчик неудачных аутентификаций), `BridgeController` (`GET /bridge/v1/handshake`, `POST /bridge/v1/events`).
- Приём (`BridgeIngestService`): `punishment.*` применяются в одной транзакции с записью в `bridge_event_log` (дедупликация `(serverSlug, eventId)`, `conflict` при другом `payloadHash`), порядок по маркеру `occurredAt` в Redis (`stale`), capabilities до применения; запись в зеркало этапа 02 идёт через `BridgePunishmentSource` (`id = 'bridge'`, push). `player.*` выключены (`unsupported_type`).
- Очистка журнала раз в сутки, срок не меньше 7 суток (F5). CLI: `bridge:register` (запись сервера, секрет не читает) и `bridge:print-key` (ключ только владельцу, F3). Симулятор плагина `scripts/bridge-plugin-sim.ts` (только режим scenario) и fixtures `apps/api/test/fixtures/bridge`.
- Раунд безопасности приёмника Bridge: `received` (короткая транзакция, атомарный маркер) -> publish вне транзакции -> `applied`; подписчик зеркала со своим `sourceScope`; счётчик неверных подписей по паре (ip, key-id); парсер тела `/bridge/v1` (`BRIDGE_MAX_BODY_BYTES`, 413 и 400 `invalid_body`); строгая проверка мастер-секрета; формат `bridge.hello`; флаги `--production --confirm-owner` для боевой регистрации (runbook `docs/runbooks/bridge-server-registration.md`). R121 закрыт, R127–R132 новые.
- Статический e2e `apps/api/test/bridge.e2e-spec.ts` по плану раздела 11 контракта (не запускался).
- Сверка с итоговым контрактом (коммиты a43b0f3, c5b6efc): `chat.*`, `player.*`, `inventory.*` -> `rejected` `unsupported_type`, `features.player_events=false`; формат `key-id` по slug `^[a-z0-9][a-z0-9-]{1,31}$`; при недоступном Redis guard и лимитер отвечают 503 `unavailable` с `Retry-After: 5`; коды инвентаря 5.1 и раздел 6.1 не реализованы; регистрация сервера только данными через CLI `bridge:register`, без лимита (Q42). Тест `bridge-slice1-contract.spec.ts`.
- Документы: ADR-0182, риски R111-R125, контракт `docs/stage-03/BRIDGE-CONTRACT.md`; отчёт `docs/reports/2026-11-17-03-s1-bridge-receiver.md`.
- Целевое ревью парсера тела `/bridge/v1` (APPROVE WITH NOTES): дедлайн чтения `BRIDGE_BODY_READ_TIMEOUT_MS` (408 `request_timeout`, 10000 мс, границы 1000-30000), префикс пути без учёта регистра и по части до `?`, строгий UTF-8 (невалидный -> 400 `invalid_body`, `rawBody` побайтный), контракт приведён к 415 `unsupported_encoding` на уровне парсера. Новый риск R137 (таймауты Node и nginx не менялись).
- Проверки: `tsc --noEmit` 0 ошибок; jest `src/modules/bridge src/modules/punishments` 975 тестов, все пройдены. e2e в этой сверке не перезапускались (код не менялся; ранее на a43b0f3: bridge 21/21, bans 25/25). Открыто: противоречия контракта 1 и 2 (R122, R123), publish внутри транзакции при малом пуле Prisma (R121).

### Этап 02, срез 2: фронтенд /bans и «Наказания на серверах» (ADR-0181, ветка feature/stage-02-s2-bans-ui, не смержено, сборка и e2e не запускались)

- Публичная страница `/bans` (баны и муты: поиск по нику по кнопке, фильтры типа и статуса, сортировка по дате, курсорная пагинация «Показать ещё») и карточка `/bans/[ref]`, обе `noindex`. Вывод по белому списку полей, причина дословно как текст.
- «Настройки -> Наказания»: блок «Наказания на серверах» (`GET /punishments/me`) отдельно от «Наказаний на сайте»; состояния загрузки, пусто, ошибка с повтором, 401, 404, 429 (Retry-After), 503, `meta.stale`, аккаунт не привязан (`linked: false`).
- Клиент API: `ApiError.retryAfterSeconds` (целые секунды из `Retry-After`). Ссылка «Список наказаний» в футере.
- Экспорт `Retry-After` через CORS (коммит d89fa51, `fix(api)`): `exposedHeaders: ['Retry-After']` в `apps/api/src/configure-app.ts`, unit-spec `configure-app.spec.ts`, усиление assert Low-1 в `bans.e2e-spec.ts`. Без этого браузер не видит `Retry-After` на кросс-доменных запросах web -> api (R110).
- Проверки: `tsc --noEmit` (apps/web) 0 ошибок; vitest apps/web 103 файла, 605 тестов, все пройдены (из них 21 новый в `punishments-ui.test.tsx` и 2 в `client.test.ts`). e2e и `next build` не запускались.

### Этап 02, срез 2: бэкенд /bans (ADR-0180, ветка feature/stage-02-s2-bans-contract, не смержено, миграция и e2e не запускались)

- Эндпоинты (модуль `PunishmentsModule`, контроллеры `MinecraftPunishments{Public,Me,Admin}Controller`): `GET /punishments/public` и `/punishments/public/:ref` (без входа, throttle 60/мин, ETag, `noindex`), `GET /punishments/me` (JWT, 30/мин, только по подтверждённой привязке, uuid версии 3 даёт `linked: false`), `GET /admin/punishments`, `/admin/punishments/status`, `/admin/punishments/:ref` (право `users.punishments` + 2FA, аудит `punishment.card.view` только для карточки), `POST` и `DELETE /admin/punishments/:ref/issuer-hidden` (право `punishments.issuer.hide`, иерархия N3, условный `UPDATE` и аудит в одной транзакции). Публичная причина - закрытый словарь, пока карта пуста всегда `rules`; выдавший виден по умолчанию с флагом принудительного скрытия; область с названием сервера; курсорная пагинация; серверный кэш с TTL 5 с и сбросом при скрытии выдавшего.
- Раунд исправлений 1 (по ревью Q&S и e2e chief): ETag снят у ответов модуля, которым он не положен (ошибки, `me`, `admin/*`; `suppressEtag` в `punishments-http.ts`, глобальный Express не менялся); `issuer-hidden` требует оба права `punishments.issuer.hide` и `users.punishments`; в аудит скрытия и раскрытия пишутся IP и User-Agent; иерархия перепроверяется внутри `$transaction` (R100); в `bans.e2e-spec.ts` ключ 2FA задаётся тестовой константой (кейс `admin_2fa_required` теперь исполняется), добавлены кейсы Low-1, Low-2 и L1 (синхронизация не сбрасывает `issuerHidden*`); юнит-тесты `PermissionsGuard` (п.31), предела 5 + 15 + 30 с (п.17), IP/UA, повторной проверки иерархии. e2e не запускались.
- Право `punishments.issuer.hide` добавлено в каталог `packages/shared/src/permissions.ts` (в БД попадает только seed, который выполняет владелец). Локальная копия типов API с контрактным тестом синхронизации (R80).
- Коммиты: d596ec0, 3858e34, ba36556, 6517d2a, ec75b5c и коммит этапа C (e2e). 675 unit-тестов (19 наборов); статические e2e (не запускались): `apps/api/test/bans.e2e-spec.ts` (HTTP-стек, заголовки, порядок проверок, ETag/304, аудит, откат транзакции, гонки), `bans-throttle.e2e-spec.ts` (429 и `Retry-After`), `bans-explain.e2e-spec.ts` (EXPLAIN на одноразовой БД, включается только `BANS_EXPLAIN_E2E=1`). Миграция среза 2 не применялась. Риски R90, R91, R92.

### Этап 02, срез 2: миграция колонок скрытия выдавшего и индексов (ADR-0180, ветка feature/stage-02-s2-bans-contract, не смержено, не применялась, ждёт ревью Q28)

- Миграция `20261117040000_punishments_public_indexes` (вручную, Q43 а; только `ADD COLUMN` четырёх колонок `issuerHidden*` и `CREATE INDEX` трёх индексов: выражение `lower("subjectName") text_pattern_ops`, частичный публичный `(startedAt, id)`, обычный `(startedAt, id)`). Поля добавлены в модель `MinecraftPunishment` (`schema.prisma`), индексы описаны комментарием модели. Юнит-тесты: текст миграции (только разрешённые операторы, нет `DROP` индексов и колонок в других миграциях) и текст SQL upsert синхронизации (нет `issuerHidden`). Контроллеры и сервисы среза 2 не писались; на БД не применялась. Риски R88, R89.

### Этап 02, срез 2: контракт API наказаний (ADR-0180, ветка feature/stage-02-s2-bans-contract, только документ, не смержено)

- `docs/stage-02/BANS-API-CONTRACT.md`: публичный список и карточка `/punishments/public`, «мои наказания» `/punishments/me`, просмотр персоналом `/admin/punishments` (право `users.punishments`, 2FA), причина на `/bans` только из закрытого словаря (Q59), недоступность 404/503/`stale`, DTO для `packages/shared`, синхронизация копий типов тестом (R80), WebSocket отложен. Код, схема и миграции не менялись; ADR-0180 в статусе Proposed.
- Проход 2 по ответу владельца на Q63 (только документы, 2026-11-17; ADR-0180 остаётся Proposed): причина на `/bans` публично везде «Нарушение правил», пока владелец не пришлёт соответствие шаблонов и формулировок (карты пусты и выключены, словарь из семи категорий и механизм описаны); выдавший виден по умолчанию публично и игроку (отменяет Q31 п.5), включая случай «консоль»; принудительное скрытие выдавшего куратором и выше (новое право `punishments.issuer.hide`, 2FA, иерархия `canActOn`, `POST` и `DELETE /admin/punishments/:ref/issuer-hidden`, флаг в колонках зеркала `issuerHidden*` в добавочной миграции среза 2, синхронизация флаг не затирает, аудит «кто, у какого, когда»); область публично везде с названием сервера (`Server` сайта, иначе очищенное `server_scope`, иначе «Неизвестный сервер»); аудит только просмотра карточки персоналом, список не пишется; публичный банлист без входа и без права, `punishments.view` не вводится. Тест-план дополнен (п.23-30). Риски R81-R87. Код, схема, миграции и `permissions.ts` не менялись.
- Финал контракта (только документы, 2026-11-17): ADR-0180 Accepted, утверждён chief по итогам независимого ревью Q&S (APPROVE WITH NOTES); внесены N1-N3 (право `punishments.issuer.hide` только через seed, атомарность скрытия и аудита в одной транзакции, сопоставление выдавшего только по подтверждённой привязке с fail-closed правилом для несопоставленного), тест-план 31-38, проверки миграции и оценка блокировок (2.6), ссылка на расхождение с дизайном (silent скрыт).
- Раунд исправлений 1 (только документы; пункты об аудите списка, скрытом выдавшем и необъявленной области заменены проходом 2): IP-баны не публикуются никогда (`ipBan = false`), офлайн-UUID (версия 3) даёт `linked:false`, порядок проверок и `503` при отсутствии первичной загрузки любого нужного вида, единая формула `meta.stale`, префиксный поиск через `$queryRaw` с экранированием и описание отдельной индексной миграции среза 2 (только `CREATE INDEX`, ревью до контроллеров, файл не создан), аудит просмотра персоналом, юридическое условие включения раздела (152-ФЗ), форматы и кодирование query, курсор с хэшем фильтров, формат `ref` до 18 цифр, контракт ошибок (`PunishmentErrorBody extends ApiErrorBody`), `removedReason` убран из `me`, имена контроллеров `MinecraftPunishments*`, расширенный контрактный тест типов, риск R80 в `RISKS.md`.

### Этап 02, срез 1: зеркало наказаний и синхронизация (ADR-0178, ветка feature/stage-02-s1-punishments-core, не смержено)

- Контракт `PunishmentSource`, нормализация, статус, очистка причины, `rowHash`; модели `MinecraftPunishment` и `PunishmentSyncState`; миграция `20261117020000_punishments_mirror` (не применялась); `PunishmentsSyncService` (слои 0-3 и T), лидерство через Redis, `PunishmentsModule` без побочных эффектов без источника; `LITEBANS_*` в валидации env. Адаптер mysql2, `/bans`, «Мои наказания», WebSocket и админ-управление не входят (срезы 2-3). Риски R52-R55. Отчёт: `docs/reports/2026-11-17-02-s1-punishments-core.md`.
- Раунд исправлений по ревью (фазы A и B): F1-F2 сверка при откате источника (курсор опускается только после успешной мягкой сверки), F3 пороги массовой пометки (`MASS_DELETE_MAX_RATIO` 0.5, `MASS_DELETE_MIN_ROWS` 10, код `MASS_DELETE_SUSPECTED`), часы (`CLOCK_TOLERANCE_MS` 5 с, код `CLOCK_SKEW`), F4 лимиты транзакции записи (`APPLY_TX_MAX_WAIT_MS`, `APPLY_TX_TIMEOUT_MS`) в пределах TTL блокировки 10 с, F5 `drainSkippedIds`, F6 проверка токена лидера перед записью, F7-F11 (heartbeat после `release()`, сбой `eval`, `stale` вне `degraded`, Invalid Date проверяется до транзакции, полная сверка после опроса всех типов), очистка текста (`sanitizeReasonDetailed`, `isReasonMasked`). Миграция по-прежнему не применялась (R52). Скорректированы R52-R54, R56-R58. Отчёт: раздел «Исправления по ревью».
- Повторное ревью среза 1 (раунд 2): токен лидера между группами пометки и перед записью состояния (M1, M2), слой T только после сверки часов (M3), склонения платформ и секреты в очистке причин (N1, N5), тесты границ F2/F3/F5, `RECONCILE_STALLED`; R54, R56. Схема и миграция не менялись.

### Q21: throttler по подсети /64 и «Последний IP» в админке (ADR-0177, ветка fix/q21-ipv6-throttler-admin-ip, не смержено)

- Глобальный throttler (`IpSubnetThrottlerGuard`) считает по `rateLimitKey`: IPv4 полный, IPv6 по /64, `unknown` / `raw:<hash>`; соседи по /64 делят лимит (решение владельца Q21 1а). Аргументы `@Throttle`/`@SkipThrottle` не менялись; `ws-rate-limit` (по `userId`) не менялся.
- `BruteForceService` пишет `bruteforce:lastip:<rateLimitKey>` (полный нормализованный IP, EX 900, обновляется при каждой неудаче), `reset()` его удаляет. `GET /admin/security/suspicious` отдаёт `lastIp` (`SuspiciousIpDto`, shared), web: колонки «Ключ подсети» и «Последний IP». Миграции БД нет.
- Коммиты: 5e895c0 (шаг 1), e134f36, 53c4acc, afcacfb, 14e54ca. 15 новых unit-тестов api, 3 теста web `security.test.tsx`; e2e `throttler-subnet.e2e-spec.ts` (новый), `trust-proxy.e2e-spec.ts`, `admin.e2e-spec.ts` дописаны статически, не запускались. Риски R46–R49. Отчёт: `docs/reports/2026-11-17-00-q21-ipv6-throttler-admin-ip.md`.
- Исправления по ревью (APPROVE WITH NOTES): `app.module.spec.ts` сделан герметичным (виртуальный мок `multer`; `multer` в package.json не добавлялся); тест пачек `MGET` (100/101/250 ключей); e2e изоляции /64 проверяет исчерпанный лимит (статически, не запускался); риски R50 (NAT64/6to4 в одной /64) и R51 (сброс /64 при успешном входе); L5: основание обработки полного IP как персональных данных — решение владельца.

### Q52: права на удаление заметок обращений (ADR-0176, ветка fix/q52-delete-notes-perms, не смержено)

- Удаление чужой заметки требует `reports.notes.edit`, чужой закреплённой ещё и `reports.notes.unpin`, иначе 403; своя заметка удаляется как раньше. Web не менялся (кнопки удаления нет).
- 9 unit-тестов сервиса (в т.ч. 404: нет заметки, заметка другого обращения, нет обращения) и 2 теста контроллера (право `reports.notes`, передача `user.id`); e2e дописан статически (403 без `edit`, 200 с `edit`, 403 чужая закреплённая без `unpin`, автор удаляет свою закреплённую), не запускался; миграций нет. Риск R45; чек-лист владельца дополнен (кэш прав, SQL по ролям, проверка миграции Q50 на одноразовой БД).

### Q51: модератор скрыт в уведомлениях автору обращения (ADR-0175, ветка fix/q51-hide-moderator-in-author-notifications, не смержено)

- `notifyAuthor` (смена статуса, вердикт, ответ модерации) не передаёт `fromUserId`: отправитель — система, имя и аватар модератора не попадают в payload, WS и push-превью. Уведомление исполнителю (`REPORT_ASSIGNED`) не менялось.
- Unit-тест: payload автору без данных модератора, персоналу без изменений; e2e `reports-support` дописан статически, не запускался. Старые уведомления с `fromUserId` остаются (R44).

### Q51: модератор скрыт в уведомлениях автору обращения (ADR-0175, ветка fix/q51-hide-moderator-in-author-notifications, не смержено)

- `notifyAuthor` (смена статуса, вердикт, ответ модерации) не передаёт `fromUserId`: отправитель — система, имя/аватар модератора не попадают в payload, WS и push-превью. Уведомление исполнителю (`REPORT_ASSIGNED`) не менялось.
- Unit-тест: payload автору без данных модератора, персоналу без изменений; e2e `reports-support` дописан статически, не запускался. Старые уведомления с `fromUserId` остаются (R44).

### Q50: перенос прав заметок обращений (ADR-0174, ветка fix/q50-notes-perms-backfill, не смержено)

- Миграция данных `20261117010000_reports_notes_permissions_backfill` (не применялась): создаёт `reports.notes.edit` и `reports.notes.unpin`, выдаёт их ролям со старыми `reports.delete` и `reports.notes.pin` (только ALLOW), идемпотентно, только INSERT.
- Unit-тест миграции читает SQL (запрещённые операторы, ON CONFLICT, ALLOW, соответствия). Чек-лист владельца обновлён: миграция -> seed -> проверка выдачи -> деплой.

### Исправления по ревью Q48 (ветка fix/q48-unban-hierarchy-all, не смержено)

- Бан в обращениях: замена действующего бана = снятие, правило проверяется для каждого заменяемого бана («всё или ничего», 403 `sanction_revoke_forbidden`), плюс иерархия к цели (`canActOn`) при выдаче; так же при бане аккаунта через `QuickModerationService.ban`. Допущение chief, ADR-0173, R41.
- Снятие и выдача бана аккаунта условны по состоянию (`updateMany`, 409 при гонке); снятие бана аккаунта и бана в обращениях пишет аудит в той же транзакции (`AuditService.logInTx`), ошибка аудита откатывает снятие.
- `issuerKnown` для владельца отражает факт; R42 и чек-лист исправлены: без миграции падает чтение любого пользователя. e2e дописаны статически, не запускались.

### Исправления по ревью Q26/Q27 (ветка feature/q26-q27-report-status-notification, не смержено)

- `PATCH /moderation/reports/:reportNumber/notes/:noteId/pin` только закрепляет: `pinned:false` даёт 400; открепление только `DELETE .../pin` под `reports.notes.unpin` (иначе держатель pin обходил право unpin). Web должен перейти на DELETE. Unit-тесты добавлены; e2e дописаны статически, не запускались.
- Документация: уточнён риск R40 (без миграции смена статуса не падает, уведомление теряется с `logger.warn`), порядок выкладки и сверка PostgreSQL (образ 16) в чек-листе, права и эндпоинты заметок в `04-API-REFERENCE.md`.

### Безопасность: снятие мута и бана в чате по иерархии

- Снять мут или бан чата (`DELETE /admin/chat/mutes/:id`, `/bans/:id`) может выдавший либо сотрудник с приоритетом не ниже выдавшего; иначе 403 с общим текстом (решение владельца Q25, ADR-0171, ветка fix/q25-chat-unmute-hierarchy, не смержено). Снять санкцию с себя может только выдавший. Выдавший неизвестен (пусто, удалён, SYSTEM): снимает только приоритет не ниже максимального по ролям (допущение, ADR-0171). Новый метод `PermissionService.canRevokeSanction`; HTTP-контракт и схема не менялись. Unit-тесты добавлены, e2e не запускались. Другие пути снятия бана не менялись, записан R38.

### Безопасность: выдача роли только в пределах своих прав

- Выдача роли пользователю (`POST /admin/users/:userId/roles/:roleId`) требует, чтобы права роли входили в права выдающего; иначе 403 `role_permissions_exceed_grantor` со списком недостающих прав (решение владельца Q23, ADR-0170, ветка fix/q23-role-grant-subset, не смержено). Владелец (роль с полным доступом) проверку не проходит; роль с полным доступом выдаёт только владелец; право `*` покрывает любые права. Проверки priority и canActOn сохранены, снятие роли не менялось. Единый метод `PermissionService.assertGrantorCoversRole`. Unit-тесты добавлены; e2e-кейс дописан, не запускался. Других путей выдачи роли в API нет. Записан R37.

### Безопасность: 2FA персонала обязательна

- 2FA персонала обязательна всегда (решение владельца Q22, ветка fix/q22-admin-2fa-always, не смержено): переключатель «требовать 2FA для администрации» убран, действия администрации и модерации (в том числе мут, бан и закрепление в чате, поиск получателей рассылок) без включённой 2FA дают отказ `admin_2fa_required`; войти и включить 2FA сотрудник может сам. В production без ключа шифрования 2FA отказ получают все. Повторное подтверждение 2FA для чувствительных операций позже отдельной задачей. Если потеряны устройство и резервные коды, нужна офлайн-процедура владельца: `docs/runbooks/owner-emergency-access.md`. Колонка настройки в БД не удалена (ждёт решения владельца). e2e обновлены, не запускались.
- Чтение staff-видимого контента без 2FA (R35, ADR-0169, та же ветка): события (`events.view.staff`), формы (`forms.view.*`) и темы (`topics.view.*`) для сотрудника без 2FA показываются как обычному игроку (скрытое и staff-видимое не отдаётся, без 403); с 2FA или без ключа в явных development/test поведение прежнее. Сервисы принимают viewer `{ id, twoFactorEnabled }` вместо `id`. Unit-тесты добавлены; e2e не запускались.
- Q22, раунд 3 (та же ветка): `PUT/PATCH /admin/settings/site` больше не возвращает deprecated-поле `requireAdmin2fa` ни в ответе, ни в данных аудита; добавлены тесты проводки viewer с `twoFactorEnabled` (события, формы), fail-closed для `NODE_ENV` пусто/не задан/staging в событиях и темах, отказ `send_message` в read-only канал без 2FA в чате; уточнён ADR-0169 про `/events/mine`; записан R36 (приглашение к форме без проверки INVITE_ONLY, прежнее поведение, не исправлено).
- Исправления по ревью (та же ветка): 2FA требуется и на проверках прав вне `PermissionsGuard` — чтение чужого обращения по `reports.view`, загрузка файлов по праву персонала, отправка в read-only канал чата по `chat.messages.post_readonly`; `GET /admin/settings/site` не отдаёт устаревшее поле `requireAdmin2fa`. Заметка для релиза: старый web-клиент, присылающий `requireAdmin2fa` в обновлении настроек сайта, получит 400 (`forbidNonWhitelisted`); web в этой ветке обновлён, кэшированный старый клиент нужно перезагрузить.

### Контракт этапа 03: TwoMC Bridge (только документ)

- Добавлен проект контракта Bridge v1 (плагин → сайт, HTTPS + HMAC, идемпотентность, симулятор и записка для разработчика плагина): `docs/stage-03/BRIDGE-CONTRACT.md` и ADR-0167 (Proposed). Код, плагин, миграции и ключи не создавались.
- Добавлен дизайн сайтовой части этапа 04 «Инвентарь» (данные через Bridge, хранение, API, приватность, иконки; ADR-0168, Proposed): `docs/stage-04/INVENTORY-SITE-DESIGN.md`. Код, миграции и ключи не создавались.

### Дизайн этапа 02: наказания LiteBans (только документ)

- Добавлен проект интеграции с LiteBans: `docs/stage-02/LITEBANS-INTEGRATION-DESIGN.md` и ADR-0166 (Proposed). Код, миграции и зависимости не менялись; реализация ждёт решений владельца.

- Обращения, срез 2 (ADR-0165, ветка feature/support-slice-2 от fix/q11-staff-hierarchy-node-env, не смержено): выбор исполнителя списком (`GET /moderation/reports/assignable-staff`), правка и закрепление заметок (`PATCH` заметки, `PATCH`/`DELETE .../pin`), игроку у сообщений персонала `authorId=null` и `isStaff=true` (бейдж «Сотрудник»), `GET /reports/:reportNumber/history` для автора, в web `?punishment=ID`, фильтры status/type и блок «История». Не сделано: тип уведомления `REPORT_STATUS_CHANGED` (нужна миграция, решение владельца), вложения (R3, заглушка). e2e написаны, не запускались (ОЗУ).

- Безопасность: NODE_ENV fail-closed (ADR-0164, ветка fix/q11-staff-hierarchy-node-env, не смержено): пустой/не заданный NODE_ENV = production, схема env принимает только development/test/production или пусто (staging и прочее роняют старт); хелпер `isProductionLike`, схема env без дефолта `development`, guard admin-2FA, тестовый OTP, CORS, письма с кодами; `start:dev` и `start:debug` api через `scripts/with-node-env.mjs development`; `start` NODE_ENV не задаёт. В той же ветке: проверка иерархии при mute/ban в `ModerationService` (запрет равного приоритета и себя).

- Исправления по ревью C: лимит отправки форм (ADR-0162: `maxWait`/`timeout` транзакции отправки 5 с вместо 10 с; `@Throttle` отвергнут — e2e форм шлёт 22 отправки/мин с одного IP), тесты `rateLimitIp` для brute-force входа и 2FA (ADR-0163).

- Безопасность: лимиты brute-force входа и 2FA для IPv6 считаются по подсети /64 (ADR-0163, ветка fix/q9-ipv6-64-rate-limit, не смержено): `rateLimitKey` в `config/trust-proxy.ts`, применён в `BruteForceService`; журналы/аудит/captcha по-прежнему с полным адресом; глобальный throttler не менялся. e2e отложен: диск. Доработка по ревью: ключ brute-force строится от сырого `req.ip` (`RequestContext.rateLimitIp`), мусор больше не делит `unknown`; полная форма mapped IPv4 распознаётся.

- Формы: транзакция отправки ответа получила `maxWait`/`timeout` 10 с (ADR-0162, ветка fix/forms-submit-tx-wait, не смержено): параллельные отправки больше не падают 500 на ожидании advisory lock. e2e отложен: диск.

- Fail-fast production env (ADR-0161, ветка fix/p3-env-prod-startup-check, не смержено): API в production не стартует без TRUST_PROXY и TURNSTILE_SECRET_KEY, TURNSTILE_DISABLED=true запрещён (раньше captcha отключалась); compose требует TRUST_PROXY; добавлен чек-лист `docs/runbooks/production-env-checklist.md`.

- Исправления по ревью P3-03a/b, P3-02b: runbook Cloudflare — скрипт файрвола прерывается до изменения правил при сбое `curl`, пустом списке или неверном формате; Authenticated Origin Pulls помечен как рекомендуемый; добавлено предупреждение не включать `real_ip` без файрвола origin.

### Cloudflare real_ip (P3-02b)

- Runbook `docs/runbooks/cloudflare-real-ip.md` (диапазоны Cloudflare, `real_ip_header CF-Connecting-IP`, обновление, файрвол origin, проверки, откат) и ADR-0160. Только документация: схема прокси не выбрана, блок в `infrastructure/nginx.twomc.su.conf.example` остаётся закомментированным, `TRUST_PROXY=1` без изменений.

### Бэкапы и восстановление (P3-03b)

- `infrastructure/backup/backup.sh`, `restore.sh`, `restore-drill.sh`, `docker-compose.restore-drill.yml`: дамп PostgreSQL
  и роли, архив uploads, манифест sha256, шифрование age/gpg, S3 опционально, локальный fallback с ротацией, отказ
  восстановления при несовпадении sha256. Runbook `docs/runbooks/backup-restore.md`, ADR-0159, риск R30. Restore-drill
  не выполнялся (диск), расписание не включено.

### Безопасность deploy.sh и лимиты production-compose (P3-03a)

- `infrastructure/deploy.sh`: снимок БД перед `prisma migrate deploy` (при провале деплой останавливается), честные
  проверки health и откат без ложного «Откат выполнен», остановка при отсутствии `.release.prev`, хранение
  `KEEP_RELEASES` последних тегов образов вместо `docker image prune -f`. `.release*` в `.gitignore`.
- `docker-compose.prod.yml`: лимиты памяти и ротация логов json-file (значения через env). Runbook
  `docs/runbooks/deploy.md`, ADR-0158.

### Платёжный вебхук: HMAC и сверка суммы (P3-01)

- `POST /webhooks/payments/:provider` проверяет HMAC-SHA256 подпись над сырым телом (`x-twomc-signature`,
  `x-twomc-timestamp`, окно ±5 минут); неверная подпись — 401, неизвестный провайдер — 404. Секрет в теле
  и дефолт `PAYMENT_WEBHOOK_SECRET` удалены (пустой секрет отклоняет всё).
- Сверка суммы и валюты, запрет перезаписи `paymentId`, атомарный переход `PENDING` -> `COMPLETED`/`FAILED`;
  `usedCount` промокода растёт ровно один раз при параллельных вебхуках; повтор — 200 `already_processed`.
- Тестовый платёжный провайдер регистрируется только при `NODE_ENV` development/test; `quick-buy` ограничен
  10 запросами в минуту.
- Отказы сверки вебхука (provider/paymentId/валюта/сумма) пишутся в `Logger.warn` без подписей и сумм; добавлены
  тесты идемпотентности `failed`; задокументирован риск R29 (порядок событий).

### Безопасные cookie в production и обязательная 2FA админов (P3-A1, P3-A2)

- В production API не стартует без `COOKIE_SECURE=true`, `COOKIE_DOMAIN` (не localhost/127.0.0.1/пусто)
  и `TWO_FACTOR_ENCRYPTION_KEY` (≥ 32 символов). `COOKIE_SAMESITE=none` допустим только при
  `COOKIE_SECURE=true` (во всех окружениях). dev/test сохраняют прежние дефолты.
- `PermissionsGuard`: в production без ключа 2FA и при включённом `requireAdmin2fa` действия персонала
  отклоняются (`403 admin_2fa_required`), а не пропускаются молча.
- Та же проверка admin-2FA добавлена в WS `/chat` (`mute_user`, `ban_user`, `pin_message`, а также
  `delete_message` в модераторской ветке — удаление чужого сообщения; автор удаляет своё без 2FA) и в
  `GET /admin/communications/recipients`.
- `TWO_FACTOR_ENCRYPTION_KEY` обрезается по краям (`trim`): ключ из пробелов не проходит проверку.
- Вне production без ключа 2FA при старте один раз пишется предупреждение: admin-2FA не работает
  (допустимо только вне production; production-compose задаёт `NODE_ENV: production`).
- ПЕРЕД ДЕПЛОЕМ: задать `COOKIE_SECURE=true`, `COOKIE_DOMAIN`, `TWO_FACTOR_ENCRYPTION_KEY` в серверном
  `.env`/compose — иначе API не запустится.

### Реальный IP клиента за прокси: TRUST_PROXY (P3-02)

- Новая переменная `TRUST_PROXY` с проверкой при старте: пусто (выключено), число hop-ов (`1` для
  nginx → api), `loopback`/`linklocal`/`uniquelocal` или список CIDR. `true`, `*`, `-1` и мусор не
  допускаются (иначе IP можно подделать заголовком).
- Клиентский IP нормализуется (`::ffff:1.2.3.4` → `1.2.3.4`) для throttler, brute-force входа, audit,
  сессий, `lastLoginIp`, captcha и регистрации: клиенты за прокси больше не делят один счётчик.
- `docker-compose.prod.yml`: `TRUST_PROXY: ${TRUST_PROXY:-1}` (пустое или незаданное значение трактуется
  как `1`); nginx-пример передаёт `X-Forwarded-For $remote_addr` (перезапись, не дописывание).
- Нормализация: не-IP значение, слишком длинная строка → ключ `unknown`; IPv6 zone id (`%eth0`) срезается.
- ВНИМАНИЕ перед деплоем: проверить серверный `.env` — значение `TRUST_PROXY=true` теперь отвергается
  при старте API; заменить на `1` (или удалить строку). `uniquelocal` включает `fc00::/7`.
- ADR-0155.

### Docker web: публичный ключ Turnstile (P3-04)

- Образ web получает ключ как `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (раньше — устаревшее
  `NEXT_PUBLIC_HCAPTCHA_SITE_KEY`, из-за чего в production-сборке капча не включалась).
- Сборка web с пустым ключом падает с понятным сообщением; секретный ключ в образ web не попадает.
  Проверка действует для Docker-сборки; локальный `next build` без ключа по-прежнему отключает капчу.

### Обращения: обжалование наказания, приоритет и очередь персонала

- Обжалование привязывается к конкретному наказанию: только своему, обжалуемому и без другого
  открытого обжалования; из «Моих наказаний» — кнопка «Обжаловать».
- Открыт тип обращения «Проблема с донатом» (только обращение, без покупок и платежей).
- У обращений есть приоритет (вычисляет сервер), на странице обращения — хронология переписки;
  в завершённом или заблокированном обращении игрок больше не может писать.
- Очередь персонала: фильтры по приоритету и ответственному, поиск, передача обращения,
  вкладка «История» с действиями персонала; уведомления о сообщениях и смене статуса.
- Игрок больше не получает служебные поля персонала в ответах API.
- Защита от спама: не более 5 обращений за 10 минут и 20 сообщений в минуту от одного игрока.

### Формы: ответы под защитой

- Поля формы, на которую уже есть ответы, больше нельзя пересоздать — раньше это молча стирало
  ответы игроков. «Удалить» в админке форм стало «В архив»: ответы сохраняются.

### Участники событий

- В админке событий — кнопка «Участники»: кто записался и с каким статусом.

### Приглашения форм

- На странице формы в админке — вкладка «Приглашения»: ссылки для форм «по приглашению» с лимитом
  ответов и сроком, копирование и удаление.

### Формы в админке

- «Контент → Формы»: список анкет и заявок, публикация и закрытие приёма, копия; ответы игроков
  с карточкой по полям и статистика по вариантам.

### События в админке

- «Контент → События»: создание и правка ивентов и турниров, публикация, отмена с уведомлением
  участникам. Обложка события — только с CDN проекта, как у новостей.

### Сборщик статусов серверов

- История онлайна серверов пишется раз в 5 минут, даже когда сайт никто не открывает, — без дыр
  для будущего графика онлайна.

### Запланированные новости

- Новость можно запланировать: в редакторе — статус «Запланирована» и время публикации, новость
  выйдет сама (проверка раз в минуту).

### Темы и голосование в админке

- «Контент → Темы»: правила, FAQ, информационные страницы и юридические документы редактируются в
  админке с предпросмотром — тексты юрдокументов теперь можно опубликовать без разработчика.
- «Контент → Голосование»: сайты-рейтинги с наградой и интервалом; секрет вебхука показывается один
  раз — после создания и после замены.

### Новости в админке

- «Контент → Новости»: список с фильтрами, редактор с предпросмотром Markdown, закреп, «на главную»
  и архив. Обложка новости — только с CDN проекта: ссылка на чужой сайт больше не ломает блок
  новостей на главной.

### Медиа-заявки в админке

- «Люди и доступ → Пользователи → Медиа-заявки»: очередь заявок на значок YouTube, Twitch, TikTok —
  одобрение и отказ с причиной; заявку нельзя рассмотреть дважды, а вторую заявку на ту же
  платформу — отправить, пока первая на рассмотрении.

### Назначения из карточки пользователя

- В карточке игрока в админке — вкладка «Команда и награды»: должность, отделы, своя должность и
  награды назначаются и снимаются прямо оттуда.

### Команда в админке

- Раздел «Люди и доступ → Команда»: должности, отделы и свои должности — каталоги с созданием,
  правкой и удалением; видно, у скольких игроков запись. «Роли» и «Permissions» — вкладки одного
  пункта «Роли и права».

### Награды в админке

- «Геймификация → Достижения и награды»: вкладка «Награды» — каталог, создание и правка, удаление;
  видно, у скольких игроков награда.

### Достижения в админке

- В админке появился раздел «Геймификация → Достижения»: каталог, создание и правка, удаление
  и пересчёт прогресса всех игроков; повторный пересчёт, пока идёт первый, не запускается.

### Уведомление о достижении

- При получении достижения приходит уведомление «Новое достижение» со ссылкой
  на его карточку.

### Витрина достижений

- В настройках появилась «Витрина»: выберите до 10 полученных достижений и их
  порядок — они показываются в профиле.

### Обращения в админке: архив и модерация сообщений

- Архив обращений, закреп и скрытие сообщений, запрет новых обращений автору —
  прямо из карточки обращения.

### Чат в админке

- Модераторы видят действующие муты и баны общего чата, снимают их и ищут
  сообщения в админке.

### Серверы в админке

- Администрация добавляет, меняет и удаляет игровые серверы в админке и смотрит
  журнал их статусов.

### Приватность в админке

- Админ-списки новостей, событий, форм и заказов больше не передают лишние данные
  аккаунтов (IP входа, служебные поля); почта покупателя остаётся только в заказах.

### Приватность в модерации чата

- Модераторы чата больше не получают почту и IP игроков в списках мутов, банов и
  поиске сообщений.

### Статус серверов

- Статус серверов обновляется раз в 30 секунд вместо опроса игрового сервера на
  каждое открытие страницы — сайт и сервер выдерживают наплыв посетителей.
  Виджет статуса для форумов защищён от HTML в названии сервера.

### Достижения

- Новые страницы «Достижения»: категории, редкость, прогресс и полученные
  достижения. Достижения игрока теперь видят его друзья при профиле «для друзей»,
  а заблокированные — нет.

### Обращения в админке

- Администрация разбирает обращения в админке: очередь с фильтрами, переписка,
  заметки, назначение, статус, решение и блокировка ответов. Модераторы больше
  не получают почту и IP авторов обращений.

### Рейтинги

- Новая страница «Рейтинги»: время в игре, убийства, монеты, достижения и
  покупки. Игроки, скрывшие статистику или профиль, в рейтинги не попадают.

### Поисковики и соцсети

- Описание и ключевые слова сайта берутся из настроек администрации; у ссылок на
  twomc.su появилась картинка-превью; поисковики получают карту сайта, а личные
  разделы закрыты от индексации.

### Настройки сайта

- Лимит аккаунтов в настройках сайта теперь действительно закрывает регистрацию,
  а «Уведомления по умолчанию» определяют письма и push у новых аккаунтов.
  Неработающий переключатель «Требуется одобрение» убран.

### Страницы ошибок

- Понятные страницы «Страница не найдена» и «Что-то пошло не так» в стиле сайта
  вместо стандартных экранов.

### Безопасность сообщений

- Личные сообщения и общий чат ограничивают частоту отправки, правок и «печатает…»
  в реальном времени. Выключенные личные сообщения закрыты и для мгновенной
  отправки.

### Формы

- Новые страницы «Формы»: анкеты и заявки с черновиками, автозаполнением почты,
  пошаговым заполнением и формами по приглашению; «Мои ответы».
- Администрация больше не видит почту и IP авторов ответов, а у анонимных форм —
  и самого автора. Лимиты ответов нельзя обойти одновременной отправкой.

### Голосование

- Новая страница «Голосование»: сайты-рейтинги, награда в монетах и таймер до
  следующего голоса. Один голос больше не может принести награду дважды.

### Обращения

- Новые страницы «Обращения»: жалоба на игрока или администрацию, обжалование
  наказания, техническая проблема и «Другое»; список своих обращений и
  переписка с администрацией с правкой своих сообщений. Для обращений, кроме
  жалоб, указывать нарушителя больше не нужно.

### Безопасность обращений

- Внутренние заметки администрации к обращению больше не видны его автору.

### События

- Новые страницы «События» и события: запись «Пойду» / «Интересно», «Мои
  события», карточки на главной открывают событие. На прошедшее событие
  записаться нельзя.

### Новости

- Новые страницы «Новости» и статьи: категории, лайки, комментарии с реакциями,
  «поделиться» и RSS. Карточки новостей на главной открывают статью.

### Правила и документы

- Карточки правил открывают полный текст; появились страницы «Информация» и
  «Частые вопросы».
- Юридические документы показывают опубликованный текст и дату редакции, а до
  публикации — честную пометку «Документ готовится».

### Исправления

- В новостях и событиях снова видны аватары авторов.

### Лента активности

- Новая страница «Лента» и блок «Активность» в профиле: записи о дружбе,
  реакции и комментарии.
- В «Приватности» можно скрыть записи о новых дружбах или выбрать, кто их видит.
- Активность игрока со скрытым профилем больше не видна посторонним.

### Общий чат

- Кнопка чата открывает общий чат: каналы, история, закреплённое сообщение и
  число людей в канале. Гости читают, писать можно после входа.
- Защита от флуда: не больше 5 сообщений за 10 секунд.
- Когда чат выключен администрацией или идут техработы, подключиться к нему
  нельзя.

### Личные сообщения

- Открыт раздел «Сообщения»: личные беседы и группы, реакции, правка и
  удаление своих сообщений, «печатает…», приглашения в группу по ссылке.
- На профиле игрока — кнопка «Написать».
- Добавить в группу можно только тех, кто принимает от вас личные сообщения;
  после блокировки писать нельзя; текст удалённых сообщений больше не виден.

### Комментарии в профиле

- В профиле игрока можно оставлять комментарии (по настройкам владельца),
  ставить реакции, править и удалять свои, жаловаться на чужие. Владелец может
  убирать комментарии со своей страницы.
- Комментарии скрытого профиля больше не видны посторонним, а заблокированный
  игрок не может писать в профиль.

### Уведомления

- В «Настройки → Уведомления» можно выбрать, какие уведомления получать, включить
  письма и прислать себе сводку непрочитанных, подключить свой канал Discord и
  сбросить настройки.
- Уведомления в Discord больше не могут случайно пинговать @everyone, а письма —
  содержать чужую HTML-разметку.

### Двухфакторная аутентификация

- В «Настройки → Безопасность» можно включить вход с кодом из приложения на
  телефоне (Google Authenticator, Aegis и др.): QR-код, ручной ключ и 10
  резервных кодов на случай потери телефона.
- При включённой защите после пароля — и после входа через Discord или
  Telegram — сайт попросит код.
- Администрация может требовать двухфакторную защиту для всех, у кого есть
  права в админке.

### Друзья

- Новая страница «Друзья»: друзья, входящие и исходящие заявки,
  заблокированные игроки.
- На профиле игрока — «В друзья», «Отменить заявку», «Принять» и
  «Заблокировать»; удаление из друзей и блокировка — с подтверждением.
- В меню профиля пункт «Друзья» показывает число новых заявок.
- Списки друзей и заявок показывают только ник и аватар игрока, без личных
  данных; ответная блокировка больше не снимает чужую.

### Безопасность данных

- Публичные страницы и ответы API (новости, события, комментарии, чат, лента
  активности, личные сообщения) больше не передают email, IP входа и другие
  личные данные авторов — только ник, тег и аватар.

### Профиль игрока

- Закрытый настройками приватности профиль показывает «Профиль скрыт», а не
  «не найден»; «не найден» — только если такого игрока нет.
- На чужом профиле можно пожаловаться: кнопка с флажком на обложке, окно с
  причиной и описанием. Жалобы видят только модераторы.
- В превью профиля появилась кнопка «Открыть профиль».
- Старые ссылки вида `/users/<ник>` открывают профиль на новом сайте.

### Безопасность аккаунта

- В «Настройки → Безопасность» отмечено «Это устройство»; его нельзя случайно
  завершить отсюда. Новая кнопка «Завершить все остальные».
- После смены пароля остальные устройства разлогиниваются, текущее остаётся.
- Если пароль нужно сменить обязательно, сайт сразу открывает страницу смены
  пароля с пояснением.

### Безопасность и мелкие исправления

- API и обновления в реальном времени принимают запросы только с официальных
  адресов сайта из явного списка.
- На узких телефонах (360 px) шапка больше не выходит за край экрана.

### Мелкие исправления интерфейса

- На странице «Уведомления» у последнего уведомления больше нет квадратных углов
  за скруглённой рамкой; подсветка при наведении — на всей строке.
- Вместо серых подсказок браузера — подсказки в стиле сайта (логотипы оплаты,
  админка), длинная должность в превью профиля видна целиком.

### Переход на внешний сайт

- В окне «Вы переходите на внешний сайт» теперь видна иконка сайта: у Discord,
  Telegram, VK, Steam, Twitch, YouTube, TikTok, GitHub — официальная, у других
  сайтов — их собственная иконка, а если её нет — значок глобуса.

### Привязанные аккаунты — ссылки и новые карточки

- Привязанный Discord в профиле теперь ведёт на ваш профиль в Discord;
  «Скопировать имя» осталось рядом. Telegram без публичного ника — без ссылки.
- «Настройки → Связанные аккаунты» переделаны: у каждого сервиса своя карточка с
  аватаром, статусом и действиями «Открыть профиль», «Показывать в профиле»,
  «Отвязать». Если привязку не удалось начать — карточка показывает причину и
  «Повторить».

### Публичный профиль

- «О себе» — только ваш текст, с оформлением: **жирный**, _курсив_,
  ~~зачёркнутый~~, `код`, ссылки, списки и цитаты. HTML и картинки не
  поддерживаются — профиль нельзя «сломать».
- Новый блок «Информация»: город, день рождения, пол (с иконкой) и дата
  регистрации — без повторов.
- День рождения снова виден другим, если вы его не скрыли; год — только по
  вашему выбору.
- В блоке «Игрок» — «Награды и значки»: ваши награды, выставленные достижения и
  значки с подсказками. Пока наград нет — блок честно об этом говорит.
- Кнопка «Редактировать» реагирует спокойнее, без вращения. На своём профиле
  оценки недоступны — с подсказкой «Нельзя оценить собственный профиль».

### Профиль и mini profile — identity

- Префикс и ник теперь всегда в одной строке: `[ПРЕФИКС] ник`. Подсказка роли
  появляется прямо над префиксом.
- У каждого игрока — публичный номер из четырёх цифр: `younaxo_#0002`.
- Mini profile стал компактнее: одна строка `[префикс] ник#0000`, присутствие,
  баланс и рубины. Без статуса, внутреннего номера и повторов ника; префикс
  заметно меньше и остаётся чётким.
- Сезонное украшение шапки видно и над профилем, и над mini profile.
- «Выйти» — только после подтверждения «Выйти из аккаунта?» (на сайте и в
  админке).

### Ассеты TwoMC

- Реальные скриншоты сервера теперь загружаются с CDN twomc.su.
- В mini profile рядом с «Баланс» — монета, рядом с «Рубины» — рубин: официальные
  иконки из ресурспака TwoMC, чёткие, без размытия.
- Медиа-партнёры получают свой префикс у ника (YouTube, Twitch, TikTok или общий
  «Медиа»). У ника всегда один префикс: роль команды важнее медиа.
- Design Lab: медиа- и донат-префиксы, приоритет префикса, иконки валют.

### Уведомления

- Системные уведомления о новых сообщениях, когда вкладка TwoMC в фоне или
  браузер свёрнут (в Windows — в центре уведомлений). Клик открывает уже
  открытую вкладку сайта.
- Когда сайт открыт — уведомление внутри сайта и короткий тихий звук; если
  нужный диалог уже открыт — только тихий звук. Одно событие не приходит
  дважды разными способами.
- Разрешение браузера спрашивается только по кнопке «Разрешить» в подсказке у
  колокольчика; «Не сейчас» — подсказка не появится 14 дней. Если
  уведомления заблокированы — инструкция «Как включить».
- «Настройки → Уведомления»: уведомления на этом устройстве, сообщения, звук,
  предпросмотр текста в уведомлении (выключен — только «Новое сообщение») и
  список устройств.
- При выходе из аккаунта этот браузер перестаёт получать уведомления.

### Привязанные аккаунты

- Discord, Telegram, VK и Steam — в одном списке «Связанные аккаунты».
  Привязать VK и Steam пока нельзя — помечено «Скоро».
- Для каждого привязанного сервиса — переключатель «Показывать в профиле».
- VK и Steam больше нельзя указать вручную в соцсетях — только привязкой.

### Профиль и mini profile

- В шапке профиля: «Редактировать» — слева сверху, просмотры и оценки —
  одним блоком справа сверху; под ником — префикс роли, статус и бейджи.
- Статус виден сразу после сохранения и теперь показывается и в mini profile.
- Привязанный Telegram — ссылка на профиль в Telegram; у Discord — кнопка
  «Скопировать имя».
- В mini profile: маленький префикс роли, «Баланс» и «Рубины» (реальный
  кошелёк), «Админ-панель» — отдельным блоком; «Выйти» — внизу.
- Окна уведомлений и профиля больше не наезжают на кнопки чата и корзины.
- Кнопки при загрузке не добавляют второй значок — двигается их собственная
  иконка, кнопка не меняет размер.

### Design Lab

- Новые разделы с production-компонентами: шапка публичного профиля (свой и
  чужой), 3D-голова скина, просмотры и оценки, привязанные аккаунты и соцсети,
  mini profile, баннеры и бейджи; spotlight регистрации (запускается вживую),
  поля кодов Minecraft во всех состояниях, «Забыли пароль?» по e-mail и по нику;
  украшение шапки ON/OFF и ошибка ассета, независимые сезон и падающий эффект
  (та же рамка, что в админке), красные звёзды Дня Победы.
- На 375 px и 768 px страница больше не прокручивается вбок.

### Регистрация и восстановление пароля

- При входе в регистрацию появляется подсказка у кнопки «Как
  зарегистрироваться» — можно открыть инструкцию или нажать «Мне понятно».
- Новые форматы кодов Minecraft: код привязки `XXX-000-X0X0-0X0` (16 символов)
  и код подтверждения `X0XX0`; поле кода само ставит дефисы и принимает
  вставку.
- Пароль можно восстановить по нику: покажем подсказку адреса
  (`y***o@i*****.com`), ссылку пришлём после ввода полного e-mail. Для
  привязанных Discord и Telegram — пометка «Скоро».
- «← Вернуться ко входу» — со стрелкой.

### Профиль игрока

- Профиль открывается и по нику Minecraft-привязки, и по алиасу входа.
- Рядом с аватаром — объёмная голова скина Minecraft; при наведении она
  поворачивается.
- Кнопка редактирования своего профиля — маленькая круглая в правом верхнем
  углу.
- Просмотры профиля (свои не считаются) и оценки «нравится / не нравится».
- Привязанные Discord и Telegram показываются отдельно от соцсетей; в
  соцсети добавлены GitHub и свой сайт.

### Сезонное оформление

- Падающий эффект настраивается отдельно от сезона: «по сезону», «всегда»
  (даже без праздника) или «выключен»; плотность и скорость. Можно оставить
  сезонное оформление без падающих элементов.
- Украшение шапки на Хэллоуин снова видно в тёмной теме: тёмные силуэты
  летучих мышей и пауков теперь окрашиваются под тему.
- На День Победы падают небольшие красные пятиконечные звёзды.
- На телефонах падающих элементов меньше, на экранах 120 Гц они больше не
  летят вдвое быстрее.
- Предпросмотр в админке: любую кампанию и падающий эффект можно посмотреть,
  не включая сезон на сайте; если картинка украшения шапки не загрузилась,
  предпросмотр показывает это и адрес файла.

### 3D-скин в профиле

- На странице игрока появился 3D-скин Minecraft: персонажа можно вращать мышью
  или пальцем и приближать; есть плащ, если он есть у игрока, и спокойная
  анимация (отключается настройкой «уменьшить движение»).
- Если у ника нет лицензионного скина, страница так и говорит; на слабых
  устройствах 3D включается кнопкой.

### Профиль

- Аватар и баннер теперь видны везде: в шапке сайта, в превью профиля по нику,
  на странице профиля, в настройках, в рейтингах и в админке.
- Меню профиля стало мини-профилем: баннер, аватар, ник, ID, роль, бейджи и
  украшение, статус в игре, друзья, достижения и время в игре; затем разделы
  аккаунта. На телефоне открывается снизу.
- Загруженный аватар больше не выглядит «пиксельным» при уменьшении.

### Вход и регистрация

- Кнопки входа через Discord и Telegram больше не пропадают: если вход через
  сервис временно недоступен, кнопка остаётся на месте с пояснением, а при
  сбое проверки появляется «Повторить».
- «Подтвердить почту» становится доступной только после обоих обязательных
  согласий; строка о политике конфиденциальности — в том же блоке документов.
- Подсказка «Как зарегистрироваться» сама открывается только в регистрации и
  один раз; на странице входа — нет. Её можно открыть кнопкой в любой момент.
- Подсказка переработана: широкое окно со скриншотом и инструкцией рядом,
  переход на любой из 6 шагов кликом по полоске сверху, кнопки видео YouTube и
  RuTube (пока видео нет — «Видео готовится»).
- Новое поле кода из письма: шесть отдельных ячеек, вставка всего кода,
  стрелки и Backspace, без стрелок браузера.
- Числовые поля в админке больше не показывают стрелки браузера.
- Кнопка «Статус серверов» ведёт на страницу статуса сайта, пока отдельная
  страница status.twomc.su не запущена.

### Медиа-бейдж

- В настройках появился раздел «Медиа»: заявка на бейдж создателя контента
  (YouTube, Twitch, TikTok) и история заявок с решением модерации.

### Мои наказания

- В настройках появился раздел «Наказания»: предупреждения, муты и баны с
  причиной, сервером и сроком; видно, что действует сейчас.

### Приватность профиля

- Профиль с настройкой «только друзья» теперь виден друзьям (раньше он
  скрывался от всех).
- Если игрок заблокировал вас или вы его, его профиль и карточка превью для
  вас скрыты.

### Настройки аккаунта

- В меню профиля заработал пункт «Настройки»: можно загрузить аватар и баннер,
  заполнить «о себе», страну, город, пол и дату рождения, указать соцсети.
- Раздел «Приватность»: кто видит профиль, кто может добавить в друзья, писать
  и комментировать; что скрыть в профиле и о чём уведомлять.
- Публичный профиль игрока `/u/ник`: баннер, аватар, статус, «о себе», город и
  соцсети — с учётом настроек приватности; в меню профиля заработал пункт
  «Профиль».
- Раздел «Безопасность»: смена пароля и список устройств, где выполнен вход, —
  можно завершить отдельную сессию или выйти на всех устройствах сразу.
- Дату рождения теперь можно очистить (раньше пустое значение сохранялось как
  1 января 1970 года).

### Работа без связи

- Если пропал интернет или сервер twomc.su не отвечает, внизу экрана
  появляется подсказка: сайт сам повторяет попытку, а уже открытое остаётся на
  месте. Когда связь возвращается, данные обновляются сами.
- Без интернета вместо ошибки браузера открывается страница «Нет подключения»
  с кнопкой «Повторить».
- Если не загрузилась только часть страницы, остальное продолжает работать,
  а у неудавшегося блока есть своя кнопка «Повторить».

### Флаги языков

- Флаги в переключателе языка теперь нарисованы и выглядят одинаково на всех
  устройствах: на Windows вместо флага больше не показываются буквы «GB».

### Хранилище и журналы

- В админке «Система → Хранилище и журналы» видно, сколько места занимают
  служебные журналы, и задаётся срок их хранения: 7–365 дней или «не удалять».
- Очистку можно запустить вручную: перед удалением показывается, сколько
  записей будет удалено, и требуется подтверждение. Каждая очистка записывается
  в журнал аудита.
- Журналы аудита и безопасности очищаются только с отдельным правом. Данные
  игроков (профили, сообщения, заказы, уведомления) не удаляются никогда.

### Админка: понятная навигация и состояние проекта

- Меню админки разбито на группы: люди и доступ, контент, финансы,
  коммуникации, оформление, система, безопасность, аудит.
- На главной админки видно состояние проекта: текущий сезон, технические
  работы, выключенные модули, активные объявления и работа базы данных. Там же —
  быстрые действия: создать объявление, написать системное сообщение, включить
  техработы.
- Сезонное оформление переехало в отдельный раздел «Оформление».

### Технические работы и модули сайта

- Если раздел выключен или на нём идут технические работы, вместо ошибки
  показывается понятное сообщение: что происходит и когда ожидается окончание.
- Во время полных технических работ сайт показывает экран техработ; вход и
  админка продолжают работать.
- Администрация включает и выключает отдельные модули (магазин, чат, новости и
  другие) и закрывает на работы весь сайт или его часть — с подтверждением и
  записью в журнал. Приём платежей во время работ не прерывается.

### Объявления

- Под шапкой сайта появляются объявления: обновления, события, предупреждения,
  технические работы. Если объявление можно закрыть, его можно скрыть.
- Администрация создаёт объявления черновиком, выбирает, где их показывать (на
  сайте, в уведомлениях, на главной админки) и кому (всем, вошедшим, роли), и
  задаёт период показа. Уведомление об объявлении приходит один раз — когда
  начинается показ.

### Системные сообщения от twomc.su

- Администрация может написать игроку личное системное сообщение от имени
  twomc.su или сделать рассылку: всем, обладателям роли или выбранным игрокам.
  Перед массовой отправкой показывается точное число получателей и нужно
  подтверждение.
- Такие сообщения отмечены «twomc.su · Системное», их нельзя подделать, и они
  приходят, даже если системные уведомления отключены. На странице уведомлений
  есть фильтр «От twomc.su».

### Сезонное оформление из админки

- В «Настройки → Сезоны» можно включить или выключить сезоны целиком, выбрать
  сезон принудительно, отключить отдельные элементы (буква «o», декор шапки,
  эффекты, баннеры), задать даты и время кампаний (в своём часовом поясе) и
  выбрать для каждой кампании свои эффекты — например, листья и дождь осенью.
- Предпросмотр любой кампании до публикации: компьютер или телефон, тёмная или
  светлая тема.
- Сезонные эффекты: снег, сердечки, листья, лепестки, солнечные блики — не
  мешают кликам, останавливаются в фоновой вкладке, упрощаются на слабых
  устройствах и отключаются при настройке «уменьшить движение».
- Сезон определяется по времени сервера, а не по часам на компьютере игрока.

### Админка: острова и графики

- Боковое меню и шапка админки — аккуратные «острова» без рамок.
- На главной админки — графики регистраций, жалоб и действий за 7/30/90 дней;
  в финансах — график выручки по дням. Только реальные данные.

### Своё контекстное меню

- Правая кнопка мыши открывает меню twomc.su по месту клика: для текста, ссылок,
  игроков, товаров и страницы (назад, обновить, копировать адрес); Shift+ПКМ и
  поля ввода — системное меню.
- Кнопки и подписи не выделяются случайно; картинки товаров и аватары нельзя
  перетащить.

### Календарь: быстрый выбор месяца и года

- Нажатие на заголовок календаря открывает выбор месяца, затем года — без
  долгого листания по месяцам.

### Свой курсор

- Курсор в стиле twomc.su для мыши: обычный, ссылка/кнопка, текст, перетаскивание
  и «недоступно»; на телефонах и планшетах — системный.

### Уведомления: действия и мгновенное обновление

- Страница «Уведомления» (все / непрочитанные, «Показать ещё») — раньше ссылка
  вела на несуществующую страницу.
- Отметить прочитанным или непрочитанным, удалить, «Прочитать все», «Удалить
  прочитанные», «Очистить все» (с подтверждением); те же действия по правой кнопке.
- Счётчик (1–99, «99+») одинаковый в колокольчике, вкладке и иконке сайта и
  обновляется сразу во всех открытых вкладках.

### Превью профиля по нику

- Наведение (desktop) или нажатие (телефон) на ник открывает карточку игрока:
  роль, должность, онлайн или последняя активность, статистика (если не скрыта),
  друзья и достижения — только реальные данные; скрытый профиль так и показан.
- Длинные ники и префиксы ролей больше не ломают строки; закрытые профили
  больше не раскрывают достижения.

### Tutorial регистрации, привязка Minecraft, аккуратнее auth и модули

- Поверх входа и регистрации — пошаговое обучение из 6 этапов (скриншоты,
  команда `/site-connect` с копированием, видео YouTube/RuTube, когда будут ссылки).
- Регистрация с привязкой Minecraft: `/site-connect` в игре → ссылка → код из
  15 символов на сайте → код из 5 символов в игре → аккаунт; продолжение после
  перезагрузки страницы без потери шага (ADR-0072).
- Страница ссылки `/site-connect/…` с одноразовым кодом и копированием.
- Регистрация помещается в экран без прокрутки, без пустот между полями;
  «Политика конфиденциальности» — в группе согласий; правая панель аккуратнее.
- Модули по всему сайту больше не «обведены»: тени без рамок и верхней кромки.

### Единая auth-панель, Telegram OpenID Connect, экран результата соцвхода

- Вход, регистрация, восстановление и сброс пароля — одна широкая панель:
  логотип, переключатель «Вход | Регистрация» без перезагрузки, форма слева и
  визуал проекта с живым онлайном справа; на mobile — компактный баннер (ADR-0071).
- Регистрация: после отправки кода поля остаются видны и заблокированы, код и
  таймер повторной отправки — ниже, кнопка ведёт по шагам до «Создать аккаунт».
- Недоступные кнопки, поля, переключатели и ссылки показывают курсор
  недоступности.
- Telegram-вход переведён с устаревшего виджета на OpenID Connect (PKCE,
  проверка id_token по JWKS); Discord и Telegram — кнопки одной геометрии.
- После Discord/Telegram — экран результата: «Успешно!», «Аккаунт не привязан»,
  «Вход отменён», «Уже подключено», «Не удалось подключить…» — без технических
  деталей и токенов в адресе.
- Design-lab: раздел «Auth» на production-компонентах.

### Регистрация с подтверждением почты

- Регистрация на одной странице: e-mail, ник, пароль и повтор, необязательный
  реферальный код, Turnstile, два отдельных согласия → «Подтвердить почту» →
  6-значный код из письма → «Создать аккаунт» и сразу вход (ADR-0070).
- Код: вставка целиком, только цифры, автофокус и возврат фокуса после ошибки,
  Backspace одним нажатием, «Отправить повторно через N с», «Изменить E-mail»,
  понятные сообщения (неверный код с числом попыток, истёк, лимиты).
- Backend: `/auth/register/{start,verify,resend,complete}`, код хранится только
  как HMAC, пароль приходит лишь на последнем шаге; согласия сохраняются
  отдельными записями; у каждого пользователя есть реферальный код (= ник).
- Страницы `/legal/*` (соглашение, конфиденциальность, персональные данные,
  cookie, возвраты, юридическая информация), ссылки футера ведут на них.

### Вход через Discord и Telegram, связанные аккаунты

- Кнопки «Продолжить через Discord / Telegram» на странице входа — только для
  аккаунтов, заранее привязанных в профиле; без привязки — понятное объяснение,
  новый аккаунт не создаётся (ADR-0069).
- «Настройки → Связанные аккаунты»: подключить/отключить Discord и Telegram
  (с подтверждением), статус, ник, время привязки и последнего входа.
- Backend: подписанный state + nonce-cookie для Discord OAuth, проверка подписи
  Telegram, audit привязки/отвязки.

### Плашка из шапки, массовые права ролей, единые таблицы и окна, юр. данные

- Верхняя плашка — продолжение шапки (HeaderStack), режимы «Обводка»/«Заливка»,
  плотный фон, расписание, свой SVG (проверка на сервере, показ как `<img>`);
  управление — «Объявления → Верхняя плашка», редактор с живым предпросмотром
  (Desktop/Mobile, Dark/Light) и сводкой состояния.
- Массовое изменение прав ролей: добавить/убрать/заменить, предпросмотр по
  ролям, защита ролей и иерархии, одна транзакция, audit (ADR-0068).
- Все таблицы админки — общий DataGrid; выбор строк — круглый индикатор.
- Общие окна: структура шапка/тело/футер, без рамки, крестик-ghost; диалог
  «Добавить соцсеть» переработан. Поля, Select, подписи и Segmented Control —
  мягче и компактнее по всей админке.
- Сезонная «o» заметнее (размер по варианту wordmark), не увеличивает строку.
- Владелец: Кирилл Алексеевич Баранов, ИНН 230815487140, самозанятый (НПД).
  Status page — https://status.twomc.su. SMTP отправителя — `MAIL_FROM`.
- Design-lab: логотип/wordmark (базовая и сезонная «o»), плашка outline/filled,
  production-диалог.

### Глобальная плашка, соцсети списком, настройки без пустот

- Глобальная плашка под шапкой (ADR-0066): текст, иконка из набора, стиль,
  ссылка; включается в админке с предпросмотром, не закрывается пользователем;
  права `settings.alert.*`, audit.
- Соцсети проекта — расширяемый список с пресетами платформ (добавлен TikTok,
  Twitch, Instagram, X, Facebook), порядок, скрытие, проверка домена (ADR-0067);
  футер/rail/«Сообщество» берут ссылки из него.
- Настройки: вкладки «Общие / Соцсети / Модерация / Модули / Плашка», острова по
  высоте содержимого + колонка сводки; экран модерации с живой очередью;
  из формы убраны название, описание, e-mail, логотип, favicon.
- Префикс роли в сайдбаре и меню аккаунта больше не съедает ник (`UserIdentity`);
  chevron профиля в админке поворачивается при открытии.

### Вход по alias, уровень доступа, бренд, таблицы, Select, Checkbox, диалоги, тема

- Вход `younaxo` → аккаунт `younaxo_` через точечный alias (ADR-0061); у всех
  остальных логин = ник, модель User не менялась.
- Уровень доступа пользователя (ADR-0062): title админки `twomc.su | A [N]` /
  `(N) twomc.su | A [N]`, просмотр и изменение в карточке пользователя (permission,
  иерархия, audit). Нельзя снять с себя роль с полным доступом.
- `<BrandWordmark/>`: базовая «o» и своя «o» у сезона (Halloween), основной логотип
  сезонами не меняется (ADR-0065); логотип в hero больше не «мылится» (q=90, без
  CSS-фильтров, размер = фактическому); Halloween-декор — с cdn-files.twomc.su.
- Админка: логотип + wordmark в сайдбаре; DataGrid — описание над таблицей,
  footer с разделителем и мобильной раскладкой; «Строк на странице» — Radix
  Select; выбор строк — общий Checkbox (без нативных чекбоксов).
- Select/Dropdown/Popover/Tooltip — на шкале z-index, без рамок; выбранный пункт —
  оранжевый с галочкой. Диалоги — тёмный scrim, крестик, Esc и клик вне окна
  (ADR-0064). Chevron у кнопки профиля в шапке и админке.
- Тема по умолчанию — как в системе (System/Dark/Light), без вспышки (ADR-0063).

### Auth, Turnstile, внешние ссылки, бейдж вкладки, мобильная навигация

- Переработаны вход, регистрация, «Забыли пароль?», сброс пароля (`AuthShell`).
- Cloudflare Turnstile вместо hCaptcha: backend Siteverify, `<Turnstile />` на всех
  auth-формах, тестовые ключи для dev (ADR-0059).
- External Link Modal для сторонних сайтов с allowlist доменов проекта (ADR-0060).
- Title вкладки `twomc.su` / `(N) twomc.su`, favicon с красным бейджем unread;
  исправлен артефакт favicon (PNG-ссылка указывала на ICO).
- Главная: «Недавно купили» над магазином (ник маскируется на backend), события
  после магазина, промокод START, версии 1.21.4 — 1.21.11 в hero.
- Header и Sidebar без рамки, footer прижат к низу (скругление сверху), все пять
  соцсетей официальными SVG, Tooltip без обводки, Chat/Cart — обычные кнопки.
- Плавающая мобильная навигация, сезонный декор Halloween над шапкой.
- `next.config` подхватывает `NEXT_PUBLIC_*` из корневого `.env`.

### Главная страница и оболочка v2 (PHASE 31, часть 1)

- Главная: hero (онлайн/статус/IP/версии по реальному ping, копирование адреса),
  showcase возможностей (1 крупная + 3), сервера (одна большая карточка при одном
  сервере), «Сейчас на twomc.su» (активный/следующий ивент с обратным отсчётом),
  магазин 3–5 позиций, «Последнее на twomc.su» с вкладками, быстрый старт,
  сообщество, финальный CTA. Без данных — skeleton/empty state, fake-данных нет.
- Header и footer — отдельные плавающие solid-поверхности (отступы, `rounded-xl`,
  тень, без backdrop-filter). Футер: дисклеймер Mojang AB со ссылкой, поддержка
  (support@/admin@/Telegram), юр. данные владельца, «Политика Mojang AB»,
  язык + валюта как независимые настройки (`lib/site/preferences.ts`).
- Chat/Cart — edge-peek у правой границы (desktop), dock на mobile.
- Логотипы оплаты из SVG владельца (SVGO, viewBox/title сохранены); favicon,
  apple-touch-icon и PWA-манифест из официального логотипа.
- Строка «New-Era Anarchy» убрана из UI и metadata.
- ColorPicker: первопричина «не открывается» — z-index popover не выше модалки;
  шкала `dropdown/popover = 55`; тест внутри Dialog.
- `GET /servers/overview`: `type/description/iconUrl/address/configuredVersion`.

### Bootstrap-аккаунты (PHASE 32, ADR-0006)

- Seed создаёт #0 SYSTEM / #1 Owner / #2 Chief Curator только из
  `BOOTSTRAP_*` env; SYSTEM не может войти по паролю; sequence shortId выравнивается.

### Security

- Prisma `omit: { user: { password: true } }` глобально (ADR-0057): хеш пароля
  больше не утекает через `include: { author/user: true }` в публичных ответах.

### Глобальная оболочка twomc.su (App Shell)

- `components/shell/*`: фиксированный icon-only rail (общий онлайн по реальному ping,
  навигация из `lib/site/config.ts`, бонусы, соцсети, язык/валюта), header (логотип с CDN,
  twomc.su, навигация, уведомления, профиль), информационный footer (владелец из env,
  e-mail/соцсети из `GET /site/settings`, ссылки игрокам, правовые документы «скоро»,
  язык, статус серверов, тема, версия, способы оплаты), плавающие действия (корзина в
  /shop*, чат «скоро»), мобильная нижняя навигация; `app/(site)` с /shop, /rules,
  /servers, /status. Публичный `GET /site/settings`. Z-index шкала. Бренд в UI — twomc.su.
- Встроенный `ColorPicker` без системного color dialog: пресеты, HEX, палитра
  (область + оттенок), bottom sheet на mobile; используется в форме роли.
- Тесты: shell (8), ColorPicker (7). Секции Global shell и ColorPicker в /design-lab.

### CDN / файловое хранилище (PHASE 23)

- `modules/files`: StorageService (local → `/uploads`, s3 за CDN_BASE_URL), пресеты
  загрузок по типу с permission, pipeline magic-bytes → sharp → AVIF, модель File
  TEMP/ATTACHED/DELETED, orphan cleanup, `POST /files/upload`,
  `POST|DELETE /users/me/avatar|banner`. E2E `files` (6).

### Audit log (PHASE 22)

- Глобальный `AuditInterceptor`: все успешные staff-мутации с `@RequirePermissions`
  пишутся в audit log (действие = ключ permission, цель, очищенные изменения,
  IP/UA/длительность, уровень по ключу); `@SkipAudit()` для ручных записей.
- `AUDIT_RETENTION_DAYS` и ежедневная очистка в 04:00; `AuditModule` глобальный.

### Production infrastructure (PHASE 35)

- `infrastructure/api.Dockerfile`, `web.Dockerfile` (standalone), `docker-compose.prod.yml`,
  `deploy.sh` с prisma migrate deploy и автоматическим rollback, пример nginx,
  `.dockerignore`, `robots.txt` (закрыты /admin и /design-lab).

### Admin panel и тема «Полдень» (PHASE 21, часть 3)

- Решение владельца: «Полдень» — единственная система, тёмная тема основная,
  светлая вторичная, стекло запрещено (ADR-0055). Архивные направления
  удалены; `ThemeProvider` + `ThemeToggle`, no-flash inline-скрипт.
- Шрифты Onest / Literata / JetBrains Mono self-hosted (fontsource) — сборка
  без обращения к Google Fonts.
- `/login`, защищённая зона `/admin/*` (RequireAuth, permission-driven
  сайдбар и палитра Ctrl+K, меню аккаунта с префиксом роли), экраны:
  дашборд, пользователи (список, bulk бан/разбан, карточка: роли/эффективные
  права/бейджи/наказания/сессии), роли (список, создание, редактирование,
  матрица permissions, история), permissions, журнал аудита (+QuickView,
  CSV), безопасность (сессии/входы/подозрительные IP/whitelist), настройки
  (сайт + KV), объявления, контент, финансы (обзор/транзакции/возвраты),
  экспорт CSV, личные инструменты (закладки/фильтры/расписания).
- Overlay-компоненты переведены на solid-поверхности без backdrop-blur.
- Ops-скрипт `apps/api/scripts/grant-role.ts` для первичной выдачи роли.

### Design system и /design-lab (PHASE 21, дизайн)

- Семантические design-токены (`apps/web/src/styles/tokens.css`) с тремя
  кандидатами направления (`data-direction=ember|daylight|signal`, темы) и
  Tailwind-маппингом — компоненты не знают hex (ADR-0053).
- TwoMC UI-слой `components/ui` (~60 примитивов поверх radix-ui/vaul/sonner/
  cmdk/lucide): floating (Tooltip simple/rich/shortcut/help/validation,
  Toggletip, Hint, Popover, HoverCard, DropdownMenu, ContextMenu), overlays
  (Dialog, AlertDialog/ConfirmDialog, Sheet, Drawer/BottomSheet/ActionSheet,
  QuickView, FloatingPanel, DynamicIsland, Command/⌘K, toast/snackbar),
  формы (Button, Input, Field, Select, Checkbox, RadioGroup/RadioCards,
  Switch, Slider, SegmentedControl, Tabs, Accordion, NumberStepper/Steps,
  OtpInput, Combobox, MultiSelect, DatePicker, FileDropzone, ColorPicker),
  данные (Table, DataGrid, Pagination, TreeView, Resizable, AnimatedCounter,
  Marquee, Carousel, FloatingDock, Lightbox, Wizard, MegaMenu, Badge/
  StatusBadge, Avatar/AvatarStack, Skeleton, Progress/ProgressRing,
  EmptyState, ErrorState/ForbiddenState, Breadcrumbs, Timeline, Kbd, Card).
- `/design-lab` (internal, 404 в production без флага): карточка
  направления, витрины «Раскалённое»/«Полдень»/«Пульт» на одном наборе
  элементов, Interactions / Component lab, секция Role prefixes;
  critique и рекомендация — `docs/design/DESIGN-CRITIQUE.md`, контракт —
  `docs/design/VISUAL-DIRECTION.md`.
- Графические префиксы ролей (ADR-0054): реестр 29 PNG по `Role.slug` в
  `packages/shared`, `NEXT_PUBLIC_CDN_BASE_URL`, `RolePrefix`/
  `UserRolesInline`, выбор основной роли по priority — только
  визуализация, права решает backend.
- 40 новых unit-тестов (примитивы, префиксы ролей), заглушки browser API
  для Radix в jsdom.

### Frontend foundation (PHASE 21, часть 1)

- `packages/shared` — API-контракт frontend ↔ backend (ADR-0051): типы
  ответов/запросов auth/users/roles/moderation/admin (dashboard, audit log,
  broadcast, settings, saved-filters/bookmarks/scheduled-exports, security,
  content/finance, orders, CSV-экспорт), `Paginated<T>`, `ApiErrorBody`;
  реестр permission keys (`PERMISSIONS`, `PermissionKey`) перенесён сюда из
  seed api — один источник для обеих сторон.
- `apps/web` — fetch-клиент (`Bearer` из памяти, `credentials: include`,
  401 → single-flight refresh → один повтор, `ApiError`/`NetworkError`,
  скачивание CSV), auth-store (Zustand: bootstrap по refresh-cookie,
  login с обработкой `requiresCaptcha`, logout, истёкшая сессия),
  permission-хелперы (`PermissionRequirement`, superuser-wildcard —
  только для UX, авторизация остаётся на backend), TanStack Query
  (QueryClient без retry на 4xx, фабрика ключей), Vitest + Testing Library
  — 21 unit-тест (ADR-0052).
- `GET /auth/me` отдаёт `roles[]` и `permissions` (effective permissions из
  `PermissionService`, `maxPriority: null` без ролей) — покрыто e2e.
- `nest build` больше не компилирует `prisma/seed` — `dist/main.js` снова в
  корне `dist/`, `start:prod` работает.

### Infrastructure

- Инициализирован pnpm monorepo: `apps/api` (NestJS 10), `apps/web` (Next.js 14 +
  Tailwind CSS), `packages/shared` (`@twomc/shared`).
- Единые команды из корня: `lint`, `format`, `format:check`, `typecheck`, `test`,
  `build`, `dev` — все проверки зелёные.
- CI (GitHub Actions): lint/format/typecheck/test/build, CodeQL, gitleaks,
  actionlint, dependabot.
- `infrastructure/docker-compose.yml`: Postgres 16 + Redis 7 с healthcheck —
  проверено реальным запуском (`pnpm db:up`), оба сервиса `healthy`.

### Database

- Prisma-схема (`apps/api/prisma/schema.prisma`): 108 моделей, 53 enum, первая
  миграция (`20261004115235_init`) применена к реальной БД (проверено: 109
  таблиц, включая `_prisma_migrations`).
- `PrismaModule`/`PrismaService`, `GET /health` (реальная проверка БД через
  Prisma), `ConfigModule` с валидацией env (`DATABASE_URL`, `API_PORT`,
  `NODE_ENV`).

### Authentication

- `POST /auth/register|login|refresh|logout`, `GET/DELETE /auth/sessions`,
  `DELETE /auth/sessions/:id`, `POST /auth/change-password`, `GET /auth/me`,
  `POST /auth/forgot-password|reset-password`.
- JWT access-token (15 мин, payload только `sub`), refresh-token с ротацией и
  reuse detection (повторное использование отозванного токена → отзыв всех
  сессий пользователя). Бан блокирует доступ и refresh немедленно.
- Brute-force (Redis, по IP): captcha после 3 неудачных попыток, блокировка
  на 15 минут (429) после 10.
- `RedisService`, `EmailService` (SMTP, опционально — без `SMTP_HOST` письма
  только логируются).
- helmet, cookie-parser, глобальный `ValidationPipe`, CORS, `ThrottlerModule`
  (100/60с глобально, 10/мин на login).

### RBAC

- `PermissionService` (effective permissions, superuser, priority-иерархия,
  Redis-кеш `perm:user:{id}` с немедленной инвалидацией), `PermissionsGuard`,
  `@RequirePermissions(...)`.
- `GET/POST /admin/roles`, `GET/PATCH/DELETE /admin/roles/:id`,
  `PUT /admin/roles/:id/permissions`, `GET /admin/roles/:id/history`,
  `GET /admin/permissions`, `POST/DELETE /admin/users/:id/roles/:roleId`,
  `GET /admin/users/:id/effective-permissions`.
- Seed: 3 superuser-роли (`Owner`, `Chief Curator`, `Chief Developer`), 7
  permission keys модуля `roles`.

### Users

- Позиции (`/positions`, `/positions/manage`, CRUD + assign), отделы
  (`/admin/departments`, CRUD + assign/reorder), кастомные должности
  (`/admin/custom-positions`, CRUD + assign 1:1), админский список и карточка
  пользователя (`/admin/users`, `/admin/users/:id/full`).
- Seed: базовая позиция `Default` — без неё регистрация не работала на
  чистой БД.

### Profiles

- `GET /users/:username/public` (фильтрация по приватности),
  `GET/PATCH /users/me/profile`, соцсети (`/users/me/social-links`),
  выбор декорации (`/users/me/decoration`, только из принадлежащих).

### Social system

- Друзья: заявки/принятие/отклонение/отмена, список/блокировка,
  `friendRequestPolicy` (включая `FRIENDS_OF_FRIENDS`).
- Комментарии профиля: создание/редактирование/soft-delete, реакции
  (свободный emoji), жалобы; учитывают `commentsEnabled`/`commentPolicy`.
- Лента активности: глобальная (`PUBLIC`) и персональная (с учётом
  `FRIENDS`/`PRIVATE`), реакции и комментарии к активности, персональные
  настройки (`ActivityFeedSettings`). Принятие заявки в друзья создаёт первую
  реальную запись активности (`FRIENDSHIP_STARTED`).

### Direct Messages

- Личные и групповые беседы (`/messages/conversations/*`), идемпотентное
  создание личной беседы (`directKey`), сообщения (отправка/редактирование/
  soft-delete/реакции с несколькими emoji на пользователя), `markRead` с
  unread count, выход из беседы, инвайты в группы (код/`maxUses`/`expiresAt`).
  `directMessagePolicy` (`EVERYONE`/`FRIENDS`/`FRIENDS_OF_FRIENDS`/`NOBODY`)
  соблюдается полностью.
- `DirectMessagesGateway` (Socket.IO, namespace `/messages`): auto-join комнат
  участника при подключении, `conversation:join/leave`, `message:send`
  (ack + broadcast), `message:edit/delete/react` → `message:updated`,
  `conversation:read` → receipt, `typing:start/stop`. Аутентификация — через
  Socket.IO namespace-middleware (не `handleConnection`) — иначе возможна
  гонка между подключением и первым событием клиента (поймано e2e-тестом).
- `ConfigurableIoAdapter`: CORS для всех WS namespace настраивается централизованно
  через `ConfigService`, а не статической опцией в `@WebSocketGateway` —
  устраняет для всего приложения проблему старого проекта (S11:
  `/messages` с `cors.origin=true`).

### Chat

- Публичный `/chat/*` (список каналов, история, онлайн, закреплённые) и
  `/admin/chat/*` под permissions (CRUD каналов, мут/бан листинг-снятие,
  поиск по сообщениям). Отправка сообщений — только через WebSocket.
- `ChatGateway` (Socket.IO, namespace `/chat`): `join/leave_channel` с
  presence в Redis, `send/edit/delete_message`, `typing_start/stop`,
  `pin_message`, `mute_user`/`ban_user` — публично без причины, причина и
  детали уходят только в личную комнату цели (в отличие от старого проекта,
  S12). Чат-бан проверяется при подключении и блокирует весь namespace.

### Notifications

- `/notifications/*` (список/unread-count/read/read-all/remove, settings,
  push subscribe/unsubscribe, личный Discord-вебхук, digest test) и
  `/admin/notifications/*` (CRUD системных Discord-вебхуков, broadcast,
  stats) под permissions.
- `NotificationsGateway` (Socket.IO, namespace `/notifications`, только
  server→client): `notification:new` в реальном времени.
- Email (PHASE 05) и push (`web-push`, молча выключается без VAPID-ключей)
  каналы доставки с учётом `quietHours`/`digestMode`; личный и системные
  Discord-вебхуки с allowlist домена против SSRF.
- Реальная межмодульная интеграция: друзья, комментарии профиля, комментарии
  активности (новые типы `ACTIVITY_COMMENT`/`ACTIVITY_COMMENT_MENTION`),
  личные сообщения и упоминания в чате теперь создают уведомления через
  единую точку `NotificationsService.create()`.

### News

- Публичный `/news/*` (список/featured/latest/popular/categories/tags/RSS/
  деталь по slug с подсчётом просмотров/like/комментарии с toggle-реакциями)
  и `/admin/news/*` (CRUD с тегами, архивация вместо hard delete, pin/
  feature, статистика) под permissions; `/moderation/news/comments/*`
  (pin/delete чужого комментария).
- Лайк и ответ/упоминание в комментарии создают `NEWS_LIKED`/
  `NEWS_COMMENT_REPLY`/`NEWS_COMMENT_MENTION` через `NotificationsService`.

### Events / Topics / Voting / Streaming

- `/events/*` (список/featured/mine/деталь, attendance с лимитом участников
  и дедлайном регистрации) и `/admin/events/*` (CRUD, publish/cancel) под
  permissions; изменение расписания/отмена опубликованного события создаёт
  `EVENT_UPDATED` участникам.
- `/topics/*` (список/деталь с фильтрацией по видимости через permission-
  ключи) и `/admin/topics/*` (CRUD, reorder, pin) под permissions.
- `/voting` (публичный обзор vote-сайтов с cooldown для viewer) и
  `/voting/webhook/:slug` (публичный, bcrypt-секрет вместо HMAC) с
  начислением `rewardCoins` в `PlayerStatistics.coins`; `/admin/voting/
sites/*` (CRUD, rotate-secret) под permissions.
- `/streams` (публичный список каналов) и `/admin/streams/*` (CRUD,
  refresh — честно сообщает об отсутствии Twitch/YouTube credentials) под
  permissions.

### Forms

- `/forms/*` (список опубликованных форм с учётом видимости, мои формы/
  мои ответы, автоподстановка username/email, доступ по коду приглашения,
  деталь по slug, отправка ответа, сохранение черновика) и `/admin/forms/*`
  (CRUD с вложенными полями, publish/close/duplicate, список/деталь/
  удаление ответов, статистика, CRUD приглашений) под 14 permission-ключами.
- Конструктор форм — 33 типа полей (`FormFieldType`), валидация и хранение
  диспетчеризируются по типу: RADIO/SELECT/CHECKBOX проверяются против
  `options`, NUMBER/RATING/CURRENCY_AMOUNT — против min/max, AGREEMENT_
  CHECKLIST обязан быть `true`, NEWS_REFERENCE/TOPIC_REFERENCE/
  FRIENDS_SELECTOR проверяются реальной референциальной валидацией
  (существование/публикация/дружба).
- Приём ответов учитывает публикацию/видимость (включая `INVITE_ONLY` по
  коду приглашения)/окно приёма/лимит ответов/`onePerUser`/hCaptcha;
  `ipHash` (SHA-256, не сырой IP) для анти-спам аналитики.

### Reports / Moderation

- `/moderation/users/:userId/mute|warn|kick|ban` (quick moderation —
  создают `UserPunishment`; `kick` разрывает refresh-сессии, `ban`
  дополнительно выставляет `User.isBanned` с мгновенным эффектом на каждый
  запрос), `/moderation/messages/:messageId/hard-delete` (ChatMessage),
  `/moderation/comments/:commentId/hard-delete` (ProfileComment, каскадно
  удаляет ответы), `DELETE /admin/users/:userId` (удаление аккаунта с
  понятной ошибкой при FK-конфликте) под permissions.
- `/admin/comment-reports`, `/admin/profile-reports` — список и
  рассмотрение жалоб на комментарии профиля/профили; создание жалобы на
  профиль (`POST /users/:username/report`) добавлено в `profiles`.
- Тикет-система обращений (`/reports/*`, `/moderation/reports/*`,
  `/admin/reports/*`, `/support/donation-problem`, `/admin/support/
donations`): создание с резолвом целей по username, переписка автора/
  staff, assign/status/verdict, заметки модератора (скрыты от автора),
  lock/unlock, архив (отдельный от удаления), `ReportBan` (бан в
  тикет-системе, независим от `User.isBanned`).
- История наказаний (`UserPunishment`): `/users/me/punishments`, `/admin/
users/:username/punishments` (список), `/admin/users/:userId/
punishments` (выдача/редактирование) под `users.punishments`.
- `users.change_role` не перенесён — заменён существующими `/admin/
users/:userId/roles/:roleId` (PHASE 06, many-to-many RBAC); game-report/
  game-punishment эндпоинты (внешняя интеграция с анти-чит плагинами) не
  реализованы — не описаны требованиями (NOT_APPLICABLE с PHASE 00).

### Store

- Каталог: `/store/categories` (дерево), `/store/products` (+варианты
  цен по длительности, «часто покупают вместе» — реальная аналитика по
  завершённым заказам, `inWishlist` для viewer), `/store/bundles` (наборы
  с окном действия) под публичными GET и admin CRUD (`store.*`
  permissions).
- Скидки/промокоды/валюты: `BulkDiscount` (по товару/типу+количеству/
  сумме) и `LoyaltyDiscount` (по числу завершённых заказов) — публичные
  списки + admin CRUD; `PromoCode` — публичная валидация, применение
  через корзину, admin CRUD; `CurrencyRate` — admin CRUD + публичный
  калькулятор обмена (без баланса — ADR-0035).
- `PricingService` — единая точка пересчёта стоимости (bulk → loyalty →
  promo, последовательно от остатка — ADR-0036), используется и
  корзиной, и оформлением заказа — итог всегда пересчитывается сервером.
- `/store/cart/*` — получение/добавление/изменение/удаление позиции,
  очистка, применение/снятие промокода, пересчёт с превью; подарок товара
  проверяет `isGiftable`/`isSelfOnly`. `/store/wishlist/*` — список,
  видимость, публичная страница, «подарить из списка желаний».
- `/store/orders/*` (оформление из корзины, список/деталь своих заказов),
  `/store/quick-buy` (всегда анонимный, `guestMinecraftNick` — ADR-0038),
  `/store/recent-purchases` (публичная лента), `/admin/orders/*`
  (список/статистика/отмена/возврат).
- `PaymentProvider`/`TestPaymentProvider`/`PaymentProviderRegistry` —
  заказ подтверждается только вебхуком (`POST /webhooks/payments/
:provider`, секрет в теле, constant-time, идемпотентно — ADR-0034);
  `isUnique`-товары проверяются при оформлении заказа (ADR-0037); тестовый
  провайдер не регистрируется в production (RISKS.md R2).
- `/admin/store/stats/*` — overview/sales-by-day/sales-by-category/
  top-products/revenue-by-week, реальная SQL-агрегация.
- `mock-complete` не перенесён (решение зафиксировано ещё в PHASE 00,
  ADR-0009); доставка на игровой сервер (`gameCommands`) — не предусмотрена
  текущей схемой (ADR-0041, уточнение ADR-0039).

### Minecraft servers

- `modules/minecraft/slp/` — реальный клиент Server List Ping (TCP,
  без внешних ключей): `varint.ts` + `slp-client.ts` (handshake → status
  request → JSON-ответ → ping/pong для задержки). Недоступность сервера —
  честный `{online: false}`, не исключение и не моковые данные (ADR-0040).
- `/server-categories`, `/admin/server-categories/*` — плоский список с
  `order`, нельзя удалить категорию с серверами.
- `/servers/*` (публичный): список активных, `overview` (реальный
  параллельный опрос всех серверов), `widget` (HTML-фрагмент), деталь,
  `status`/`players`/`history` (живой опрос + лог `ServerStatusLog`).
  `/admin/servers/*` — CRUD + пагинированная история статуса.
- Опрос — на каждый запрос, без фонового cron (нет background-job
  инфраструктуры — PHASE 29). RCON/доставка игровых команд не
  предусмотрены схемой `Server` (нет поля для RCON-пароля) — окончательно
  закрывает вопрос доставки `Product.gameCommands` из Store (ADR-0041).
  `AuditLog` не подключается точечно — сквозной механизм для всего
  проекта будет в PHASE 22 (ADR-0042).
- 9 новых permission-ключей (`server_categories.*`, `servers.*`).

### Gamification

- `modules/achievements/` — `AchievementProgressService` реально считает
  прогресс по 17 из 19 `AchievementConditionType` из текущих данных БД
  (друзья/комментарии/реакции/заказы/подарки/жалобы/бейджи/возраст
  аккаунта и т.д.); пересчёт — явный `POST /admin/achievements/
check-all-users` (пакетная модель, ADR-0043), не событийный. Публичный
  `/achievements/*` (список с прогрессом viewer'а, секретные скрыты до
  разблокировки, деталь, stats), admin CRUD + check-all-users, ручная
  выдача/отзыв модератором (единственный путь для MANUAL/CUSTOM условий),
  `/users/me/achievements` + `/users/:username/achievements` + витрина
  (showcase, до 10 завершённых достижений). `rewardBadgeType` реально
  выдаёт `UserBadge`; `rewardRubies` не зачисляется — нет кошелька
  премиум-валюты (ADR-0045); `DAYS_STREAK`/`PROFILE_VIEWS` не продвигаются
  автоматически — нет персистентного счётчика (ADR-0044).
- `modules/awards/` — декоративные награды: публичный список, admin CRUD,
  выдача/отзыв пользователю.
- Бейджи (`/admin/users/:userId/badges`) и заявки на бейдж создателя
  контента (`/users/me/media-request(s)`, `/admin/media-requests`) —
  одобрение реально создаёт `UserMediaBadge`.
- `modules/leaderboards/` — `GET /leaderboards`, 5 реальных рейтингов
  (playtime/kills/coins из `PlayerStatistics`, achievements, purchases) —
  без выдуманных метрик (ADR-0046).
- Попутно: `SERVER_SELECTOR` в Forms (PHASE 15) получил реальную
  referential-проверку теперь, когда модель `Server` (PHASE 18) появилась.
- 15 новых permission-ключей (`achievements.*`, `awards.*`,
  `media_requests.*`, `users.achievements`/`.achievements.grant`/
  `.awards`/`.badges`).

### Admin backend

- `modules/admin/` — `/admin/dashboard` (реальные агрегаты: пользователи
  online/забанены/новые сегодня, pending-жалобы, последние 10 записей
  audit log), `/admin/audit-log` + `/audit-log/stats` (`AuditService`:
  запись не гарантирована для info/warning, падает для critical, 90 дней
  retention — `cleanupOld()` реализован, периодический вызов PHASE 29),
  `/admin/broadcast` (реальная рассылка `Announcement` + fan-out
  `Notification` по `targetRole`), KV- (`/admin/settings`) и
  структурированные (`/admin/settings/site`, singleton) настройки сайта.
- Персональные (per-admin) saved-filters/bookmarks (+ reorder)/
  scheduled-exports — полный CRUD; фактическое выполнение экспортов по
  расписанию — PHASE 29 (нет cron-инфраструктуры).
- Security: `/admin/security/sessions`/`logins` — реальные
  `RefreshToken`; `/admin/security/suspicious` — реальное чтение Redis
  brute-force счётчиков через `SCAN`; `/admin/security/ip-whitelist` —
  пишет в `SiteSettings.ipWhitelist`.
- `/admin/content/dashboard` (News/Form/жалобы/пользователи) и
  `/admin/finance/overview|transactions|refunds|export` — overview и
  export делегируют в уже существующие `StoreStatsService`/
  `OrdersService` (PHASE 17), не дублируют агрегацию заказов.
- `PATCH /admin/users/bulk` (BAN/UNBAN) — первое место в проекте, где
  массовое действие над пользователями проверяет priority-иерархию через
  `PermissionService.canActOn`, с отдельной audit-записью на каждого
  пользователя; один отклонённый/упавший target не валит весь batch.
  `QuickModerationService.unban()` — новый account-level метод,
  симметричный `ban()` (PHASE 16).
- `ExportController` — CSV напрямую в HTTP-ответ (без файлового
  хранилища, PHASE 23) для users/orders/reports/news/audit-log,
  hand-rolled RFC4180-сериализатор.
- 35 новых permission-ключей (`dashboard.*`, `audit_log.*`,
  `broadcast.create`, `settings.*`, `saved_filters.*`, `bookmarks.*`,
  `exports.scheduled.*`, `security.*`, `content.view`, `finance.*`,
  `users.bulk.edit`, `users.export`, `orders.export`, `reports.export`,
  `news.export`).

## 2026-11-17 — Исправления по ревью Q25 (ADR-0171)

- e2e `chat.e2e-spec.ts`: иерархия снятия мута и бана (старший/равный/младший); написаны статически, не запускались.
- `PermissionService.getEffectivePermissions`: при чтении из кеша `maxPriority` null восстанавливается в `-Infinity` (R39); unit-тесты кеш-пути.
- ADR-0171 дополнен: самоснятие владельцем, момент сравнения приоритетов.

## 2026-11-17 — Q26 и Q27: REPORT_STATUS_CHANGED и права заметок обращений (ADR-0172)

- Новый тип уведомления `REPORT_STATUS_CHANGED` (миграция `20261017000000_report_status_changed`, `ADD VALUE`, не применялась): `changeStatus` шлёт его вместо `REPORT_VERDICT`; `setVerdict` без изменений.
- Новые права `reports.notes.edit` (правка чужих заметок, раньше `reports.delete`) и `reports.notes.unpin` (открепление, раньше `reports.notes.pin`); закрепление остаётся `reports.notes.pin`. Каталог `packages/shared/src/permissions.ts`, API, web.
- e2e `reports-support.e2e-spec.ts` обновлён статически, не запускался. ADR-0172, R40.
- Для владельца: применить миграцию на production и выдать права ролям (`docs/runbooks/production-env-checklist.md`).

## 2026-11-17 — Q48 и Q49: единое правило снятия санкции для всех путей (ADR-0173)

- `PermissionService.canRevokeSanction(actorId, issuerId, targetUserId?)` и `assertCanRevokeSanction`: владелец всегда (в т.ч. с себя); неизвестный выдавший — только владелец; с себя чужую санкцию не-владелец снять не может; выдавший может; иначе приоритет действующего не ниже приоритета выдавшего. Отказ — 403 `sanction_revoke_forbidden`.
- Применено к мутам и банам чата, бану аккаунта, массовому снятию (`PATCH /admin/users/bulk`, `UNBAN`; отказ в `failed` с `code`) и бану в обращениях (для каждого активного бана, «всё или ничего»). Закрыт R38.
- Миграция `20261117000000_user_banned_by` (`users.bannedById TEXT NULL`, без FK и индекса, не применялась). Старые баны без выдавшего снимает только владелец.
- Аудит на каждое снятие (`chat.mute.revoke`, `chat.ban.revoke`, `user.unban`, `reports.ban.revoke`) с `issuerId`, `ownerOverride`, `self`; `@SkipAudit()` на трёх хендлерах против дублей.
- Тесты: unit api 517 в 53 наборах, PASS; e2e `unban-hierarchy.e2e-spec.ts` написан статически, не запускался. Новые риски R41-R43.

## 2026-11-17 — Этап 04, срез 2: ядро инвентаря на сайте (ADR-0179, ветка feature/stage-04-s2-inventory, не смержено, миграция не применена, e2e не запускалась)

- Модели `PlayerInventory` (последнее состояние на пользователя, сервер и группу `main`/`ender`) и `InventoryPrivacy`; миграция `20261117030000_inventory_core` (только добавление, написана вручную, ждёт ревью Q28, на БД не применялась).
- Модуль `apps/api/src/modules/inventory`: нормализация предметов (лимит 600 байт, Q35 а), безопасный текст (Q38 а), применение снимков и дельт (приёмника Bridge пока нет), чтение своего инвентаря, приватность по умолчанию «приватно» (Q34 а), очистка 90 суток (Q36 а, выключена), точка расширения донат-прав (`default`), fail-closed guard `BRIDGE_ENABLED`.
- API: `GET /inventory/me`, `GET|PATCH /inventory/me/privacy`; без `BRIDGE_ENABLED=true` ответ 503 `inventory_unavailable`.
- Контракт: `packages/shared/src/api/inventory.ts` и локальное зеркало в `apps/api`. Сборщик частей снимка (Lua-атомарность, ADR-0179 п. 9-12) и заголовок частей (ADR-0179, риск R101).
- Проверки: `tsc --noEmit` api и shared 0 ошибок; jest `--runInBand src/modules/inventory src/modules/punishments src/modules/roles` 34 набора passed, 1 skipped, 979 тестов passed, 6 skipped (проверка 2026-11-17; модуль inventory отдельно: 242 passed, 6 skipped, redis-набор без `INVENTORY_REDIS_TEST_URL` пропускается; прежние числа раунда 1 - 10 наборов, 199 тестов - устарели); eslint и prettier на изменённых файлах чисто. Lua-тест на реальном Redis 7 запущен 2026-11-17: 6/6 (+2 юнит-регресса, 8/8) (R93). e2e `apps/api/test/inventory.e2e-spec.ts`, миграция на БД и полный jest не запускались.
- Риски R70–R79 (срез 2), R93–R99 и R101 (сборщик и заголовок частей). Отчёт: `docs/reports/2026-11-17-04-s2-inventory-core.md`.
