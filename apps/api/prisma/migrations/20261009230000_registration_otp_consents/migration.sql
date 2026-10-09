-- ADR-0070: регистрация с подтверждением почты (OTP), согласия, реферальные коды.
-- CreateTable
CREATE TABLE "email_verifications" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" VARCHAR(16) NOT NULL,
    "referrerId" TEXT,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sendCount" INTEGER NOT NULL DEFAULT 1,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "completionTokenHash" TEXT,
    "completionExpiresAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_consents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "document" VARCHAR(32) NOT NULL,
    "version" VARCHAR(32) NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,

    CONSTRAINT "legal_consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_verifications_email_createdAt_idx" ON "email_verifications"("email", "createdAt");

-- CreateIndex
CREATE INDEX "legal_consents_userId_idx" ON "legal_consents"("userId");

-- AddForeignKey
ALTER TABLE "legal_consents" ADD CONSTRAINT "legal_consents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Реферальный код каждому существующему пользователю: ник в верхнем регистре;
-- при совпадении регистра — с публичным номером. Системный аккаунт без кода.
UPDATE "users" u
SET "referralCode" = CASE
  WHEN EXISTS (
    SELECT 1 FROM "users" o
    WHERE upper(o."username") = upper(u."username") AND o."shortId" < u."shortId"
  ) THEN upper(u."username") || u."shortId"::text
  ELSE upper(u."username")
END
WHERE u."referralCode" IS NULL AND u."accountType" <> 'SYSTEM';
