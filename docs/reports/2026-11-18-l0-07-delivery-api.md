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
