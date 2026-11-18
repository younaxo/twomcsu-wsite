# 0.3, шаг 1: API админки товаров (2026-11-18)

Ветка `feature/l0-03-admin-products-api` (поверх cd6f639). Миграций, seed, package.json, lockfile, workflows нет.

## Что сделано

- `CreateProductDto`/`UpdateProductDto`: `gameCommands` удалено из DTO. Глобальный `ValidationPipe` (whitelist + forbidNonWhitelisted) отвечает 400 «property gameCommands should not exist». Значения в БД не трогаются (проверено e2e).
- `CreateProductDto`: `isActive` удалено; новый товар всегда создаётся `isActive=false` (ADR-0185 п. 6), включается отдельным PATCH. Добавлено поле `order` (порядок) в создание и правку.
- Картинки (S2): `image`/`images` (до 10) — только https, без логина и порта, хост из `cdn-files.twomc.su`, `mc-heads.net`, `minotar.net` (ровно remotePatterns из `apps/web/next.config.mjs`). Разбор через `URL`, не regex (`...twomc.su.evil.com`, `...@evil.com` отклоняются). Файл `product-image-url.ts`.
- Цена: `price`/`oldPrice` варианта — строка Decimal `^\d{1,8}(\.\d{1,2})?$` (`dto/price-string.ts`); число (float) и 3 знака — 400. В БД Decimal(10,2), без изменений.
- Активация (ADR-0185 п. 2): PATCH `isActive=true` для типа вне списка — 422 `PRODUCT_TYPE_NOT_SELLABLE`. Список — константа `DEFAULT_SELLABLE_TYPES` (`sellable-types.ts`): PRIVILEGE, KEY, UNMUTE, UNBAN, CURRENCY, BATTLE_PASS. TODO(0.11): читать из настройки `store.sellableTypes`.
- Аудит (`AuditService.log`, поверх общего `AuditInterceptor`, который пишет только тело запроса): `store.product.created` (info), `activation_changed` (warning, from/to), `variant_price_changed` (warning, цена и oldPrice было → стало, нормализованные "100.00"; без события при той же цене), `variant_created`, `variant_activation_changed`, `deleted`, `deactivated_instead_of_delete`, `variant_deleted`, `variant_deactivated_instead_of_delete`. targetType `store.product`. Секретов нет.
- Удаление: товар/вариант с заказами (`OrderItem`) — деактивация вместо удаления (ответ `{success:true, mode:'deactivated'}`), иначе жёсткое (`mode:'deleted'`) в транзакции с очисткой строк корзин и списков желаний. Товар в наборе — 409 `PRODUCT_IN_BUNDLE`. До правки жёсткое удаление товара с заказами молча обнуляло `OrderItem.productId` (SET NULL), а товар из набора/желаний давал 500 по FK.
- Права и 2FA: `PermissionsGuard` уже стоит на контроллере, он же применяет admin-2FA (ADR-0109/0169); не менялся. e2e: 401/403 для всех мутаций без права и с одним `store.products.view`.

## Проверки

- `tsc --noEmit` apps/api: чисто; eslint по store и двум e2e: чисто.
- Jest `src/modules/store`: 8 suites, 109 tests passed (из них новые: `product-admin-validation.spec.ts`, `products.service.spec.ts`).
- e2e (одноразовая БД, e2e-guarded.sh, логи `scratchpad/logs-03-a/summary.txt`): store-admin-products 9/9, store-catalog 8/8, store-cart 38/38, store-checkout 19/19.

## Допущения

1. Поля архива нет, миграция запрещена: «архив» = `isActive=false`; DELETE товара с заказами не отвечает 409, а деактивирует (200, `mode:'deactivated'`). Если нужен именно 409 — меняется одной строкой.
2. Тип `BUNDLE` в закрытый список не включён (в ADR-0185 его нет).
3. Только https: локальный драйвер хранилища отдаёт `http://localhost:4000/uploads/...`, такая картинка в dev отклоняется (и next/image её бы не показал: хоста нет в remotePatterns). Для dev нужна отдельная договорённость.
4. `mc-heads.net` и `minotar.net` разрешены для картинок товара только ради согласования с remotePatterns; если это лишнее — убрать из `PRODUCT_IMAGE_HOSTS`.
5. Цена 0 по-прежнему допустима (как раньше, `Min(0)`).
6. Критичность: цена и активность — `warning` (не `critical`, чтобы сбой записи не ломал уже совершённое изменение).

