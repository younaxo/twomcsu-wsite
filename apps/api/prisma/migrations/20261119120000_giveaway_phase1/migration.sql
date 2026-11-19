-- Розыгрыш «Анархия Новой Эры», фаза 1: учёт времени (giveaway/docs/ADR-G001).
-- Expand-only (Q28, Q43a): только НОВЫЕ таблицы без внешних ключей на
-- существующие. Существующие таблицы, колонки и данные не изменяются.
-- Деструктивных операций (DROP, RENAME, сужение типов) нет. Приложение, не
-- знающее о таблицах, продолжает работать. Seed нет: настройки по умолчанию
-- берутся из окружения, пока строки в giveaway_settings нет.

-- CreateTable
CREATE TABLE "giveaway_settings" (
    "id" VARCHAR(16) NOT NULL DEFAULT 'default',
    "thresholdMinutes" INTEGER NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "cutoffAt" TIMESTAMP(3) NOT NULL,
    "timezone" VARCHAR(48) NOT NULL DEFAULT 'Europe/Moscow',
    "allowedServers" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "giveaway_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giveaway_players" (
    "playerUuid" VARCHAR(36) NOT NULL,
    "lastName" VARCHAR(16) NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "giveaway_players_pkey" PRIMARY KEY ("playerUuid")
);

-- CreateTable
CREATE TABLE "giveaway_minutes" (
    "playerUuid" VARCHAR(36) NOT NULL,
    "minute" TIMESTAMP(3) NOT NULL,
    "serverSlug" VARCHAR(32) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "giveaway_minutes_pkey" PRIMARY KEY ("playerUuid","minute")
);

-- CreateTable
CREATE TABLE "giveaway_session_events" (
    "id" TEXT NOT NULL,
    "serverSlug" VARCHAR(32) NOT NULL,
    "eventId" VARCHAR(36) NOT NULL,
    "type" VARCHAR(8) NOT NULL,
    "playerUuid" VARCHAR(36) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "giveaway_session_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "giveaway_minutes_minute_idx" ON "giveaway_minutes"("minute");

-- CreateIndex
CREATE INDEX "giveaway_session_events_playerUuid_occurredAt_idx" ON "giveaway_session_events"("playerUuid", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "giveaway_session_events_serverSlug_eventId_key" ON "giveaway_session_events"("serverSlug", "eventId");
