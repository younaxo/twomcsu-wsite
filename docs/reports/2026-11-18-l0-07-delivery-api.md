# Подэтап 0.7. API выдачи купленного (2026-11-18)

Ветка `feature/l0-07-delivery-api`. Основание: ADR-0184 (support-worktree, `docs/implementation/DECISIONS.md`), `docs/plan/PRIORITY-PLAN-DRAFT.md` «### 0.7».

## Что сделано

- Модуль `apps/api/src/modules/delivery/`: `DeliveryService` (создание заданий, воркер-очередь, ручная отметка, повтор, отзыв сайтовой выдачи, проверка запрета возврата), исполнители `manual`, `site`, `command` (через `CommandTransport`, в 0.7 только мок), админ-контроллер, планировщик воркера.
- Задания создаются в транзакции перехода заказа в COMPLETED, только при `moved.count === 1` (outbox, идемпотентно по `UNIQUE (orderItemId, step)`).
- Подарок выдаётся получателю (`giftToUserId`).
- Очередь: `FOR UPDATE SKIP LOCKED` + lease-токен; результат `unknown` переводит в `NEEDS_ATTENTION` без автоповтора.
- Админ-API: список, карточка, ручная отметка с причиной, повтор с подтверждением; права `store.delivery.view` / `store.delivery.manage`, 2FA, аудит в транзакции.
- Покупатель видит `deliveryStatus`: `pending` / `delivered` / `failed` (внутренние детали не отдаются).
- `DeliveryService` не читает `Product.gameCommands`; игровые товары в 0.7 идут на `manual`, украшения (`decorationId`) на `site`.
- Флаг: настройка `store.delivery.enabled` (по умолчанию выкл.) и env `STORE_DELIVERY_ENABLED` (явный false = жёсткий запрет).

## Проверки

- `tsc --noEmit` (apps/api): без ошибок.
- ESLint по delivery/store/config и новому e2e: ошибок нет в изменённых файлах, кроме уже существовавшей prettier-ошибки в `promocodes-admin.controller.ts` (файл не менялся в этой ветке).
- Полный jest (apps/api): 123 набора passed, 1 skipped; 2194 теста passed, 6 skipped, 2200 всего. Шесть «непроходящих» тестов - skipped (по выводу jest), failed нет.
- ESLint по всему apps/api: 14 prettier-ошибок в файлах вне изменений этой ветки (те же 14 без наших правок); изменённые файлы чистые.
- e2e на одноразовой БД `twomc_e2e` (после исправления M1): `store-delivery` 33 passed; `orders-admin` 12 passed; `store-checkout` 19 passed.
- Ранее (до M1): `store-delivery` 31 passed; `store-checkout` 19 passed. Регрессионные store/orders e2e: orders-admin 12, store-admin-2fa 1, store-admin-products 13, store-cart 38, store-checkout-offer 14, store-checkout-unavailable 4, store-my-orders 8 - все passed.

## Допущения

1. При выключенном флаге задания СОЗДАЮТСЯ (outbox не теряет заказы), флаг управляет только обработкой воркером. Включение позже обработает накопленное. Альтернатива (не создавать) теряла бы выдачу оплаченных заказов.
2. Исполнитель `command` по умолчанию выключен отдельной настройкой `store.delivery.executor.command.enabled`; шаблонов команд в 0.7 нет, реальный транспорт (Bridge) подключается в 2.2.
3. Env `STORE_DELIVERY_ENABLED` имеет приоритет только как запрет; включить доставку одной env нельзя.
4. `OrdersService.refund` (PATCH /admin/orders/:id/refund) в одной транзакции блокирует заказ и задания (FOR UPDATE) и вызывает `assertRefundAllowed`: если любое задание позиции в DELIVERED, MANUAL_DONE, IN_PROGRESS или NEEDS_ATTENTION - 409 (`refund_after_delivery` либо `delivery_in_progress`), заказ не меняется (ADR-0184 Р4). При разрешённом возврате там же: невыданные задания (PENDING, RETRY_WAIT, FAILED, AWAITING_MANUAL) -> CANCELLED, вызывается `revokeSiteGrants` (Р5), затем статус REFUNDED. Деньги провайдер в 0.7 не возвращает (это 0.9): меняется только статус.
5. Политика backoff: 1, 5, 30 минут, 2 часа; потолок 5 попыток (настраиваемо).
6. Статус выдачи покупателю `null` для незавершённого заказа.

## К переносу: риски (R167+)

