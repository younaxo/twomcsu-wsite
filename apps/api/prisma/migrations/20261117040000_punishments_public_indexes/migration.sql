-- Этап 02, срез 2 (ADR-0180, раздел 2.6 контракта): колонки принудительного
-- скрытия выдавшего (Q63 п.3) и индексы публичного списка. Только добавление
-- (expand-only): ADD COLUMN для новых колонок и CREATE INDEX. Существующие
-- столбцы, типы, индексы и данные не затрагиваются; DROP, UPDATE и DELETE
-- отсутствуют. Для существующих строк issuerHidden = false задаётся DEFAULT
-- (константа в метаданных, перезаписи данных нет). Написано вручную (Q43 а),
-- на БД не применялось; ревью по Q28 до контроллеров.
--
-- Порядок операторов (ревью Q28, M1): Prisma выполняет файл одной транзакцией,
-- блокировки держатся до её конца. Сначала три CREATE INDEX (SHARE: чтение идёт,
-- запись ждёт), и только потом четыре ADD COLUMN (ACCESS EXCLUSIVE, метаданные,
-- мгновенно), чтобы закрытие таблицы и для чтения не растягивалось на
-- построение индексов. Индексы не используют новые колонки, поэтому порядок
-- безопасен. Запись зеркала при этом закрыта на всё время транзакции.
--
-- Индекс-выражение и частичный индекс Prisma не выражает: в schema.prisma они
-- описаны комментарием модели. Следующие миграции пишутся вручную, чтобы не
-- удалить эти индексы (migrate dev мог бы предложить DROP INDEX).
--
-- Откат (L1): DROP COLUMN issuerHidden* допустим только до первого
-- использования скрытия выдавшего; после него колонки несут данные, и
-- возврат возможен только восстановлением из резервной копии.

-- CreateIndex: префиксный поиск ника без учёта регистра (lower(...) LIKE 'x%').
CREATE INDEX "minecraft_punishments_subjectName_lower_idx" ON "minecraft_punishments" (lower("subjectName") text_pattern_ops);

-- CreateIndex: публичный список, сортировка (startedAt, id), только публичный предикат.
CREATE INDEX "minecraft_punishments_public_startedAt_id_idx" ON "minecraft_punishments" ("startedAt", "id") WHERE "kind" IN ('BAN', 'MUTE') AND "isHidden" = false AND "silent" = false AND "ipBan" = false AND "status" <> 'DELETED_AT_SOURCE';

-- CreateIndex: сортировка (startedAt, id) для списка персонала без публичного предиката.
CREATE INDEX "minecraft_punishments_startedAt_id_idx" ON "minecraft_punishments" ("startedAt", "id");

-- AlterTable
ALTER TABLE "minecraft_punishments" ADD COLUMN "issuerHidden" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "minecraft_punishments" ADD COLUMN "issuerHiddenById" TEXT;

-- AlterTable
ALTER TABLE "minecraft_punishments" ADD COLUMN "issuerHiddenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "minecraft_punishments" ADD COLUMN "issuerHiddenReason" VARCHAR(200);
