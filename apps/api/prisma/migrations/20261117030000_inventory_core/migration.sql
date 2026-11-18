-- Этап 04, срез 2 (ADR-0168, ADR-0179): последнее состояние инвентаря игрока и
-- настройки приватности. Только добавление (expand-only): две новые таблицы,
-- индексы и внешние ключи на users(id) с каскадным удалением. Существующие
-- таблицы, столбцы и данные не затрагиваются, деструктивных операций нет.
-- Написано вручную (Q43 а), на БД не применялось.

-- CreateTable
CREATE TABLE "player_inventories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serverSlug" VARCHAR(32) NOT NULL,
    "grp" VARCHAR(8) NOT NULL,
    "epoch" VARCHAR(64) NOT NULL,
    "rev" INTEGER NOT NULL,
    "slots" JSONB NOT NULL,
    "slotCount" INTEGER NOT NULL,
    "contentHash" VARCHAR(64) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "playerOnline" BOOLEAN NOT NULL DEFAULT false,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_inventories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_privacy" (
    "userId" TEXT NOT NULL,
    "inventoryPublic" BOOLEAN NOT NULL DEFAULT false,
    "enderPublic" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_privacy_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "player_inventories_lastSeenAt_idx" ON "player_inventories"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "player_inventories_userId_serverSlug_grp_key" ON "player_inventories"("userId", "serverSlug", "grp");

-- AddForeignKey
ALTER TABLE "player_inventories" ADD CONSTRAINT "player_inventories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_privacy" ADD CONSTRAINT "inventory_privacy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
