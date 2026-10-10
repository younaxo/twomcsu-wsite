-- Падающий эффект независимо от сезона (ADR-0090). Только добавление колонок.
ALTER TABLE "seasonal_settings" ADD COLUMN "fallingMode" VARCHAR(16) NOT NULL DEFAULT 'season';
ALTER TABLE "seasonal_settings" ADD COLUMN "fallingEffect" VARCHAR(16);
ALTER TABLE "seasonal_settings" ADD COLUMN "effectSpeed" INTEGER NOT NULL DEFAULT 2;

-- Сохранить прежний выбор: «эффекты выключены» → режим off.
UPDATE "seasonal_settings" SET "fallingMode" = 'off' WHERE "showEffects" = false;