## Риски

- Breaking для клиентов API: цена строкой (число — 400), `isActive` и `gameCommands` в POST — 400, `gameCommands` в PATCH — 400. Известных клиентов в репозитории нет (веб-админки товаров пока нет); `store-catalog.e2e-spec.ts` обновлён.
- Проверка `sellableTypes` при корзине/оформлении/quick-buy (ADR-0185 Р1) НЕ входит в этот шаг; товар вне списка, ставший активным в обход (БД), по-прежнему продаётся. Скрипт деактивации легаси-товаров — отдельно (0.11, на одноразовой БД).
- Аудит-события пишутся после изменения (не атомарно); при сбое записи warning/info изменение остаётся без события.
- Категории (`categories-admin`) не менялись: валидации URL картинки категории и аудита там нет.

## К переносу

В основной ветке после слияния: (1) обновить `docs/technical/API-REFERENCE` по админке товаров (Decimal-строки, `mode` в DELETE, 422/409-коды, новые action аудита); (2) при появлении настройки `store.sellableTypes` заменить `DEFAULT_SELLABLE_TYPES` (TODO(0.11)); (3) решить Р1: серверная проверка типа в корзине/заказе; (4) `packages/shared`: типы DTO цены уже `DecimalString`, правок не потребовалось; (5) шаг 2 (UI админки) должен слать цену строкой и не слать `isActive`/`gameCommands` при создании, и показывать `mode` после удаления.

## Правки по независимому ревью (дополнительный коммит)

- Medium-1: `remove` и `removeVariant` — проверки заказов/наборов и удаление в одной интерактивной транзакции; перед проверками блокируется строка (`SELECT ... FOR UPDATE` по `products`/`product_variants`). Вставка `OrderItem` по FK берёт `FOR KEY SHARE` и ждёт конца транзакции, поэтому параллельный заказ не может «обнулить» `productId`/`variantId` через SET NULL. Аудит пишется после коммита.
- Medium-2: `removeVariant` проверяет `BundleItem.variantId` (FK нет) — 409 `VARIANT_IN_BUNDLE`; юнит и e2e.
- Low-1: e2e прав `store.products.variants` / `store.products.delete` (403 без права, успех с правом; два отдельных пользователя) и `admin_2fa_required` для мутаций товаров/вариантов — в `two-factor.e2e-spec.ts` (флаг `requireAdmin2fa` глобальный, набор идёт отдельно и по очереди).
- Low-2: e2e на 409 `PRODUCT_IN_BUNDLE` (реальный набор в БД).
- Проверки: tsc apps/api чисто; eslint по 4 файлам чисто; Jest `src/modules/store` 8 suites, 112 tests; e2e (одноразовая БД) store-admin-products 11/11, two-factor 7/7.

### Допущения и долг после ревью

1. Low-3 и Info не сделаны: `oldPrice: null` (сброс старой цены) и очистка `image` через `null` в DTO типизированы как `string`; сделать явную семантику null (тип `string | null`, e2e) — отдельной правкой вместе с UI админки (шаг 2).
2. Блокировка `FOR UPDATE` берётся по строке товара/варианта; создание заказа, которое уже держит `KEY SHARE`, заставит удаление подождать (короткая задержка, без дедлока: порядок блокировок единый).
3. `VARIANT_IN_BUNDLE` — по образцу `PRODUCT_IN_BUNDLE`; деактивация варианта с набором не выполняется (только 409), как и для товара без заказов.

### К переносу (дополнение)

В API-REFERENCE добавить код 409 `VARIANT_IN_BUNDLE` для DELETE варианта и пояснение про атомарность проверок.

## Ревью Q&S и доработки

Независимое ревью Q&S принято с замечаниями; закрыты A1–A4 и A6.

