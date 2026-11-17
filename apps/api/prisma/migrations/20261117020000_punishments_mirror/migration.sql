-- Этап 02, срез 1 (ADR-0166, ADR-0178): зеркало игровых наказаний и состояние
-- синхронизации. Только добавление (expand-only): два типа ENUM и две новые
-- таблицы с индексами. Существующие таблицы, столбцы и данные не затрагиваются,
-- деструктивных операций нет. Написано вручную (Q43 а), на БД не применялось.

-- CreateEnum
CREATE TYPE "MinecraftPunishmentKind" AS ENUM ('BAN', 'MUTE', 'WARN', 'KICK');

-- CreateEnum
CREATE TYPE "MinecraftPunishmentStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REMOVED', 'DELETED_AT_SOURCE');

-- CreateTable
CREATE TABLE "minecraft_punishments" (
    "id" TEXT NOT NULL,
    "source" VARCHAR(16) NOT NULL DEFAULT 'litebans',
    "sourceScope" VARCHAR(32) NOT NULL DEFAULT 'default',
    "kind" "MinecraftPunishmentKind" NOT NULL,
    "sourceId" BIGINT NOT NULL,
    "subjectUuid" VARCHAR(36),
    "subjectName" VARCHAR(64),
    "ipBan" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "executorUuid" VARCHAR(36),
    "executorName" VARCHAR(128),
    "executorIsConsole" BOOLEAN NOT NULL DEFAULT false,
    "removedByUuid" VARCHAR(36),
    "removedByName" VARCHAR(128),
    "removedByIsConsole" BOOLEAN NOT NULL DEFAULT false,
    "removedReason" TEXT,
    "removedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL,
    "until" TIMESTAMP(3),
    "status" "MinecraftPunishmentStatus" NOT NULL,
    "serverScope" VARCHAR(128),
    "serverOrigin" VARCHAR(128),
    "silent" BOOLEAN NOT NULL DEFAULT false,
    "template" INTEGER,
    "rowHash" VARCHAR(64) NOT NULL,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "hiddenById" TEXT,
    "hiddenReason" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAtSource" TIMESTAMP(3),

    CONSTRAINT "minecraft_punishments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "punishment_sync_state" (
    "id" TEXT NOT NULL,
    "source" VARCHAR(16) NOT NULL,
    "kind" "MinecraftPunishmentKind" NOT NULL,
    "cursorId" BIGINT NOT NULL DEFAULT 0,
    "lastPollAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastActiveCheckAt" TIMESTAMP(3),
    "lastFullReconcileAt" TIMESTAMP(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" VARCHAR(32),
    "initialSyncDoneAt" TIMESTAMP(3),

    CONSTRAINT "punishment_sync_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "minecraft_punishments_subjectUuid_startedAt_idx" ON "minecraft_punishments"("subjectUuid", "startedAt");

-- CreateIndex
CREATE INDEX "minecraft_punishments_status_startedAt_idx" ON "minecraft_punishments"("status", "startedAt");

-- CreateIndex
CREATE INDEX "minecraft_punishments_kind_status_isHidden_startedAt_idx" ON "minecraft_punishments"("kind", "status", "isHidden", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "minecraft_punishments_source_sourceScope_kind_sourceId_key" ON "minecraft_punishments"("source", "sourceScope", "kind", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "punishment_sync_state_source_kind_key" ON "punishment_sync_state"("source", "kind");
