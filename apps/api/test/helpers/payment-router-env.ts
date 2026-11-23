/// Побочный эффект при импорте: включает маршрутизатор способов оплаты (0.8b)
/// ДО загрузки AppModule (ConfigModule читает process.env при импорте).
/// SBERPAY намеренно не включён (проверка «способ выключен»). Импортировать
/// первым в e2e-файле; в afterAll вызвать `restorePaymentRouterEnv()`.
export const E2E_PAYMENT_METHODS =
  'SBP:mock-ru,CARD_RU:mock-ru,CRYPTO:mock-crypto,CARD_FOREIGN:mock-foreign';
const previous = process.env.PAYMENT_METHODS;
process.env.PAYMENT_METHODS = E2E_PAYMENT_METHODS;

export function restorePaymentRouterEnv(): void {
  if (previous === undefined) {
    delete process.env.PAYMENT_METHODS;
  } else {
    process.env.PAYMENT_METHODS = previous;
  }
}
