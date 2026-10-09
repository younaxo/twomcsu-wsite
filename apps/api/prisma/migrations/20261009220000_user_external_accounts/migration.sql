-- ADR-0069: привязанные внешние аккаунты (вход через Discord/Telegram только для привязанных).
-- CreateTable
CREATE TABLE "user_external_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" VARCHAR(16) NOT NULL,
    "providerUserId" VARCHAR(64) NOT NULL,
    "username" VARCHAR(64),
    "displayName" VARCHAR(128),
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "user_external_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_external_accounts_provider_providerUserId_key" ON "user_external_accounts"("provider", "providerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "user_external_accounts_userId_provider_key" ON "user_external_accounts"("userId", "provider");

-- AddForeignKey
ALTER TABLE "user_external_accounts" ADD CONSTRAINT "user_external_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

