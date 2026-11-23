-- Розыгрыш «Анархия Новой Эры», фаза 2b (giveaway/docs/ADR-G002, правки по ревью Security).
-- Expand-only (Q28, Q43a): три НОВЫЕ необязательные колонки (NULL, без default) в новой
-- таблице giveaway_codes и один частичный уникальный индекс. Существующие данные не
-- изменяются, деструктивных операций нет, seed нет.
-- Индекс создаётся на таблице, которая ещё не используется в production (фаза 2 не
-- применялась), поэтому блокировка не опасна; если таблица уже содержит строки, индекс
-- может не создаться при нарушении (два активных кода одной сессии) - тогда сначала
-- аннулировать лишние коды (отдельное решение владельца).

-- AlterTable
ALTER TABLE "giveaway_codes" ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN "lastAttemptMinutes" INTEGER,
ADD COLUMN "lastAttemptThreshold" INTEGER;

-- CreateIndex (частичный: Prisma не выражает его в schema.prisma)
-- Не более одного активного (непогашенного и неаннулированного) кода на сессию.
CREATE UNIQUE INDEX "giveaway_codes_one_active_per_session"
ON "giveaway_codes"("sessionHash")
WHERE "redeemedAt" IS NULL AND "revokedAt" IS NULL;
