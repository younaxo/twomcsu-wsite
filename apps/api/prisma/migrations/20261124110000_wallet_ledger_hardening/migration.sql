-- Журнал кошелька 0.15, доработка по ревью Security (ADR-0191). Expand-only
-- (Q28): новое значение enum и один триггер; данные и существующие объекты не
-- меняются, без DROP/rename/сужения. Миграция 20261124100000 не тронута.
-- Не применять на production без ревью владельца.

-- Начальный остаток: проводка, сводящая уже существующие wallets.balance
-- (RUBY) с журналом до включения WALLET_LEDGER_ENABLED (docs/runbooks/wallet-ledger.md).
-- Значение enum в этой миграции не используется (ограничение PostgreSQL).
ALTER TYPE "WalletEntryKind" ADD VALUE IF NOT EXISTS 'OPENING_BALANCE';

-- Журнал append-only и для TRUNCATE (UPDATE/DELETE закрыты триггером из
-- 20261124100000). Функция уже существует и всегда бросает исключение.
CREATE TRIGGER "wallet_ledger_entries_no_truncate"
  BEFORE TRUNCATE ON "wallet_ledger_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION "wallet_ledger_entries_immutable"();
