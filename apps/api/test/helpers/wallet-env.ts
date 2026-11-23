/// Побочный эффект при импорте: включает WALLET_LEDGER_ENABLED ДО загрузки
/// AppModule (ConfigModule читает process.env при импорте). По умолчанию флаг
/// выключен (ADR-0191), поэтому e2e кошелька включают его сами.
process.env.WALLET_LEDGER_ENABLED = 'true';
process.env.WALLET_ADJUST_MAX = '1000';
