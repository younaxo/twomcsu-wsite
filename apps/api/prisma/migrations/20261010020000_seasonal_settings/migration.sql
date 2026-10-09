-- CreateTable
CREATE TABLE "seasonal_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "mode" VARCHAR(16) NOT NULL DEFAULT 'auto',
    "forcedCampaignId" VARCHAR(32),
    "showWordmarkO" BOOLEAN NOT NULL DEFAULT true,
    "showDecoration" BOOLEAN NOT NULL DEFAULT true,
    "showEffects" BOOLEAN NOT NULL DEFAULT true,
    "showBanners" BOOLEAN NOT NULL DEFAULT true,
    "effectIntensity" INTEGER NOT NULL DEFAULT 2,
    "campaigns" JSONB NOT NULL DEFAULT '{}',
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seasonal_settings_pkey" PRIMARY KEY ("id")
);

