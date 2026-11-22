-- Журнал кошелька 0.15 (ADR-0191). Expand-only (Q28): новый enum, одна новая
-- таблица, индексы, триггер неизменяемости; существующие таблицы и данные не
-- меняются, без DROP/rename/сужения. Без внешних ключей намеренно.
-- Не применять на production без ревью владельца.

-- CreateEnum
CREATE TYPE "WalletEntryKind" AS ENUM ('PURCHASE', 'ADMIN_ADJUST', 'REFUND_REVERSAL', 'REFUND_RESTORE');

-- CreateTable
CREATE TABLE "wallet_ledger_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" "WalletCurrency" NOT NULL DEFAULT 'RUBY',
    "amount" BIGINT NOT NULL,
    "balanceAfter" BIGINT NOT NULL,
    "kind" "WalletEntryKind" NOT NULL,
    "idempotencyKey" VARCHAR(160) NOT NULL,
    "reason" VARCHAR(500),
    "actorId" TEXT,
    "orderId" TEXT,
    "orderItemId" TEXT,
    "refundId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_ledger_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wallet_ledger_entries_amount_nonzero" CHECK ("amount" <> 0),
    CONSTRAINT "wallet_ledger_entries_balance_nonneg" CHECK ("balanceAfter" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_ledger_entries_idempotencyKey_key" ON "wallet_ledger_entries"("idempotencyKey");

-- CreateIndex
CREATE INDEX "wallet_ledger_entries_userId_createdAt_id_idx" ON "wallet_ledger_entries"("userId", "createdAt" DESC, "id");

-- CreateIndex
CREATE INDEX "wallet_ledger_entries_orderId_idx" ON "wallet_ledger_entries"("orderId");

-- CreateIndex
CREATE INDEX "wallet_ledger_entries_refundId_idx" ON "wallet_ledger_entries"("refundId");

-- Журнал append-only: UPDATE и DELETE отклоняются на уровне БД.
CREATE FUNCTION "wallet_ledger_entries_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'wallet_ledger_entries is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "wallet_ledger_entries_no_change"
  BEFORE UPDATE OR DELETE ON "wallet_ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION "wallet_ledger_entries_immutable"();
