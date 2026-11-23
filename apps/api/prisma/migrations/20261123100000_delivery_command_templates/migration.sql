-- Шаблоны игровых команд выдачи 0.11 (ADR-0189). Expand-only (Q28): одна новая
-- таблица и индекс; без DROP/rename/сужения, существующие данные не меняются.
-- Без внешних ключей намеренно. Не применять на production без ревью владельца.

-- CreateTable
CREATE TABLE "delivery_command_templates" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "scopeKey" VARCHAR(64) NOT NULL,
    "template" VARCHAR(200) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_command_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_command_templates_scopeKey_key" ON "delivery_command_templates"("scopeKey");

-- CreateIndex
CREATE INDEX "delivery_command_templates_productId_idx" ON "delivery_command_templates"("productId");
