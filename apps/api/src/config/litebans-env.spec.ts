import { envValidationSchema } from './env.validation';

const base = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  TURNSTILE_DISABLED: 'true',
};

const prod: Record<string, unknown> = {
  ...base,
  NODE_ENV: 'production',
  TRUST_PROXY: '1',
  TURNSTILE_DISABLED: 'false',
  TURNSTILE_SECRET_KEY: 'test-secret',
  COOKIE_SECURE: 'true',
  COOKIE_DOMAIN: '.twomc.su',
  TWO_FACTOR_ENCRYPTION_KEY: 'k'.repeat(32),
};

const validate = (v: Record<string, unknown>) =>
  envValidationSchema.validate(v, { allowUnknown: true });

describe('envValidationSchema: LITEBANS_* (этап 02, ADR-0166)', () => {
  it('без переменных LITEBANS production не падает, интеграция выключена', () => {
    const { error, value } = validate(prod);
    expect(error).toBeUndefined();
    expect(value.LITEBANS_ENABLED).toBe(false);
    expect(value.LITEBANS_DB_PASSWORD).toBeUndefined();
    expect(value.LITEBANS_DB_HOST).toBeUndefined();
  });

  it('в test без переменных LITEBANS проходит', () => {
    expect(validate(base).error).toBeUndefined();
  });

  it('пустые значения допустимы', () => {
    expect(
      validate({
        ...prod,
        LITEBANS_DB_HOST: '',
        LITEBANS_DB_USER: '',
        LITEBANS_DB_PASSWORD: '',
        LITEBANS_DB_SSL: '',
        LITEBANS_DB_SSL_CA_FILE: '',
      }).error,
    ).toBeUndefined();
  });

  it('production отвергает LITEBANS_DB_SSL=disabled', () => {
    expect(
      validate({ ...prod, LITEBANS_DB_SSL: 'disabled' }).error?.message,
    ).toMatch(/LITEBANS_DB_SSL=disabled запрещён в production/);
  });

  it.each(['development', 'test'])(
    '%s допускает LITEBANS_DB_SSL=disabled',
    (env) => {
      expect(
        validate({ ...base, NODE_ENV: env, LITEBANS_DB_SSL: 'disabled' }).error,
      ).toBeUndefined();
    },
  );

  it('LITEBANS_DB_SSL: мусорное значение отвергается', () => {
    expect(validate({ ...base, LITEBANS_DB_SSL: 'maybe' }).error).toBeDefined();
  });

  it('production при LITEBANS_ENABLED=true без CA-файла отвергается', () => {
    expect(
      validate({
        ...prod,
        LITEBANS_ENABLED: 'true',
        LITEBANS_DB_SSL: 'required',
      }).error?.message,
    ).toMatch(/LITEBANS_DB_SSL_CA_FILE обязателен/);
    expect(
      validate({
        ...prod,
        LITEBANS_ENABLED: 'true',
        LITEBANS_DB_SSL_CA_FILE: '',
      }).error?.message,
    ).toMatch(/LITEBANS_DB_SSL_CA_FILE обязателен/);
  });

  it('production при LITEBANS_ENABLED=true с CA-файлом проходит', () => {
    expect(
      validate({
        ...prod,
        LITEBANS_ENABLED: 'true',
        LITEBANS_DB_SSL: 'required',
        LITEBANS_DB_SSL_CA_FILE: '/etc/ssl/litebans-ca.pem',
      }).error,
    ).toBeUndefined();
  });

  it('production при LITEBANS_ENABLED=false CA-файл не требуется', () => {
    expect(
      validate({ ...prod, LITEBANS_ENABLED: 'false' }).error,
    ).toBeUndefined();
  });

  it('драйвер: только mysql', () => {
    expect(
      validate({ ...base, LITEBANS_DB_DRIVER: 'mysql' }).error,
    ).toBeUndefined();
    expect(
      validate({ ...base, LITEBANS_DB_DRIVER: 'postgres' }).error,
    ).toBeDefined();
  });

  it.each([
    ['LITEBANS_TABLE_PREFIX', 'lite bans;'],
    ['LITEBANS_TABLE_PREFIX', 'a'.repeat(33)],
    ['LITEBANS_POLL_INTERVAL_MS', '100'],
    ['LITEBANS_POLL_INTERVAL_MS', '20000'],
    ['LITEBANS_BATCH_SIZE', '5000'],
    ['LITEBANS_DB_PORT', '70000'],
  ])('%s=%s отвергается', (name, value) => {
    expect(validate({ ...base, [name]: value }).error).toBeDefined();
  });

  it('допустимые границы принимаются', () => {
    expect(
      validate({
        ...base,
        LITEBANS_TABLE_PREFIX: 'litebans_',
        LITEBANS_POLL_INTERVAL_MS: '1500',
        LITEBANS_BATCH_SIZE: '500',
        LITEBANS_ACTIVE_CHECK_INTERVAL_S: '15',
        LITEBANS_RECONCILE_INTERVAL_MIN: '60',
        LITEBANS_DB_CONNECT_TIMEOUT_MS: '5000',
        LITEBANS_DB_QUERY_TIMEOUT_MS: '5000',
        LITEBANS_DB_PORT: '3306',
      }).error,
    ).toBeUndefined();
  });
});
