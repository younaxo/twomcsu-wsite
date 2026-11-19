-- Розыгрыш: токен ссылки отслеживания билета /giveaway/ticket/<токен>
-- (ADR-G002, Q99). Только расширение (expand-only): колонка NULL, заполнение
-- существующих строк, затем уникальный индекс. DROP и смена типов нет.
-- Применять только после ревью владельца (Q28).
-- gen_random_uuid() встроена в PostgreSQL 13+; токен - 32 hex-символа без
-- дефисов, подходит под шаблон ^[A-Za-z0-9_-]{22,64}$. Новые билеты получают
-- токен из приложения (24 байта CSPRNG, base64url).

-- AlterTable
ALTER TABLE "giveaway_tickets" ADD COLUMN "trackingToken" VARCHAR(64);

-- Backfill существующих билетов
UPDATE "giveaway_tickets"
SET "trackingToken" = replace(gen_random_uuid()::text, '-', '')
WHERE "trackingToken" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "giveaway_tickets_trackingToken_key" ON "giveaway_tickets"("trackingToken");
