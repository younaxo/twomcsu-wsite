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
