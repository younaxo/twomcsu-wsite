-- CreateTable
CREATE TABLE "storage_retention" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "auditDays" INTEGER NOT NULL DEFAULT 90,
    "securityDays" INTEGER NOT NULL DEFAULT 90,
    "serverStatusDays" INTEGER NOT NULL DEFAULT 30,
    "technicalDays" INTEGER NOT NULL DEFAULT 7,
    "autoCleanup" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastRunTrigger" TEXT,
    "lastResult" JSONB,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_retention_pkey" PRIMARY KEY ("id")
);