- **A1 (обязательно). Решение: запись аудита в той же транзакции, строгий режим, без миграции.** В `AuditLogInput` добавлены необязательные `tx` (транзакционный клиент; `AuditService.log` пишет через него) и `strict` (ошибка записи не глотается при любой severity). `ProductsService.update` (смена активности), `updateVariant` (цена/oldPrice/активность), `remove` и `removeVariant` (удаление и деактивация вместо удаления) теперь выполняют изменение и аудит внутри одной `$transaction` с `tx` и `strict`. Сбой записи аудита откатывает изменение — тихой потери нет. Почему не severity=critical: она меняет смысл события в журнале («критично» на каждую правку цены) и не откатывает уже выполненное изменение, т.к. запись шла вне транзакции; кроме того, аудит после коммита оставлял окно «цена изменена, а события нет». Побочно: аудит активации/удаления больше не пишется для откатившихся операций. Обычные вызовы `log()` без `tx`/`strict` работают как раньше. Тесты: юнит `audit.service.spec.ts` (3), `products.service.spec.ts` (+4: strict+tx, отказ аудита => ошибка для updateVariant/update/remove); e2e `store-admin-products`: при сбое `AuditService.log` PATCH цены даёт 5xx, цена в БД остаётся `100.00`.
- **A2.** `image` и `icon` в `CreateCategoryDto`/`UpdateCategoryDto` проверяются `IsProductImageUrl` (https + белый список хостов). Допущение: `icon` категории — URL картинки (в схеме `String?`, Lucide-имён в данных не найдено); если нужны имена иконок — смягчить правилом владельца.
- **A3.** `CategoriesService.remove`: проверки и удаление в одной транзакции под `SELECT ... FOR UPDATE` по `categories` (параллельное создание подкатегории/товара не потеряет родителя через SET NULL); при детях/товарах — 409 `CATEGORY_HAS_CHILDREN` / `CATEGORY_HAS_PRODUCTS` вместо 400. Обновлён e2e `store-catalog` (400 -> 409).
- **A4.** `two-factor.e2e-spec.ts`: добавлены `PATCH /variants/:id` и все 4 эндпоинта категорий (list/create/patch/delete) в проверку `admin_2fa_required`; категория не создаётся.
- **A6.** Добавлены `normalizeProductImageUrl` и `@NormalizeProductImageUrl()` (class-transformer; `ValidationPipe` с `transform: true`): в БД сохраняется `url.href` (регистр хоста, кодирование пути); невалидное значение возвращается как есть и отклоняется валидатором. Применено к `image`/`images` товара и `image`/`icon` категории. Юнит-тесты на нормализацию и DTO категорий.
- Проверки: tsc apps/api чисто; Jest `src/modules/store src/modules/audit` — 9 suites, 123 tests; e2e (одноразовая БД, один прогон): store-admin-products 13/13, two-factor 7/7, store-catalog 8/8.
- Риски: (1) `update`/`updateVariant` теперь в транзакции — при недоступности таблицы аудита правка цены даёт 500 (осознанно); (2) смена 400 -> 409 на удалении категории — UI шага 2 должен обрабатывать 409; (3) нормализация меняет вид сохранённых ссылок только у новых/изменяемых записей, старые не трогаются; (4) AuditInterceptor продолжает писать общее событие вне транзакции (best-effort) — это дополнение, а не замена; (5) миграций нет.

## Исправление CI PR #181: 2FA персонала в e2e

- Причина: после Q22 2FA персонала обязательна всегда, `PermissionsGuard` отдаёт 403 `admin_2fa_required` пользователю с правами и `twoFactorEnabled=false`. Тестовые сотрудники в `store-admin-products.e2e-spec.ts` создавались без этого флага, 13 тестов получали 403 вместо 200/201/400.
- Исправление: в `createStaff` после выдачи роли и прав вызывается `markStaffTwoFactorEnabled(prisma, user.id)` (хелпер `apps/api/test/helpers/staff-two-factor.ts` из main). Логика проверок не менялась. `store-catalog` и `two-factor` уже используют хелпер.
- Проверки (одноразовая БД `twomc_e2e`, на ветке с main): store-admin-products 13/13, store-catalog 8/8, store-cart 38/38, two-factor 7/7. Полный юнит-набор `jest --runInBand` в apps/api: 1972 passed, 6 skipped, 0 failed, 1978 total (112 suites passed, 1 skipped).
- Примечание: перед прогоном потребовался `prisma generate` (сгенерированный клиент в общем node_modules был устаревшим относительно схемы с `bannedById`); миграций и изменений схемы нет.
