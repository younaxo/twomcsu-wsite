-- AlterEnum
-- Q26, ADR-0172: отдельный тип уведомления о смене статуса обращения.
-- Значение добавляется одной командой и не используется в этой же миграции.

ALTER TYPE "NotificationType" ADD VALUE 'REPORT_STATUS_CHANGED';
