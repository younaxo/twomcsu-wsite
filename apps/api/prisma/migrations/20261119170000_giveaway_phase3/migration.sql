-- Розыгрыш «Анархия Новой Эры», фаза 3: призы, итоги, админ-сессии, аудит,
-- тестовый режим (giveaway/docs/ADR-G003-admin-draw-live.md).
-- Expand-only (Q28, Q43a): только НОВЫЕ таблицы; единственный внешний ключ
-- giveaway_winners -> giveaway_draws между новыми таблицами. Существующие
-- таблицы, колонки и данные не изменяются. Деструктивных операций нет. Seed нет.

-- CreateTable
CREATE TABLE "giveaway_prizes" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "imageFile" VARCHAR(64),
    "priority" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "giveaway_prizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giveaway_draws" (
    "id" TEXT NOT NULL,
    "context" VARCHAR(8) NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "snapshotHash" VARCHAR(64) NOT NULL,
    "ticketCount" INTEGER NOT NULL,
    "frozenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "frozenBy" VARCHAR(32) NOT NULL,
    "seedHex" VARCHAR(64),
    "algorithm" VARCHAR(48),
    "orderJson" TEXT,
    "prizesJson" TEXT,
    "calculatedAt" TIMESTAMP(3),
    "calculatedBy" VARCHAR(32),
    "broadcastAt" TIMESTAMP(3),
    "broadcastBy" VARCHAR(32),
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "giveaway_draws_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giveaway_winners" (
    "id" TEXT NOT NULL,
    "drawId" TEXT NOT NULL,
    "place" INTEGER NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "ticket" VARCHAR(4) NOT NULL,
    "playerUuid" VARCHAR(36) NOT NULL,
    "playerName" VARCHAR(16) NOT NULL,
    "prizeName" VARCHAR(80) NOT NULL,
    "prizeImage" VARCHAR(64),
    "status" VARCHAR(16) NOT NULL,
    "disqualifiedAt" TIMESTAMP(3),
    "disqualifiedBy" VARCHAR(32),
    "disqualifyReason" VARCHAR(300),
    "replacesWinnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "giveaway_winners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giveaway_admin_sessions" (
    "id" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "discordId" VARCHAR(32) NOT NULL,
    "discordName" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "giveaway_admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giveaway_admin_audit" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" VARCHAR(32),
    "action" VARCHAR(48) NOT NULL,
    "objectType" VARCHAR(24),
    "objectId" VARCHAR(64),
    "mode" VARCHAR(8),
    "detail" VARCHAR(500),

    CONSTRAINT "giveaway_admin_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giveaway_test_time_grants" (
    "id" TEXT NOT NULL,
    "playerName" VARCHAR(16) NOT NULL,
    "playerUuid" VARCHAR(36) NOT NULL,
    "day" VARCHAR(10) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "createdBy" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "giveaway_test_time_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giveaway_test_tickets" (
    "id" TEXT NOT NULL,
    "ticket" VARCHAR(4) NOT NULL,
    "playerName" VARCHAR(16) NOT NULL,
    "playerUuid" VARCHAR(36) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "giveaway_test_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "giveaway_prizes_priority_createdAt_idx" ON "giveaway_prizes"("priority", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "giveaway_draws_context_key" ON "giveaway_draws"("context");

-- CreateIndex
CREATE INDEX "giveaway_winners_drawId_place_idx" ON "giveaway_winners"("drawId", "place");

-- CreateIndex
CREATE UNIQUE INDEX "giveaway_winners_drawId_orderIndex_key" ON "giveaway_winners"("drawId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "giveaway_admin_sessions_tokenHash_key" ON "giveaway_admin_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "giveaway_admin_sessions_discordId_idx" ON "giveaway_admin_sessions"("discordId");

-- CreateIndex
CREATE INDEX "giveaway_admin_sessions_expiresAt_idx" ON "giveaway_admin_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "giveaway_admin_audit_at_idx" ON "giveaway_admin_audit"("at");

-- CreateIndex
CREATE INDEX "giveaway_test_time_grants_playerUuid_idx" ON "giveaway_test_time_grants"("playerUuid");

-- CreateIndex
CREATE UNIQUE INDEX "giveaway_test_tickets_ticket_key" ON "giveaway_test_tickets"("ticket");

-- CreateIndex
CREATE UNIQUE INDEX "giveaway_test_tickets_playerName_key" ON "giveaway_test_tickets"("playerName");

-- CreateIndex
CREATE UNIQUE INDEX "giveaway_test_tickets_playerUuid_key" ON "giveaway_test_tickets"("playerUuid");

-- AddForeignKey
ALTER TABLE "giveaway_winners" ADD CONSTRAINT "giveaway_winners_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "giveaway_draws"("id") ON DELETE CASCADE ON UPDATE CASCADE;
