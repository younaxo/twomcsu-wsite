-- AlterTable
ALTER TABLE "maintenance_mode" ADD COLUMN     "modules" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'full',
ADD COLUMN     "startsAt" TIMESTAMP(3),
ADD COLUMN     "updatedBy" TEXT;

