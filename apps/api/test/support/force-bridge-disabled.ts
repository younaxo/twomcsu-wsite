/// Побочный эффект при импорте: задаёт `BRIDGE_ENABLED=false` ДО загрузки
/// `AppModule`. `ConfigModule.forRoot` валидирует и кэширует env в момент
/// импорта модуля приложения, поэтому подмена process.env после импорта до
/// ConfigService не доходит. Эту спеку нужно импортировать первой строкой.
/// Значение возвращается в `afterAll` через `restoreBridgeEnabled`.
const previous = process.env.BRIDGE_ENABLED;
process.env.BRIDGE_ENABLED = 'false';

export function restoreBridgeEnabled(): void {
  if (previous === undefined) delete process.env.BRIDGE_ENABLED;
  else process.env.BRIDGE_ENABLED = previous;
}
