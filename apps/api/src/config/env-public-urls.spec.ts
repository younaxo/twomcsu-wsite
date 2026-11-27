import { envValidationSchema } from './env.validation';

/// R176 / Q114 (0.10): в production публичные адреса обязательны, https и не
/// localhost; булевы флаги выдачи строгие; dev/test без изменений.
const validate = (v: Record<string, unknown>) =>
  envValidationSchema.validate(v, { allowUnknown: true, abortEarly: false });

const prod: Record<string, unknown> = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  TRUST_PROXY: '1',
  TURNSTILE_SECRET_KEY: 'secret',
  COOKIE_SECURE: 'true',
  COOKIE_DOMAIN: '.twomc.su',
  TWO_FACTOR_ENCRYPTION_KEY: 'k'.repeat(32),
  WEB_ORIGIN: 'https://twomc.su',
  FRONTEND_URL: 'https://twomc.su',
  CDN_BASE_URL: 'https://cdn-files.twomc.su',
};

const without = (v: Record<string, unknown>, key: string) => {
  const copy = { ...v };
  delete copy[key];
  return copy;
};

describe('production: публичные адреса (R176)', () => {
  it('полный https-набор проходит', () => {
    expect(validate(prod).error).toBeUndefined();
  });

  it.each(['WEB_ORIGIN', 'FRONTEND_URL', 'CDN_BASE_URL'])(
    '%s обязателен',
    (key) => {
      expect(validate(without(prod, key)).error).toBeDefined();
    },
  );

  it.each(['WEB_ORIGIN', 'FRONTEND_URL', 'CDN_BASE_URL'])(
    '%s: localhost, 127.0.0.1, 0.0.0.0, [::1] отвергаются',
    (key) => {
      for (const url of [
        'https://localhost:3000',
        'https://127.0.0.1',
        'https://0.0.0.0',
        'https://[::1]/x',
        'https://app.localhost',
      ]) {
        expect(validate({ ...prod, [key]: url }).error).toBeDefined();
      }
    },
  );

  it.each(['WEB_ORIGIN', 'FRONTEND_URL', 'CDN_BASE_URL'])(
    '%s: http отвергается',
    (key) => {
      expect(
        validate({ ...prod, [key]: 'http://twomc.su' }).error?.message,
      ).toMatch(/https/);
    },
  );

  it('WEB_ORIGIN можно опустить, если задан WEB_ORIGINS', () => {
    const v = {
      ...without(prod, 'WEB_ORIGIN'),
      WEB_ORIGINS: 'https://twomc.su,https://www.twomc.su',
    };
    expect(validate(v).error).toBeUndefined();
  });

  it('WEB_ORIGINS: http или localhost в списке отвергается', () => {
    expect(
      validate({ ...prod, WEB_ORIGINS: 'https://twomc.su,http://twomc.su' })
        .error,
    ).toBeDefined();
    expect(
      validate({ ...prod, WEB_ORIGINS: 'https://twomc.su,https://localhost' })
        .error,
    ).toBeDefined();
  });

  it('пустой и не заданный NODE_ENV = production: localhost отвергается', () => {
    for (const nodeEnv of ['', undefined]) {
      const v = { ...prod, NODE_ENV: nodeEnv };
      if (nodeEnv === undefined) delete v.NODE_ENV;
      expect(validate(v).error).toBeUndefined();
      expect(
        validate({ ...v, WEB_ORIGIN: 'http://localhost:3000' }).error,
      ).toBeDefined();
      expect(without(v, 'FRONTEND_URL')).not.toHaveProperty('FRONTEND_URL');
      expect(validate(without(v, 'FRONTEND_URL')).error).toBeDefined();
    }
  });

  describe('redirect URI соцвхода', () => {
    it('провайдеры не настроены: URI не нужны', () => {
      expect(validate(prod).error).toBeUndefined();
      expect(validate(prod).value.DISCORD_REDIRECT_URI).toBeUndefined();
    });

    it('Discord настроен: URI обязателен и https', () => {
      const v = { ...prod, DISCORD_CLIENT_ID: '123' };
      expect(validate(v).error).toBeDefined();
      expect(
        validate({ ...v, DISCORD_REDIRECT_URI: 'https://api.twomc.su/cb' })
          .error,
      ).toBeUndefined();
      expect(
        validate({
          ...v,
          DISCORD_REDIRECT_URI: 'http://localhost:4000/auth/discord/callback',
        }).error,
      ).toBeDefined();
    });

    it('Telegram настроен (client id или bot token): URI обязателен', () => {
      for (const extra of [
        { TELEGRAM_CLIENT_ID: '1' },
        { TELEGRAM_BOT_TOKEN: '1:abc' },
      ]) {
        const v = { ...prod, ...extra };
        expect(validate(v).error).toBeDefined();
        expect(
          validate({ ...v, TELEGRAM_REDIRECT_URI: 'https://api.twomc.su/t' })
            .error,
        ).toBeUndefined();
        expect(
          validate({ ...v, TELEGRAM_REDIRECT_URI: 'http://api.twomc.su/t' })
            .error,
        ).toBeDefined();
      }
    });

    it('заданный localhost-URI отвергается даже без провайдера', () => {
      expect(
        validate({
          ...prod,
          TELEGRAM_REDIRECT_URI: 'https://127.0.0.1/cb',
        }).error,
      ).toBeDefined();
    });
  });

  it('GIVEAWAY_ONLY: публичные адреса не требуются', () => {
    const only = {
      NODE_ENV: 'production',
      TRUST_PROXY: '1',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      GIVEAWAY_ONLY: 'true',
      GIVEAWAY_ENABLED: 'true',
      GIVEAWAY_MASTER_SECRET: Buffer.from(
        Array.from({ length: 32 }, (_, i) => i * 7 + 3),
      ).toString('latin1'),
    };
    expect(validate(only).error).toBeUndefined();
  });
});

