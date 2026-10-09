-- AlterTable
ALTER TABLE "email_verifications" ADD COLUMN     "mcChallengeAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mcChallengeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "mcChallengeHash" TEXT,
ADD COLUMN     "mcConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "mcName" VARCHAR(16),
ADD COLUMN     "mcSessionId" TEXT,
ADD COLUMN     "mcUuid" VARCHAR(36);

-- CreateTable
CREATE TABLE "minecraft_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "uuid" VARCHAR(36) NOT NULL,
    "name" VARCHAR(16) NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "minecraft_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "minecraft_connect_sessions" (
    "id" TEXT NOT NULL,
    "uuid" VARCHAR(36) NOT NULL,
    "name" VARCHAR(16) NOT NULL,
    "linkTokenHash" TEXT NOT NULL,
    "codeHash" TEXT,
    "codeIssuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "minecraft_connect_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "minecraft_accounts_userId_key" ON "minecraft_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "minecraft_accounts_uuid_key" ON "minecraft_accounts"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "minecraft_connect_sessions_linkTokenHash_key" ON "minecraft_connect_sessions"("linkTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "minecraft_connect_sessions_codeHash_key" ON "minecraft_connect_sessions"("codeHash");

-- CreateIndex
CREATE INDEX "minecraft_connect_sessions_uuid_createdAt_idx" ON "minecraft_connect_sessions"("uuid", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "email_verifications_mcSessionId_key" ON "email_verifications"("mcSessionId");

-- AddForeignKey
ALTER TABLE "minecraft_accounts" ADD CONSTRAINT "minecraft_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

