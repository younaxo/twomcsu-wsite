-- Уведомления (ADR-0097): превью в push и уведомления при открытом сайте. Только добавление.
ALTER TABLE "notification_settings" ADD COLUMN "pushPreview" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "notification_settings" ADD COLUMN "foregroundEnabled" BOOLEAN NOT NULL DEFAULT true;