- R167. Флаг выключен по умолчанию: пока владелец не включит `store.delivery.enabled`, задания копятся в `PENDING`; после включения воркер обработает их пачкой.
- R168. Все игровые товары в 0.7 выдаются только вручную (`AWAITING_MANUAL`); при росте заказов очередь админов растёт до подключения Bridge (2.2).
- R169. Возврат блокируется для `NEEDS_ATTENTION` и `IN_PROGRESS`: админ обязан сначала отметить или отменить задание, иначе возврат невозможен.
- R170. Отзыв сайтовой выдачи удаляет только украшение источника PURCHASE этого заказа; если игрок продал/сменил выбранное, выбранное украшение сбрасывается.
- R171. Воркер работает в каждом экземпляре API; корректность держится на `SKIP LOCKED` + lease. Просроченная аренда у долгого исполнителя теоретически даёт двойное исполнение; для `command` защита - идемпотентность на стороне транспорта (2.2).
- R172. Изменён контракт ответа заказа покупателю: добавлены `deliveryStatus` на заказе и позициях; потребители с строгой схемой должны обновиться.
- R173. Миграция требует ревью Q28 (ниже) и применения владельцем на production.

## Миграция для ревью (Q28)

`apps/api/prisma/migrations/20261118100000_delivery_tasks/migration.sql` (коммит fb689eef). Expand-only: новый enum и новая таблица с FK `ON DELETE CASCADE` на `order_items`; существующие таблицы не изменяются, деструктивных операций нет. Применялась только на одноразовой локальной БД `twomc_e2e`. Риск данных: низкий; каскадное удаление заданий при удалении позиции заказа (позиции сейчас не удаляются, кроме тестов).

Полный текст:

