-- Expand-only (J-08-4, срез 8.6, Q28): новая таблица заданий фоновой рассылки.
-- Существующие таблицы, колонки и данные не меняются. Применяет на production только владелец.

-- CreateEnum
CREATE TYPE "MailingJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "mailing_jobs" (
    "id" TEXT NOT NULL,
    "status" "MailingJobStatus" NOT NULL DEFAULT 'QUEUED',
    "title" VARCHAR(120) NOT NULL,
    "message" VARCHAR(2000) NOT NULL,
    "link" VARCHAR(500),
    "audienceKind" VARCHAR(16) NOT NULL,
    "audienceRoleId" VARCHAR(64),
    "audienceUserIds" JSONB,
    "total" INTEGER NOT NULL,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "cursor" TEXT,
    "lastError" VARCHAR(200),
    "createdById" TEXT NOT NULL,
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mailing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mailing_jobs_status_createdAt_idx" ON "mailing_jobs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "mailing_jobs_createdAt_idx" ON "mailing_jobs"("createdAt");

