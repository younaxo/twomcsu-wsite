/// Побочный эффект при импорте: включает STORE_REFUNDS_ENABLED ДО загрузки
/// AppModule (ConfigModule читает process.env при импорте). По умолчанию флаг
/// выключен (ADR-0188), поэтому e2e возвратов включают его сами.
process.env.STORE_REFUNDS_ENABLED = 'true';
