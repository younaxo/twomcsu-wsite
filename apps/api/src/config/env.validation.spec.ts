import { envValidationSchema } from './env.validation';

const base = {
  NODE_ENV: 'test',
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
    TRUST_PROXY: '1',
    TURNSTILE_DISABLED: 'false',
    TURNSTILE_SECRET_KEY: 'test-secret',
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
    const { value } = validate({
      ...base,
      PAYMENT_WEBHOOK_SECRET: 's'.repeat(32),
    });
    expect(value.PAYMENT_WEBHOOK_SECRET).toBe('s'.repeat(32));
  });
});

describe('envValidationSchema production startup check (TRUST_PROXY, Turnstile)', () => {
  const prod: Record<string, unknown> = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    NODE_ENV: 'production',
    TRUST_PROXY: '1',
    COOKIE_SECURE: 'true',
    COOKIE_DOMAIN: '.twomc.su',
    TWO_FACTOR_ENCRYPTION_KEY: 'x'.repeat(40),
    TURNSTILE_SECRET_KEY: 'test-secret',
  };
  const validate = (v: Record<string, unknown>) =>
    envValidationSchema.validate(v, { allowUnknown: true });

  it('полный корректный production-набор проходит', () => {
    expect(validate(prod).error).toBeUndefined();
  });

  it.each([
    'TRUST_PROXY',
    'TURNSTILE_SECRET_KEY',
    'COOKIE_SECURE',
    'COOKIE_DOMAIN',
    'TWO_FACTOR_ENCRYPTION_KEY',
  ])('production без %s отвергается', (name) => {
    const copy = { ...prod };
    delete copy[name];
    expect(validate(copy).error?.message).toMatch(new RegExp(name));
  });

  it.each(['TRUST_PROXY', 'TURNSTILE_SECRET_KEY'])(
    'production с пустым %s отвергается',
    (name) => {
      expect(validate({ ...prod, [name]: '' }).error?.message).toMatch(
        new RegExp(name),
      );
    },
  );

  it('production: мусорный TRUST_PROXY по-прежнему отвергается', () => {
    expect(validate({ ...prod, TRUST_PROXY: '*' }).error?.message).toMatch(
      /TRUST_PROXY/,
    );
  });

  it('production: TURNSTILE_DISABLED=true запрещён', () => {
    expect(
      validate({ ...prod, TURNSTILE_DISABLED: 'true' }).error?.message,
    ).toMatch(/TURNSTILE_DISABLED запрещён в production/);
    const copy: Record<string, unknown> = {
      ...prod,
      TURNSTILE_DISABLED: 'true',
    };
    delete copy.TURNSTILE_SECRET_KEY;
    expect(validate(copy).error).toBeDefined();
  });

  it.each(['development', 'test'])(
    '%s без TRUST_PROXY и с TURNSTILE_DISABLED=true проходит',
    (env) => {
      const { error } = validate({
        DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
        JWT_ACCESS_SECRET: 'a'.repeat(32),
        JWT_REFRESH_SECRET: 'b'.repeat(32),
        NODE_ENV: env,
        TURNSTILE_DISABLED: 'true',
      });
      expect(error).toBeUndefined();
    },
  );
});

describe('envValidationSchema NODE_ENV fail-closed (ADR-0164)', () => {
  const minimal = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    TURNSTILE_DISABLED: 'true',
  };
  const validate = (v: Record<string, unknown>) =>
    envValidationSchema.validate(v, { allowUnknown: true });

  it('без NODE_ENV дефолта development нет: нужен production-набор', () => {
    const { error, value } = validate(minimal);
    expect(error).toBeDefined();
    expect((value as Record<string, unknown>).NODE_ENV).toBeUndefined();
  });

  it('пустой NODE_ENV требует production-переменные', () => {
    expect(validate({ ...minimal, NODE_ENV: '' }).error).toBeDefined();
  });

  it('без NODE_ENV полный production-набор проходит', () => {
    expect(
      validate({
        DATABASE_URL: minimal.DATABASE_URL,
        JWT_ACCESS_SECRET: minimal.JWT_ACCESS_SECRET,
        JWT_REFRESH_SECRET: minimal.JWT_REFRESH_SECRET,
        TRUST_PROXY: '1',
        COOKIE_SECURE: 'true',
        COOKIE_DOMAIN: '.twomc.su',
        TWO_FACTOR_ENCRYPTION_KEY: 'x'.repeat(40),
        TURNSTILE_SECRET_KEY: 'test-secret',
      }).error,
    ).toBeUndefined();
  });

  it('без NODE_ENV TURNSTILE_DISABLED=true и AUTH_TEST_OTP_ENABLED=true запрещены', () => {
    const full = {
      DATABASE_URL: minimal.DATABASE_URL,
      JWT_ACCESS_SECRET: minimal.JWT_ACCESS_SECRET,
      JWT_REFRESH_SECRET: minimal.JWT_REFRESH_SECRET,
      TRUST_PROXY: '1',
      COOKIE_SECURE: 'true',
      COOKIE_DOMAIN: '.twomc.su',
      TWO_FACTOR_ENCRYPTION_KEY: 'x'.repeat(40),
      TURNSTILE_SECRET_KEY: 'test-secret',
    };
    expect(
      validate({ ...full, TURNSTILE_DISABLED: 'true' }).error?.message,
    ).toMatch(/TURNSTILE_DISABLED запрещён/);
    expect(
      validate({ ...full, AUTH_TEST_OTP_ENABLED: 'true' }).error?.message,
    ).toMatch(/AUTH_TEST_OTP_ENABLED запрещён/);
  });

  it.each(['development', 'test'])(
    'явный %s не требует production-переменных',
    (env) => {
      expect(validate({ ...minimal, NODE_ENV: env }).error).toBeUndefined();
    },
  );

  it('неизвестное значение NODE_ENV (staging) отвергается схемой', () => {
    expect(validate({ ...minimal, NODE_ENV: 'staging' }).error).toBeDefined();
  });
});

