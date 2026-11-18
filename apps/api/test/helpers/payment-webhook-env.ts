/// Побочный эффект при импорте: задаёт PAYMENT_WEBHOOK_SECRET ДО загрузки
/// AppModule (ConfigModule читает process.env при импорте). Дефолта секрета в
/// схеме нет (ADR-0157), поэтому e2e сами задают его и CI не меняется.
/// Импортировать первым в e2e-файле, создающем приложение.
export const E2E_PAYMENT_WEBHOOK_SECRET = 'e2e-payment-webhook-secret-not-real';
process.env.PAYMENT_WEBHOOK_SECRET = E2E_PAYMENT_WEBHOOK_SECRET;
