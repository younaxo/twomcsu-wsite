/// Детерминированный OTP для разработки и автотестов (ADR-0087).
///
/// Работает ТОЛЬКО на backend и ТОЛЬКО при двух условиях одновременно:
/// `AUTH_TEST_OTP_ENABLED=true` и `NODE_ENV !== 'production'`. Схема env
/// (`env.validation.ts`) дополнительно не даёт запустить production с
/// включённым флагом. В клиентский bundle ничего из этого не попадает.
///
/// - `123456` — код считается верным для любой корректной заявки;
/// - `000000` — гарантированный отказ (обычная ошибка «неверный код»), даже
///   если случайно совпал с настоящим кодом;
/// - любой другой код — обычная проверка.
export const TEST_OTP_ACCEPT = '123456';
export const TEST_OTP_REJECT = '000000';

export type TestOtpOutcome = 'accept' | 'reject' | null;

export function testOtpEnabled(env: {
  nodeEnv: string | undefined;
  flag: unknown;
}): boolean {
  if (env.nodeEnv === 'production') return false;
  return env.flag === true || env.flag === 'true';
}

export function testOtpOutcome(
  code: string,
  env: { nodeEnv: string | undefined; flag: unknown },
): TestOtpOutcome {
  if (!testOtpEnabled(env)) return null;
  if (code === TEST_OTP_ACCEPT) return 'accept';
  if (code === TEST_OTP_REJECT) return 'reject';
  return null;
}
