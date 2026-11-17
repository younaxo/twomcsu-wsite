-- Этап 03, срез 1 (ADR-0182): приёмник Bridge. Только добавление (expand-only):
-- один enum и две новые таблицы с индексами. Существующие таблицы, столбцы,
-- данные и внешние ключи не затрагиваются, деструктивных операций нет.
-- Секретов нет: ключи серверов выводятся HKDF от мастер-секрета (контракт 2.4).
-- Написано вручную (Q43 а), на БД не применялось.

-- CreateEnum
CREATE TYPE "BridgeServerStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "bridge_servers" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(32) NOT NULL,
    "displayName" VARCHAR(64) NOT NULL,
    "status" "BridgeServerStatus" NOT NULL DEFAULT 'ACTIVE',
    "keyGeneration" INTEGER NOT NULL DEFAULT 1,
    "previousGenValidTill" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "lastProtocol" INTEGER,
    "pluginVersion" VARCHAR(32),
    "platform" VARCHAR(48),
    "clockSkewMs" INTEGER,
    "capabilities" JSONB,
    "sourceScope" VARCHAR(32) NOT NULL DEFAULT 'default',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bridge_servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bridge_event_log" (
    "id" TEXT NOT NULL,
    "serverSlug" VARCHAR(32) NOT NULL,
    "eventId" VARCHAR(64) NOT NULL,
    "type" VARCHAR(48) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "payloadHash" VARCHAR(64) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bridge_event_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bridge_servers_slug_key" ON "bridge_servers"("slug");

-- CreateIndex
CREATE INDEX "bridge_event_log_receivedAt_idx" ON "bridge_event_log"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "bridge_event_log_serverSlug_eventId_key" ON "bridge_event_log"("serverSlug", "eventId");
