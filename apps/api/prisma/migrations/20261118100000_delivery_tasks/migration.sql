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
