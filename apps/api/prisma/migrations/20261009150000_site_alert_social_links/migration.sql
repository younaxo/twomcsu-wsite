-- ADR-0066: глобальная плашка; ADR-0067: расширяемые соцсети проекта.
-- CreateTable
CREATE TABLE "site_social_links" (
    "id" TEXT NOT NULL,
    "platform" VARCHAR(32) NOT NULL,
    "title" VARCHAR(60),
    "url" VARCHAR(500) NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_social_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_alert" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "variant" VARCHAR(16) NOT NULL DEFAULT 'danger',
    "icon" VARCHAR(32) NOT NULL DEFAULT 'alert-triangle',
    "title" VARCHAR(80),
    "message" VARCHAR(500) NOT NULL DEFAULT '',
    "linkUrl" VARCHAR(500),
    "linkLabel" VARCHAR(40),
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_social_links_sortOrder_idx" ON "site_social_links"("sortOrder");


-- Перенос уже сохранённых соцсетей из фиксированных колонок (колонки не
-- удаляются — данные не теряются).
INSERT INTO "site_social_links" ("id", "platform", "url", "isEnabled", "sortOrder", "createdAt", "updatedAt")
SELECT 'migrated-' || v.platform, v.platform, v.url, true, v.sort_order, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  SELECT s."telegramChannel" AS url, 'telegram' AS platform, 0 AS sort_order FROM "site_settings_config" s
  UNION ALL SELECT s."discordInvite", 'discord', 1 FROM "site_settings_config" s
  UNION ALL SELECT s."youtubeChannel", 'youtube', 2 FROM "site_settings_config" s
  UNION ALL SELECT s."vkGroup", 'vk', 4 FROM "site_settings_config" s
) v
WHERE v.url IS NOT NULL AND btrim(v.url) <> ''
ON CONFLICT ("id") DO NOTHING;
