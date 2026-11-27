import { envValidationSchema } from './env.validation';

const common = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};
const productionSet = {
  ...common,
  TRUST_PROXY: '1',
  COOKIE_SECURE: 'true',
  COOKIE_DOMAIN: '.twomc.su',
  WEB_ORIGIN: 'https://twomc.su',
  FRONTEND_URL: 'https://twomc.su',
  CDN_BASE_URL: 'https://cdn-files.twomc.su',
  TWO_FACTOR_ENCRYPTION_KEY: 'x'.repeat(40),
  TURNSTILE_SECRET_KEY: 'test-secret',
};

const validate = (v: Record<string, unknown>) =>
  envValidationSchema.validate(v, { allowUnknown: true });

describe('envValidationSchema QUICK_BUY_ENABLED (0.5, ADR-0186 Р5)', () => {
  it.each(['development', 'test'])('по умолчанию включён в %s', (NODE_ENV) => {
    const { error, value } = validate({
      ...common,
      NODE_ENV,
      TURNSTILE_DISABLED: 'true',
    });
    expect(error).toBeUndefined();
    expect(value.QUICK_BUY_ENABLED).toBe(true);
  });

  it('по умолчанию выключен в production', () => {
    const { error, value } = validate({
      ...productionSet,
      NODE_ENV: 'production',
    });
    expect(error).toBeUndefined();
    expect(value.QUICK_BUY_ENABLED).toBe(false);
  });

  it('пустой/не заданный NODE_ENV считается production: выключен', () => {
    const { error, value } = validate({ ...productionSet });
    expect(error).toBeUndefined();
    expect(value.QUICK_BUY_ENABLED).toBe(false);
  });

  it('в production включается только явным true', () => {
    const { value } = validate({
      ...productionSet,
      NODE_ENV: 'production',
      QUICK_BUY_ENABLED: 'true',
    });
    expect(value.QUICK_BUY_ENABLED).toBe(true);
  });

  it('в test явный false выключает', () => {
    const { value } = validate({
      ...common,
      NODE_ENV: 'test',
      TURNSTILE_DISABLED: 'true',
      QUICK_BUY_ENABLED: 'false',
    });
    expect(value.QUICK_BUY_ENABLED).toBe(false);
  });
});

describe('envValidationSchema UNPUNISH_ENABLED (0.12b, ADR-0190)', () => {
  it('в test включён по умолчанию', () => {
    const { error, value } = validate({
      ...common,
      NODE_ENV: 'test',
      TURNSTILE_DISABLED: 'true',
    });
    expect(error).toBeUndefined();
    expect(value.UNPUNISH_ENABLED).toBe(true);
  });

  it('в development включён', () => {
    expect(
      validate({
        ...common,
        NODE_ENV: 'development',
        TURNSTILE_DISABLED: 'true',
      }).value.UNPUNISH_ENABLED,
    ).toBe(true);
  });

  it('в production и при пустом NODE_ENV выключен', () => {
    expect(
      validate({ ...productionSet, NODE_ENV: 'production' }).value
        .UNPUNISH_ENABLED,
    ).toBe(false);
    expect(validate({ ...productionSet }).value.UNPUNISH_ENABLED).toBe(false);
  });

  it('в production включается только явным true', () => {
    expect(
      validate({
        ...productionSet,
        NODE_ENV: 'production',
        UNPUNISH_ENABLED: 'true',
      }).value.UNPUNISH_ENABLED,
    ).toBe(true);
  });
});
