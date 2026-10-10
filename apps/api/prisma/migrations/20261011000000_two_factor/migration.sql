-- Двухфакторная аутентификация TOTP (ADR-0109). Только добавление: новые
-- колонки с безопасными значениями по умолчанию и новая таблица резервных кодов.
-- Существующие аккаунты остаются без 2FA.

ALTER TABLE "users" ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "twoFactorSecret" TEXT;
ALTER TABLE "users" ADD COLUMN "twoFactorPendingSecret" TEXT;
ALTER TABLE "users" ADD COLUMN "twoFactorEnabledAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "twoFactorLastStep" INTEGER;

CREATE TABLE "two_factor_backup_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" VARCHAR(64) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "two_factor_backup_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "two_factor_backup_codes_userId_idx" ON "two_factor_backup_codes"("userId");

ALTER TABLE "two_factor_backup_codes" ADD CONSTRAINT "two_factor_backup_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
