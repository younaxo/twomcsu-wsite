# Магазин: публичные ответы по белому списку полей (S1, S3)

## 1. Итог и статус

Публичные ответы каталога, наборов, списка желаний и заказов покупателя больше не отдают служебные поля товара; bought-together для скрытого товара даёт 404. Статус: DONE.

## 2. Что сделано

1. S1. Новый файл apps/api/src/modules/store/public-product.ts с явными select-ами. products.service.ts (list, getBySlug, getBoughtTogether) переведён с include на select.
2. Белый список товара: id, name, slug, description, fullDescription, type, image, images, isGiftable, isSelfOnly, isUnique, isSeasonalOnly, maxPerPurchase, isFeatured, isNew, isPopular; category (id, name, slug, description, icon, image, parentId); variants только активные (id, duration, price, oldPrice, isActive); inWishlist в деталях. Список сверен с StoreProduct в apps/web/src/lib/store/catalog.ts (ветка витрины).
3. Запрещены всегда: gameCommands, server, currencyType, currencyAmount, positionId, decorationId, createdAt, updatedAt, order, isActive (у товара), productId/служебные связи.
4. Другие эндпоинты, которые отдавали те же поля (исправлены в этом же срезе):
   - GET /store/bundles и /store/bundles/:slug: items.product был `product: true`.
   - GET /store/wishlist, публичный список желаний по нику (доступен анониму) и giftItem: товар целиком.
   - Заказы покупателя (создание, quick-buy для гостя, listMine, getByOrderNumber): product и variant целиком, а giftToUser: true отдавал строку пользователя-получателя (email и прочее; хеш пароля скрыт глобально). Теперь giftToUser только PUBLIC_USER_SELECT (ADR-0107).
   - Корзина не затронута: уже использует узкий select.
5. Админские эндпоинты не менялись. Админский список заказов сохранил прежний include (ADMIN_ORDER_INCLUDE, поведение не изменено).
6. S3. getBoughtTogether: исходный товар отсутствует или неактивен: одинаковый 404 «Товар не найден».
7. Тип PublicProductDto и PublicProductVariantDto добавлены в packages/shared/src/api/site.ts (добавочно, существующие типы не менялись).
8. Тесты: apps/api/src/modules/store/public-product.spec.ts (8 тестов структуры select и поведения) и дополнение apps/api/test/store-catalog.e2e-spec.ts (товар создаётся с gameCommands и server, в ответах списка, деталей, bought-together и набора они отсутствуют; 404 для несуществующего bought-together).

## 3. Git

Ветка fix/store-public-product-fields от origin/main 4a7e6f0. Коммит кода: 12e4999. Коммит отчёта: см. HEAD ветки. Push и PR не выполнялись.

## 4. Проверки

- tsc --noEmit apps/api: чисто. tsc --noEmit apps/web: чисто.
- jest --runInBand src/modules/store: 4 набора, 43 теста, все прошли.
- e2e (одноразовая БД, сторож): store-catalog 8 из 8, store-checkout 19 из 19.
- vitest web не запускался: типы web не менялись, shared изменён только добавлением.

## 5. Осталось, отложено

- Веб пока не использует PublicProductDto (StoreProduct остаётся локальным типом): переход на общий тип отложен.
- Админский список заказов по-прежнему отдаёт giftToUser целиком (email, прочие поля) и product целиком; это админская зона и противоречит комментарию ADR-0133, поэтому вынесено на решение.

## 6. Решения владельца

Нужно решение: сузить и админский список заказов (giftToUser и product по белому списку). Рекомендация: да, отдельным срезом после проверки, что админка финансов читает только username.

## 7. Риски и расхождения

К переносу в RISKS как R151: служебные данные выдачи (gameCommands) были доступны анониму через публичный каталог с момента появления каталога до этого исправления. Это шаблоны команд, не секреты и не данные пользователей, но раскрывают механику выдачи. Для production: после выкладки исправления проверить, что кеши и CDN не хранят старые ответы. Данные в БД не менялись, миграций нет.

## 8. NEXT EXACT STEP

1. Push ветки и PR после подключения доступа к GitHub, дождаться CI.
2. Перенести R151 в RISKS и запись в CHANGELOG в стековой ветке.
3. Решение по админскому списку заказов (раздел 6).
4. Перевести веб на PublicProductDto.
5. Добавить e2e-проверку заказа и списка желаний на отсутствие служебных полей.

## 9. Замечания ревью

- N1: paymentId, paymentProvider, paymentWebhookVerifiedAt, promoCodeId и bundle целиком в заказах покупателя. Судьба: отложено в 0.12.
- N2: promoCode целиком в корзине. Судьба: в бэклог.
- N3: нет e2e-проверок отсутствия служебных полей в заказах и wishlist. Судьба: закрыто этим срезом. В apps/api/test/store-checkout.e2e-spec.ts тестовым товарам заданы gameCommands и server; хелпер expectNoServiceFields (gameCommands, server, currencyType, currencyAmount, positionId, decorationId) применён к POST /store/orders, GET /store/orders, GET /store/orders/:number, POST /store/quick-buy, GET /store/wishlist и публичному GET /store/wishlist/:username. Результат: store-catalog 8 из 8, store-checkout 19 из 19, новых утечек не найдено, белый список не менялся.
- N4, N5: текст ревью не доступен исполнителю, уточнить.
