-- Expand-only (0.13, ADR-0194, Q28): новая таблица очереди заданий выдачи
-- для плагина Bridge. Существующие таблицы и данные не меняются; обратной
-- совместимости не ломает (код без исполнителя bridge эту таблицу не читает).
-- Применяет на production только владелец.

-- CreateEnum
CREATE TYPE "BridgeDeliveryJobStatus" AS ENUM ('QUEUED', 'CLAIMED', 'DONE', 'FAILED', 'UNKNOWN', 'CANCELLED');

-- CreateTable
CREATE TABLE "bridge_delivery_jobs" (
    "id" TEXT NOT NULL,
    "idempotencyKey" VARCHAR(80) NOT NULL,
    "taskId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "serverSlug" VARCHAR(32) NOT NULL,
    "command" VARCHAR(256) NOT NULL,
    "status" "BridgeDeliveryJobStatus" NOT NULL DEFAULT 'QUEUED',
    "claimToken" VARCHAR(64),
    "claimCount" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ackCode" VARCHAR(48),
    "ackedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bridge_delivery_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bridge_delivery_jobs_idempotencyKey_key" ON "bridge_delivery_jobs"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "bridge_delivery_jobs_taskId_key" ON "bridge_delivery_jobs"("taskId");

-- CreateIndex
CREATE INDEX "bridge_delivery_jobs_serverSlug_status_expiresAt_idx" ON "bridge_delivery_jobs"("serverSlug", "status", "expiresAt");

-- AddForeignKey
ALTER TABLE "bridge_delivery_jobs" ADD CONSTRAINT "bridge_delivery_jobs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "delivery_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