describe('envValidationSchema PRISMA_TX_* (ADR-0183)', () => {
  const validate = (extra: Record<string, unknown>) =>
    envValidationSchema.validate({ ...base, ...extra }, { allowUnknown: true });

  it('по умолчанию 10000/10000', () => {
    const { error, value } = validate({});
    expect(error).toBeUndefined();
    expect(value.PRISMA_TX_MAX_WAIT_MS).toBe(10_000);
    expect(value.PRISMA_TX_TIMEOUT_MS).toBe(10_000);
  });

  it('принимает значения в границах', () => {
    const { error, value } = validate({
      PRISMA_TX_MAX_WAIT_MS: '5000',
      PRISMA_TX_TIMEOUT_MS: '20000',
    });
    expect(error).toBeUndefined();
    expect(value.PRISMA_TX_MAX_WAIT_MS).toBe(5000);
  });

  it.each([
    ['PRISMA_TX_MAX_WAIT_MS', '999'],
    ['PRISMA_TX_MAX_WAIT_MS', '30001'],
    ['PRISMA_TX_TIMEOUT_MS', '999'],
    ['PRISMA_TX_TIMEOUT_MS', '60001'],
    ['PRISMA_TX_TIMEOUT_MS', 'abc'],
  ])('%s=%s отклоняется', (key, val) => {
    expect(validate({ [key]: val }).error).toBeDefined();
  });
});

describe('envValidationSchema PAYMENT_PROVIDER и секреты (ADR-0187)', () => {
  const validate = (v: Record<string, unknown>) =>
    envValidationSchema.validate(v, { allowUnknown: true, abortEarly: false });
  const prod = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    NODE_ENV: 'production',
    TRUST_PROXY: '1',
    TURNSTILE_DISABLED: 'false',
    TURNSTILE_SECRET_KEY: 'test-secret',
    COOKIE_SECURE: 'true',
  };

  it.each(['development', 'test'])('NODE_ENV=%s: по умолчанию test', (env) => {
    const { error, value } = validate({ ...base, NODE_ENV: env });
    expect(error).toBeUndefined();
    expect(value.PAYMENT_PROVIDER).toBe('test');
  });

  it.each(['test', 'mock-http'])('вне production допустим %s', (name) => {
    expect(validate({ ...base, PAYMENT_PROVIDER: name }).error).toBeUndefined();
  });

  it('вне production неизвестный провайдер отвергается', () => {
    const { error } = validate({ ...base, PAYMENT_PROVIDER: 'yookassa' });
    expect(error?.message).toMatch(/PAYMENT_PROVIDER/);
  });

  it.each(['test', 'mock-http'])(
    'production: PAYMENT_PROVIDER=%s отвергается (fail closed)',
    (name) => {
      const { error } = validate({ ...prod, PAYMENT_PROVIDER: name });
      expect(error?.message).toMatch(/PAYMENT_PROVIDER/);
    },
  );

  it('production: пусто или не задано — старт возможен, значение пустое', () => {
    const { error, value } = validate({ ...prod });
    expect(error?.message ?? '').not.toMatch(/PAYMENT_PROVIDER/);
    expect(value.PAYMENT_PROVIDER).toBe('');
  });

  it('пустой NODE_ENV = production: test отвергается', () => {
    const { error } = validate({
      ...base,
      NODE_ENV: '',
      PAYMENT_PROVIDER: 'test',
    });
    expect(error?.message).toMatch(/PAYMENT_PROVIDER/);
  });

  it.each(['PAYMENT_WEBHOOK_SECRET', 'PAYMENT_WEBHOOK_SECRET_PREVIOUS'])(
    '%s короче 32 символов отвергается, пустой допустим',
    (key) => {
      expect(
        validate({ ...base, [key]: 'x'.repeat(31) }).error?.message,
      ).toMatch(new RegExp(key));
      expect(
        validate({ ...base, [key]: 'x'.repeat(32) }).error,
      ).toBeUndefined();
      expect(validate({ ...base, [key]: '' }).error).toBeUndefined();
    },
  );

  it('значения по умолчанию для таймаута и повторов', () => {
    const { value } = validate(base);
    expect(value.PAYMENT_HTTP_TIMEOUT_MS).toBe(5000);
    expect(value.PAYMENT_HTTP_RETRIES).toBe(2);
    expect(validate({ ...base, PAYMENT_HTTP_RETRIES: 6 }).error).toBeDefined();
  });
});
