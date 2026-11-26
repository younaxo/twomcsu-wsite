-- Срез l1-02 (ADR-0180, раздел 5.3; ADR-0194): обжалование наказаний из зеркала
-- LiteBans. Только расширение (expand): новая nullable-колонка, индексы, FK и
-- CHECK. Без DROP, переименований и изменения существующих данных; существующие
-- строки reports получают NULL. Откат: DROP INDEX/CONSTRAINT/COLUMN (данных до
-- первых обжалований нет).
-- Prisma не выражает CHECK и частичные индексы: после этой миграции
-- `prisma migrate dev` не должна генерировать их удаление, ревью обязательно.

-- AlterTable
ALTER TABLE "reports" ADD COLUMN "appealedMinecraftPunishmentId" TEXT;

-- CreateIndex
CREATE INDEX "reports_appealedMinecraftPunishmentId_idx" ON "reports"("appealedMinecraftPunishmentId");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_appealedMinecraftPunishmentId_fkey" FOREIGN KEY ("appealedMinecraftPunishmentId") REFERENCES "minecraft_punishments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Задано не более одного из двух полей обжалуемого наказания.
ALTER TABLE "reports" ADD CONSTRAINT "reports_one_appealed_punishment" CHECK ("appealedPunishmentId" IS NULL OR "appealedMinecraftPunishmentId" IS NULL);

-- Не более одного открытого обжалования на наказание зеркала (последний
-- рубеж после блокировки строки в сервисе; закрытые статусы не учитываются).
CREATE UNIQUE INDEX "reports_open_mc_appeal_uniq" ON "reports"("appealedMinecraftPunishmentId") WHERE "appealedMinecraftPunishmentId" IS NOT NULL AND "type" = 'PUNISHMENT_APPEAL' AND "status" IN ('PENDING', 'IN_REVIEW', 'WAITING_RESPONSE');
