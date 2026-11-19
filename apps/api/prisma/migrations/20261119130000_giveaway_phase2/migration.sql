-- Розыгрыш «Анархия Новой Эры», фаза 2: коды и билеты (giveaway/docs/ADR-G002).
-- Expand-only (Q28, Q43a): только НОВЫЕ таблицы; внешний ключ только между
-- новыми таблицами. Существующие таблицы, колонки и данные не изменяются.
-- Деструктивных операций нет. Seed нет.

-- CreateTable
CREATE TABLE "giveaway_tickets" (
    "id" TEXT NOT NULL,
    "ticket" VARCHAR(4) NOT NULL,
    "playerUuid" VARCHAR(36) NOT NULL,
    "playerName" VARCHAR(16) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "giveaway_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giveaway_codes" (
    "id" TEXT NOT NULL,
    "codeHash" VARCHAR(64) NOT NULL,
    "sessionHash" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "ticketId" TEXT,

    CONSTRAINT "giveaway_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "giveaway_tickets_ticket_key" ON "giveaway_tickets"("ticket");

-- CreateIndex
CREATE UNIQUE INDEX "giveaway_tickets_playerUuid_key" ON "giveaway_tickets"("playerUuid");

-- CreateIndex
CREATE UNIQUE INDEX "giveaway_codes_codeHash_key" ON "giveaway_codes"("codeHash");

-- CreateIndex
CREATE INDEX "giveaway_codes_sessionHash_createdAt_idx" ON "giveaway_codes"("sessionHash", "createdAt");

-- CreateIndex
CREATE INDEX "giveaway_codes_expiresAt_idx" ON "giveaway_codes"("expiresAt");

-- AddForeignKey
ALTER TABLE "giveaway_codes" ADD CONSTRAINT "giveaway_codes_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "giveaway_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