describe('development и test без изменений', () => {
  const dev = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    TURNSTILE_DISABLED: 'true',
  };

  it.each(['development', 'test'])('%s: дефолты localhost', (nodeEnv) => {
    const { error, value } = validate({ ...dev, NODE_ENV: nodeEnv });
    expect(error).toBeUndefined();
    expect(value.WEB_ORIGIN).toBe('http://localhost:3000');
    expect(value.FRONTEND_URL).toBe('http://localhost:3000');
    expect(value.CDN_BASE_URL).toBe('http://localhost:4000/uploads');
    expect(value.DISCORD_REDIRECT_URI).toBe(
      'http://localhost:4000/auth/discord/callback',
    );
    expect(value.TELEGRAM_REDIRECT_URI).toBe(
      'http://localhost:4000/auth/telegram/callback',
    );
  });

  it.each(['development', 'test'])('%s: http и localhost допустимы', (e) => {
    expect(
      validate({
        ...dev,
        NODE_ENV: e,
        WEB_ORIGIN: 'http://127.0.0.1:3000',
        FRONTEND_URL: 'http://localhost:3000',
        CDN_BASE_URL: 'http://0.0.0.0:4000/uploads',
      }).error,
    ).toBeUndefined();
  });
});

describe('булевы флаги выдачи: строго true/false', () => {
  const flags = [
    'BRIDGE_DELIVERY_ENABLED',
    'BRIDGE_DELIVERY_JOB_CLEANUP_ENABLED',
    'STORE_DELIVERY_ENABLED',
    'DELIVERY_RECONCILE_ENABLED',
    'PRISMA_DEBUG',
  ];
  const test = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    TURNSTILE_DISABLED: 'true',
  };

  it.each(flags)('%s: true/false принимаются', (key) => {
    expect(validate({ ...test, [key]: 'true' }).error).toBeUndefined();
    expect(validate({ ...test, [key]: 'false' }).error).toBeUndefined();
  });

  it.each(flags)('%s: опечатки отвергаются', (key) => {
    for (const typo of ['flase', 'ture', '1', 'yes', 'off']) {
      expect(validate({ ...test, [key]: typo }).error).toBeDefined();
    }
  });

  it('значения по умолчанию прежние', () => {
    const { value } = validate(test);
    expect(value.BRIDGE_DELIVERY_ENABLED).toBe(false);
    expect(value.BRIDGE_DELIVERY_JOB_CLEANUP_ENABLED).toBeUndefined();
    expect(value.STORE_DELIVERY_ENABLED).toBeUndefined();
    expect(value.DELIVERY_RECONCILE_ENABLED).toBeUndefined();
  });

  it('BRIDGE_DELIVERY_JOB_RETENTION_DAYS: 14..3650', () => {
    for (const ok of ['14', '30', '3650', '']) {
      expect(
        validate({ ...test, BRIDGE_DELIVERY_JOB_RETENTION_DAYS: ok }).error,
      ).toBeUndefined();
    }
    for (const bad of ['13', '0', '3651', 'abc', '14.5']) {
      expect(
        validate({ ...test, BRIDGE_DELIVERY_JOB_RETENTION_DAYS: bad }).error,
      ).toBeDefined();
    }
  });
});
