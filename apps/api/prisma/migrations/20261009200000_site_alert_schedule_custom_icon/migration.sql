-- ADR-0066: расписание плашки, свой SVG (только как <img>), режим outline/filled.
ALTER TABLE "site_alert" ADD COLUMN "customIcon" TEXT,
ADD COLUMN "startsAt" TIMESTAMP(3),
ADD COLUMN "endsAt" TIMESTAMP(3),
ADD COLUMN "displayStyle" VARCHAR(16) NOT NULL DEFAULT 'outline';