```sql
-- Очередь выдачи купленного (подэтап 0.7, ADR-0184 п. 3-4, Р3, Р6).
-- Expand-only (Q28): только новый enum и НОВАЯ таблица с внешним ключом на
-- order_items. Существующие таблицы и колонки не изменяются, данные не
-- переписываются и не удаляются, обратной засыпки нет. Приложение, не знающее о
-- таблице, продолжает работать. Деструктивных операций нет.
-- Ключ идемпотентности: UNIQUE (orderItemId, step).

-- CreateEnum
CREATE TYPE "DeliveryTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'RETRY_WAIT', 'DELIVERED', 'FAILED', 'NEEDS_ATTENTION', 'AWAITING_MANUAL', 'MANUAL_DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "delivery_tasks" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 1,
    "executor" VARCHAR(16) NOT NULL,
    "status" "DeliveryTaskStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "leaseToken" VARCHAR(64),
    "leaseUntil" TIMESTAMP(3),
    "nick" VARCHAR(16),
    "recipientUserId" TEXT,
    "renderedCommand" VARCHAR(256),
    "templateVersion" INTEGER,
    "lastError" VARCHAR(500),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_tasks_orderItemId_step_key" ON "delivery_tasks"("orderItemId", "step");

-- CreateIndex
CREATE INDEX "delivery_tasks_status_nextAttemptAt_idx" ON "delivery_tasks"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "delivery_tasks_status_leaseUntil_idx" ON "delivery_tasks"("status", "leaseUntil");

-- CreateIndex
CREATE INDEX "delivery_tasks_status_createdAt_idx" ON "delivery_tasks"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "delivery_tasks" ADD CONSTRAINT "delivery_tasks_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

## Устойчивость к сбою создания заданий (промпт 15)

Требование владельца: ошибка создания заданий выдачи не должна мешать статусу «выполнено»; создание минимальное, без внешних вызовов, идемпотентное; фоновая сверка досоздаёт недостающие задания; тесты на сбой при вебхуке.

### Механизм

1. **Шаг после коммита.** `OrdersService.handleWebhook`: транзакция вебхука теперь только переводит заказ PENDING -> COMPLETED (и промокод). Задания в неё больше не входят. После коммита, только у победителя перехода (`transitioned === true`), вызывается `DeliveryService.createTasksAfterPayment(orderId)`: `try/catch`, ошибка пишется в лог (`ERROR`, очищенный текст) и не пробрасывается; вебхук отвечает успехом. Повторный вебхук (`already_processed`) шаг не вызывает.
2. **Минимальная вставка.** `createTasksForOrder` без изменений по сути: одно чтение заказа с позициями, при подарках одно чтение ников получателей, одна `createMany({ skipDuplicates: true })`. Внешних вызовов и чтения шаблонов нет (шаблонов в 0.7 нет; `Product.gameCommands` не читается). Идемпотентный ключ - существующий `UNIQUE(orderItemId, step)`. Метод принимает клиента Prisma (`this.prisma` или `tx`), один и тот же путь для вебхука и сверки.
3. **Фоновая сверка.** `DeliveryService.reconcileMissingTasks` + `DeliveryReconcileScheduler` (таймер процесса раз в 60 с, как `DeliveryWorkerScheduler`; в `NODE_ENV=test` таймер выключен; зарегистрирован в `DeliveryModule`). Ищет заказы `COMPLETED`, у которых есть позиция без заданий (`items some deliveryTasks none`), с `paidAt` в окне: не моложе 60 с (шаг после коммита ещё может идти) и не старше 72 ч (см. риск R-A). Пачка 50 заказов, старые первыми. Каждый заказ обрабатывается в своей короткой транзакции под `pg_try_advisory_xact_lock(hashtext('delivery-reconcile:<orderId>'))`: параллельные инстансы не дублируют работу (занято - пропуск), а ошибка одного заказа не абортит остальные (в PostgreSQL ошибка рвёт всю транзакцию, поэтому транзакция на заказ, а не на пачку). Флаг выключения: env `DELIVERY_RECONCILE_ENABLED=false` (по образцу `STORE_DELIVERY_ENABLED`; по умолчанию включена, создание заданий инертно, пока доставка выключена настройкой). Лог `info` с числом досозданных заданий; метрик в проекте нет (образца нет), отдельную не вводили.
4. **Аудит.** Для системного досоздания аудит не пишется: нет актора, действие восстанавливающее и идемпотентное, состояние заказа не меняется (создаются только служебные задания); след - info-лог с числом и warn при сбое заказа. Действия людей над заданиями по-прежнему аудируются.

### Обоснование выбора

- Вариант SAVEPOINT (`$executeRaw SAVEPOINT` внутри interactive tx) не выбран: он работает, но держит создание заданий внутри транзакции оплаты (удлиняет её, блокирует строки), усложняет код и тесты; шаг после коммита проще и надёжнее, а потеря шага (падение процесса между коммитом и вставкой) в любом случае закрывается сверкой.
- Ошибка внутри `$transaction` без savepoint абортит транзакцию в PostgreSQL, поэтому `try/catch` вокруг Prisma-вызова внутри неё не спасает; вынос за коммит это исключает.
- Отказ от атомарности «COMPLETED и задания в одной транзакции» (прежний ADR-0184 п. 3, outbox): остаётся гарантия «в итоге»: окно между коммитом и созданием заданий не более интервала сверки (около 1-2 минут при включённом планировщике), покупатель в этом окне видит заказ без статуса выдачи (`deliveryStatus` по пустому набору заданий), деньги не теряются.

### Тесты

- Юнит `orders.service.spec.ts`: задания создаются после перехода (порядок tx -> tasks), только при `moved.count === 1`; сбой создания (шаг вернул false) не отменяет оплату, ответ `accepted: true`; прежние проверки сохранены (старый тест «сбой откатывает транзакцию» заменён по требованию владельца).
- Юнит `delivery.service.spec.ts`: `createTasksAfterPayment` (успех вне транзакции, сбой -> false без исключения); `reconcileMissingTasks` (запрос: статус, окно, пачка, порядок; суммирование; чужой advisory lock - пропуск; сбой одного заказа не мешает остальным; env-флаг выключает).
- e2e `store-delivery.e2e-spec.ts` (блок «сбой создания заданий при вебхуке и фоновая сверка»): (а) вставка подменена на ошибку: вебхук 200 без `reason`, заказ COMPLETED, `paidAt` и `paymentWebhookVerifiedAt` выставлены, заданий нет; (б) сверка создаёт 2 задания (manual и site); (в) повторная сверка x2 и повторный вебхук - без дублей; сверка не трогает заказ моложе 60 с и подхватывает его позже. Двойной и гоночный вебхук (5 одновременных) покрыты прежними тестами того же файла.

### Риски и допущения

- R-A (допущение): окно сверки 72 ч защищает от выдачи по историческим COMPLETED-заказам, созданным до 0.7 (заданий у них нет намеренно). Если сбой продлится дольше 72 ч, задания заказа сверка не создаст; нужен ручной запуск/расширение окна. Заказы, оплаченные в последние 72 ч перед выкладкой 0.7 на реальную БД, получат задания при первом проходе: перед включением доставки на production проверить, что таких заказов нет (или включать доставку позже). Решение по окну - за владельцем.
- Окно «COMPLETED без заданий» кратковременно видно в админке заказов; возврат заказа в этом окне разрешён (заданий нет, отзывать нечего), последующая сверка не создаст заданий: только для COMPLETED.
- Позиции, добавленные в заказ после COMPLETED, невозможны (заказ неизменяем), поэтому критерий «нет ни одного задания у позиции» равен «нет полного набора» при единственном шаге 1. При появлении шагов 2+ (шаблоны, 0.11) критерий нужно расширить до сравнения с числом шагов.
- Нагрузка: запрос сверки идёт по `orders` с фильтром `status`+`paidAt` и подзапросом `NOT EXISTS` по `delivery_tasks(orderItemId)` (есть UNIQUE-индекс); отдельного индекса и миграции не требуется. Миграций в этом срезе нет.
- ADR-0184 хранится в `docs/implementation/DECISIONS.md` ветки `docs/l0-consolidation` (worktree support); в этой ветке его нет, поэтому раздел «Реализация 0.7» оформлен здесь, а в ADR его надо перенести текстом из подразделов «Механизм» и «Обоснование выбора» (прежние пункты ADR не удалять).

## Ревью Q&S и доработки

Независимое ревью 0.7 (Q и API Security) вернуло условное «принято». Доработки в этой же ветке, миграций нет.

**S1. Очистка ошибок (`sanitizeDeliveryError`).** Скрываются: `Bearer <токен>` любой длины, `Authorization: [схема] значение`, userinfo в `схема://user:pass@host` (логин и пароль целиком), ключи `pass`, `pwd`, `password`, `passwd`, `rcon`, `apikey`, `api_key`, `token`, `secret`, `key` (в т.ч. с префиксом, например `db_password`) в формах `key=value`, `key: value`, `"key":"value"` (значение в кавычках с пробелами тоже). Длина по-прежнему не больше 300; вход перед разбором ограничен 4000 символов (защита от квадратичного разбора). Негативные тесты на каждый случай, включая обязательные три, в `delivery-helpers.spec.ts`.

