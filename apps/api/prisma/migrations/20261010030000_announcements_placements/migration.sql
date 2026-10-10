-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "audience" TEXT NOT NULL DEFAULT 'all',
ADD COLUMN     "notifiedAt" TIMESTAMP(3),
ADD COLUMN     "placements" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "updatedBy" TEXT;

