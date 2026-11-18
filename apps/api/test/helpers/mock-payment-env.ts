/// Побочный эффект при импорте: настраивает адаптер `mock-http` ДО загрузки
/// AppModule (ConfigModule читает process.env при импорте). Секреты и ключ
/// синтетические, не реальные. Порт мок-сервера задаётся заранее (адрес
/// читается при импорте, сервер стартует позже); вычисляется от pid, чтобы
/// параллельные прогоны не сталкивались. Импортировать ПЕРВЫМ в e2e-файле
/// (после этого helper payment-webhook-env не нужен; настройка применяется
/// при импорте); в afterAll вызвать
/// `restoreMockPaymentEnv()`.
export const MOCK_PROVIDER_PORT = 41000 + (process.pid % 20000);
export const MOCK_WEBHOOK_SECRET =
  'e2e-mock-http-current-secret-not-real-0123456789';
export const MOCK_WEBHOOK_SECRET_PREVIOUS =
  'e2e-mock-http-previous-secret-not-real-0123456789';
export const MOCK_API_KEY = 'e2e-mock-http-api-key-not-real';

const KEYS = [
  'PAYMENT_PROVIDER',
  'PAYMENT_MOCK_BASE_URL',
  'PAYMENT_API_KEY',
  'PAYMENT_WEBHOOK_SECRET',
  'PAYMENT_WEBHOOK_SECRET_PREVIOUS',
  'PAYMENT_HTTP_TIMEOUT_MS',
  'PAYMENT_HTTP_RETRIES',
  'PAYMENT_HTTP_RETRY_DELAY_MS',
] as const;
const previous = new Map<string, string | undefined>(
  KEYS.map((k) => [k, process.env[k]]),
);

export function configureMockPaymentEnv(
  over: Partial<Record<(typeof KEYS)[number], string>> = {},
): void {
  const values: Record<(typeof KEYS)[number], string> = {
    PAYMENT_PROVIDER: 'mock-http',
    PAYMENT_MOCK_BASE_URL: `http://127.0.0.1:${MOCK_PROVIDER_PORT}`,
    PAYMENT_API_KEY: MOCK_API_KEY,
    PAYMENT_WEBHOOK_SECRET: MOCK_WEBHOOK_SECRET,
    PAYMENT_WEBHOOK_SECRET_PREVIOUS: MOCK_WEBHOOK_SECRET_PREVIOUS,
    PAYMENT_HTTP_TIMEOUT_MS: '400',
    PAYMENT_HTTP_RETRIES: '1',
    PAYMENT_HTTP_RETRY_DELAY_MS: '5',
    ...over,
  };
  for (const key of KEYS) {
    process.env[key] = values[key];
  }
}

export function restoreMockPaymentEnv(): void {
  for (const [key, value] of previous) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

configureMockPaymentEnv();
