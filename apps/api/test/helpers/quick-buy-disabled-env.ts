/// Побочный эффект при импорте: выключает quick-buy (QUICK_BUY_ENABLED=false) ДО
/// загрузки AppModule (ConfigModule читает process.env при импорте). Импортировать
/// первым в e2e-файле; в afterAll вызвать `restoreQuickBuyEnv()`, чтобы значение не
/// повлияло на следующие файлы (jest --runInBand делит process.env).
const previous = process.env.QUICK_BUY_ENABLED;
process.env.QUICK_BUY_ENABLED = 'false';

export function restoreQuickBuyEnv(): void {
  if (previous === undefined) {
    delete process.env.QUICK_BUY_ENABLED;
  } else {
    process.env.QUICK_BUY_ENABLED = previous;
  }
}
