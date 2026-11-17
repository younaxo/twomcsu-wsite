import { envValidationSchema } from './env.validation';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  TURNSTILE_DISABLED: 'true',
};

describe('envValidationSchema TRUST_PROXY', () => {
  it.each(['true', '*', '0.0.0.0/0', '::/0', '0', '-1'])(
    'отвергает %p',
    (value) => {
      const { error } = envValidationSchema.validate(
        { ...base, TRUST_PROXY: value },
        { allowUnknown: true },
      );
      expect(error).toBeDefined();
      expect(error?.message).toMatch(/TRUST_PROXY/);
    },
  );

  it.each(['', '1', 'loopback'])('принимает %p', (value) => {
    const { error } = envValidationSchema.validate(
      { ...base, TRUST_PROXY: value },
      { allowUnknown: true },
    );
    expect(error).toBeUndefined();
  });
});

describe('envValidationSchema production cookie и 2FA (ADR-0156)', () => {
  const prod: Record<string, unknown> = {
    ...base,
    NODE_ENV: 'production',
    COOKIE_SECURE: 'true',
    COOKIE_DOMAIN: '.twomc.su',
    TWO_FACTOR_ENCRYPTION_KEY: 'k'.repeat(32),
  };
  const validate = (v: Record<string, unknown>) =>
    envValidationSchema.validate(v, { allowUnknown: true });
  const without = (name: string): Record<string, unknown> => {
    const copy = { ...prod };
    delete copy[name];
    return copy;
  };

  it('production с полным набором проходит', () => {
    expect(validate(prod).error).toBeUndefined();
  });

  it('production без COOKIE_SECURE=true отвергается', () => {
    expect(validate(without('COOKIE_SECURE')).error?.message).toMatch(
      /COOKIE_SECURE/,
    );
    expect(
      validate({ ...prod, COOKIE_SECURE: 'false' }).error?.message,
    ).toMatch(/COOKIE_SECURE/);
  });

  it.each(['localhost', '127.0.0.1', '', '.localhost'])(
    'production с COOKIE_DOMAIN=%p отвергается',
    (domain) => {
      expect(
        validate({ ...prod, COOKIE_DOMAIN: domain }).error?.message,
      ).toMatch(/COOKIE_DOMAIN/);
    },
  );

  it('production без COOKIE_DOMAIN отвергается', () => {
    expect(validate(without('COOKIE_DOMAIN')).error?.message).toMatch(
      /COOKIE_DOMAIN/,
    );
  });

  it('production без или с коротким TWO_FACTOR_ENCRYPTION_KEY отвергается', () => {
    expect(
      validate(without('TWO_FACTOR_ENCRYPTION_KEY')).error?.message,
    ).toMatch(/TWO_FACTOR_ENCRYPTION_KEY/);
    expect(
      validate({ ...prod, TWO_FACTOR_ENCRYPTION_KEY: '' }).error?.message,
    ).toMatch(/TWO_FACTOR_ENCRYPTION_KEY/);
    expect(
      validate({ ...prod, TWO_FACTOR_ENCRYPTION_KEY: 'short' }).error?.message,
    ).toMatch(/TWO_FACTOR_ENCRYPTION_KEY/);
  });

  it('production: ключ из одних пробелов отвергается', () => {
    expect(
      validate({ ...prod, TWO_FACTOR_ENCRYPTION_KEY: ' '.repeat(32) }).error
        ?.message,
    ).toMatch(/TWO_FACTOR_ENCRYPTION_KEY/);
  });

  it('production: ключ обрезается по краям (trim)', () => {
    const { error, value } = validate({
      ...prod,
      TWO_FACTOR_ENCRYPTION_KEY: ` ${'k'.repeat(32)} `,
    });
    expect(error).toBeUndefined();
    expect((value as Record<string, unknown>).TWO_FACTOR_ENCRYPTION_KEY).toBe(
      'k'.repeat(32),
    );
  });

  it('production: ключ 31 символ + пробел отвергается', () => {
    expect(
      validate({ ...prod, TWO_FACTOR_ENCRYPTION_KEY: `${'k'.repeat(31)} ` })
        .error?.message,
    ).toMatch(/TWO_FACTOR_ENCRYPTION_KEY/);
  });

  it.each(['development', 'test'])(
    '%s сохраняет дефолты и допускает пустой ключ',
    (env) => {
      const { error, value } = validate({ ...base, NODE_ENV: env });
      expect(error).toBeUndefined();
      const out = value as Record<string, unknown>;
      expect(out.COOKIE_SECURE).toBe(false);
      expect(out.COOKIE_DOMAIN).toBe('localhost');
      expect(out.TWO_FACTOR_ENCRYPTION_KEY).toBe('');
    },
  );

  it('COOKIE_SAMESITE=none без Secure отвергается в любом окружении', () => {
    expect(
      validate({ ...base, NODE_ENV: 'development', COOKIE_SAMESITE: 'none' })
        .error?.message,
    ).toMatch(/COOKIE_SAMESITE/);
    expect(
      validate({
        ...base,
        NODE_ENV: 'development',
        COOKIE_SECURE: 'false',
        COOKIE_SAMESITE: 'none',
      }).error?.message,
    ).toMatch(/COOKIE_SAMESITE/);
  });

  it('COOKIE_SAMESITE=none при Secure=true допускается', () => {
    expect(
      validate({ ...prod, COOKIE_SAMESITE: 'none' }).error,
    ).toBeUndefined();
    expect(
      validate({
        ...base,
        NODE_ENV: 'development',
        COOKIE_SECURE: 'true',
        COOKIE_SAMESITE: 'none',
      }).error,
    ).toBeUndefined();
  });
});

describe('envValidationSchema PAYMENT_WEBHOOK_SECRET (ADR-0157)', () => {
  const validate = (v: Record<string, unknown>) =>
    envValidationSchema.validate(v, { allowUnknown: true });

  it('дефолта секрета нет: по умолчанию пустая строка (вебхуки отклоняются)', () => {
    const { error, value } = validate(base);
    expect(error).toBeUndefined();
    expect(value.PAYMENT_WEBHOOK_SECRET).toBe('');
  });

  it('заданный секрет сохраняется', () => {
    const { value } = validate({ ...base, PAYMENT_WEBHOOK_SECRET: 's3cret' });
    expect(value.PAYMENT_WEBHOOK_SECRET).toBe('s3cret');
  });
});
