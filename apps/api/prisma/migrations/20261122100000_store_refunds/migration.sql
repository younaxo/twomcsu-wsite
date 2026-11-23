-- Возвраты и сверка платежей 0.9 (ADR-0188). Expand-only (Q28): только добавления —
-- два значения enum OrderStatus, новый enum, новая таблица order_refunds, одна
-- необязательная колонка orders.paymentReconciledAt и индекс. Без DROP/rename/сужения;
-- существующие данные не меняются. Не применять на production без ревью владельца.
-- ВАЖНО: ALTER TYPE ... ADD VALUE нельзя использовать в той же транзакции, где
-- значение применяется; здесь значения только добавляются.

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'REFUND_PENDING';
ALTER TYPE "OrderStatus" ADD VALUE 'REFUND_FAILED';

-- CreateEnum
CREATE TYPE "OrderRefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "paymentReconciledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "order_refunds" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "kind" VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
    "status" "OrderRefundStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "providerRefundId" VARCHAR(128),
    "errorCode" VARCHAR(64),
    "requiresManualRevoke" BOOLEAN NOT NULL DEFAULT false,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "order_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_refunds_idempotencyKey_key" ON "order_refunds"("idempotencyKey");
CREATE INDEX "order_refunds_orderId_idx" ON "order_refunds"("orderId");
CREATE INDEX "order_refunds_status_createdAt_idx" ON "order_refunds"("status", "createdAt");
CREATE INDEX "orders_status_createdAt_idx" ON "orders"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "order_refunds" ADD CONSTRAINT "order_refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
