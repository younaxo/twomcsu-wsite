-- Быстрая покупка по нику и платное снятие наказаний 0.12 (ADR-0190). Expand-only (Q28):
-- две необязательные колонки orders и уникальный индекс по хешу токена, новая таблица
-- paid_removal_records. Без DROP/rename/сужения; существующие данные не меняются.
-- Не применять на production без ревью владельца.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "guestAccessTokenHash" VARCHAR(64),
ADD COLUMN "guestAccessExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "orders_guestAccessTokenHash_key" ON "orders"("guestAccessTokenHash");

-- CreateTable
CREATE TABLE "paid_removal_records" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderNumber" VARCHAR(64) NOT NULL,
    "kind" "MinecraftPunishmentKind" NOT NULL,
    "subjectName" VARCHAR(64) NOT NULL,
    "punishmentId" TEXT,
    "ruleVersion" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paid_removal_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "paid_removal_records_orderItemId_key" ON "paid_removal_records"("orderItemId");

-- CreateIndex
CREATE INDEX "paid_removal_records_subjectName_createdAt_idx" ON "paid_removal_records"("subjectName", "createdAt");

-- CreateIndex
CREATE INDEX "paid_removal_records_orderId_idx" ON "paid_removal_records"("orderId");
