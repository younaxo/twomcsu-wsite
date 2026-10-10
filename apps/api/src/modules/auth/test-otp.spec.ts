import { createHmac } from 'crypto';
import { envValidationSchema } from '../../config/env.validation';
import { RegistrationService } from './registration.service';
import { TEST_OTP_ACCEPT, TEST_OTP_REJECT, testOtpOutcome } from './test-otp';

const SECRET = 'unit-secret';

/// RegistrationService с подменёнными зависимостями: проверяем только verify().
function makeService(env: Record<string, unknown>, realCode: string) {
  const record = {
    id: 'ver_1',
    email: 'player@example.com',
    verifiedAt: null,
    consumedAt: null,
    attempts: 0,
    expiresAt: new Date(Date.now() + 60_000),
    codeHash: createHmac('sha256', SECRET)
      .update(`otp:ver_1:${realCode}`)
      .digest('hex'),
  };
  const update = jest.fn(async () => ({ ...record, attempts: 1 }));
  const prisma = {
    emailVerification: {
      findUnique: jest.fn(async () => record),
      update,
    },
  };
  const config = {
    get: (key: string, fallback?: unknown) =>
      key === 'JWT_REFRESH_SECRET' ? SECRET : (env[key] ?? fallback),
  };
  const minecraft = { required: () => true };
  const service = new RegistrationService(
    prisma as never,
    config as never,
    {} as never,
    {} as never,
    {} as never,
    minecraft as never,
  );
  return { service, update };
}

const verify = (service: RegistrationService, code: string) =>
  service.verify({ verificationId: 'ver_1', code });

describe('тестовый OTP (ADR-0087)', () => {
  it('чистое правило: только dev/test и только с флагом', () => {
    const dev = { nodeEnv: 'development', flag: true };
    expect(testOtpOutcome(TEST_OTP_ACCEPT, dev)).toBe('accept');
    expect(testOtpOutcome(TEST_OTP_REJECT, dev)).toBe('reject');
    expect(testOtpOutcome('654321', dev)).toBeNull();
    expect(
      testOtpOutcome(TEST_OTP_ACCEPT, { nodeEnv: 'test', flag: 'true' }),
    ).toBe('accept');
    expect(
      testOtpOutcome(TEST_OTP_ACCEPT, { nodeEnv: 'development', flag: false }),
    ).toBeNull();
    expect(
      testOtpOutcome(TEST_OTP_ACCEPT, { nodeEnv: 'production', flag: true }),
    ).toBeNull();
  });

  it('DEV: 123456 → почта подтверждена (без настоящего кода)', async () => {
    const { service, update } = makeService(
      { NODE_ENV: 'development', AUTH_TEST_OTP_ENABLED: true },
      '654321',
    );
    const result = await verify(service, TEST_OTP_ACCEPT);
    expect(result.completionToken).toMatch(/^[0-9a-f]{64}$/);
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ verifiedAt: expect.any(Date) }),
      }),
    );
  });

  it('DEV: 000000 → гарантированный отказ, даже если совпал с настоящим кодом', async () => {
    const { service } = makeService(
      { NODE_ENV: 'development', AUTH_TEST_OTP_ENABLED: true },
      TEST_OTP_REJECT,
    );
    await expect(verify(service, TEST_OTP_REJECT)).rejects.toMatchObject({
      response: { code: 'otp_invalid' },
    });
  });

  it('DEV без флага: 123456 — обычная проверка (отказ)', async () => {
    const { service } = makeService({ NODE_ENV: 'development' }, '654321');
    await expect(verify(service, TEST_OTP_ACCEPT)).rejects.toMatchObject({
      response: { code: 'otp_invalid' },
    });
  });

  it('PRODUCTION: 123456 → обычная проверка кода, никакого bypass (даже с флагом)', async () => {
    const env = { NODE_ENV: 'production', AUTH_TEST_OTP_ENABLED: true };
    const wrong = makeService(env, '654321');
    await expect(verify(wrong.service, TEST_OTP_ACCEPT)).rejects.toMatchObject({
      response: { code: 'otp_invalid' },
    });
    // Настоящий код в production по-прежнему работает.
    const right = makeService(env, '654321');
    await expect(verify(right.service, '654321')).resolves.toMatchObject({
      minecraftRequired: true,
    });
  });

  it('env: production с AUTH_TEST_OTP_ENABLED=true не проходит валидацию; по умолчанию — false', () => {
    const base = {
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      TURNSTILE_DISABLED: 'true',
    };
    const messages = (env: Record<string, string>) =>
      (
        envValidationSchema.validate(env, { abortEarly: false }).error
          ?.details ?? []
      ).map((detail) => detail.message);
    expect(
      messages({
        ...base,
        NODE_ENV: 'production',
        AUTH_TEST_OTP_ENABLED: 'true',
      }),
    ).toContain('AUTH_TEST_OTP_ENABLED запрещён в production');
    expect(
      messages({
        ...base,
        NODE_ENV: 'production',
        AUTH_TEST_OTP_ENABLED: 'false',
      }),
    ).not.toContain('AUTH_TEST_OTP_ENABLED запрещён в production');
    const dev = envValidationSchema.validate(
      { ...base, NODE_ENV: 'development' },
      { abortEarly: false },
    );
    expect(dev.value.AUTH_TEST_OTP_ENABLED).toBe(false);
  });
});
