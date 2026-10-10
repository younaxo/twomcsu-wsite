-- Кошелёк (ADR-0094): агрегат баланса по валюте, только добавление.
CREATE TYPE "WalletCurrency" AS ENUM ('RUB', 'RUBY');

CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" "WalletCurrency" NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wallets_balance_non_negative" CHECK ("balance" >= 0)
);

CREATE UNIQUE INDEX "wallets_userId_currency_key" ON "wallets"("userId", "currency");

ALTER TABLE "wallets" ADD CONSTRAINT "wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
