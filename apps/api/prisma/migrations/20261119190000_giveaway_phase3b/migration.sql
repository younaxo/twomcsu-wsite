-- Розыгрыш, фаза 3b (ADR-G003 п. 11): индекс и внешний ключ для
-- giveaway_winners.replacesWinnerId. Только расширение (expand-only): новые
-- индекс и ограничение на таблице, созданной в 20261119170000_giveaway_phase3.
-- Данные и колонки не меняются; DROP/ALTER TYPE нет. Применять только после
-- ревью владельца. Если в giveaway_winners есть записи с replacesWinnerId,
-- ссылающимся на несуществующую запись, добавление ограничения завершится
-- ошибкой (приложение так не пишет: замена создаётся в той же транзакции).

-- CreateIndex
CREATE INDEX "giveaway_winners_replacesWinnerId_idx" ON "giveaway_winners"("replacesWinnerId");

-- AddForeignKey
ALTER TABLE "giveaway_winners" ADD CONSTRAINT "giveaway_winners_replacesWinnerId_fkey" FOREIGN KEY ("replacesWinnerId") REFERENCES "giveaway_winners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