**S2. Гонка сверки и возврата.** Причина: сверка выбирала кандидата (COMPLETED), а возврат мог пройти до вставки; задания создавались для уже REFUNDED заказа (и «возвращённый» товар могли выдать).
- `createTasksForOrder` берёт `SELECT status FROM orders WHERE id=... FOR UPDATE` и создаёт задания только при COMPLETED; иначе лог и 0. `createTasksAfterPayment` теперь выполняется в короткой транзакции. Порядок блокировок тот же, что у `refund` (заказ, затем задания): взаимоблокировок нет.
- Воркер: `claimNext` берёт задания только COMPLETED-заказов; `cancelTasksOfClosedOrders` (в `processBatch`) переводит открытые задания (PENDING, RETRY_WAIT, AWAITING_MANUAL) заказов REFUNDED/CANCELLED/FAILED в CANCELLED с `lastError = order_not_completed`.
- Ручная отметка «выдано» и «Повторить»: блокируют заказ `FOR UPDATE`, при статусе не COMPLETED отвечают 409 `delivery_order_not_completed`, ничего не меняя.
- Выбор CANCELLED, а не NEEDS_ATTENTION для воркера: задание не выполнялось, NEEDS_ATTENTION блокирует возврат (`REFUND_BLOCKING_STATUSES`) и показывается покупателю как сбой; CANCELLED совпадает с тем, что делает возврат, строка и причина сохраняются (данные не теряются), значения enum уже есть, миграция не нужна. Ручные действия не меняют задание, а отказывают: безопаснее.
- Тесты: юнит (блокировка до вставки, статусы REFUNDED/CANCELLED/FAILED/PENDING, 409 для ручных действий, SQL claim, отмена закрытых) и e2e в `store-delivery.e2e-spec.ts` (возврат после выбора кандидата, настоящая гонка с удержанием блокировки, ручная отметка при REFUNDED, воркер при закрытом заказе).

**Q1. «Повторить» и `attempts`.** Выбрано: НЕ сбрасывать (задокументировано в JSDoc `retryTask`). Ручной повтор из FAILED даёт ровно одну дополнительную попытку без автоповторов; при неудаче задание снова FAILED, админ может повторить ещё раз. Сброс дал бы до `maxAttempts` автоматических запусков возможно неидемпотентной команды после одного подтверждения; счётчик остаётся монотонным для аудита и `attempt` в снимке. Возможно пересмотреть вместе с шаблонами команд (0.11).

**Проверки доработки.** `tsc` без ошибок; полный jest apps/api: 2239 passed, 6 skipped (123 из 124 наборов, 1 пропущен); e2e (одноразовая БД, сторож): store-delivery 41/41, store-checkout 19/19, orders-admin 12/12, store-my-orders 8/8.

**Остаточный риск.** Открытые задания PENDING-заказа не отменяются (только не берутся воркером): таких заданий создаваться не должно. FAILED-задания закрытых заказов остаются видимыми админу (их повтор и отметка запрещены 409).
