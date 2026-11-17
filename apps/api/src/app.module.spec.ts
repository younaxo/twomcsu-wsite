import 'reflect-metadata';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { IpSubnetThrottlerGuard } from './common/guards/ip-subnet-throttler.guard';

// multer не объявлен в package.json api (только @types/multer; Q55) и под строгим
// pnpm недоступен из apps/api, а files.controller импортирует его при загрузке
// AppModule. Тест проверяет только метаданные модуля, поэтому multer подменяется
// виртуальным моком (не требует установленного пакета). Зависимости не менялись.
jest.mock('multer', () => ({ memoryStorage: jest.fn() }), { virtual: true });

// ConfigModule.forRoot валидирует env при загрузке app.module, поэтому на время
// импорта подставляются заведомо фиктивные значения (БД и Redis не нужны:
// модуль только читается через метаданные, приложение не создаётся).
const FAKE_ENV: Record<string, string> = {
  DATABASE_URL: 'postgresql://fake:fake@localhost:5432/fake',
  JWT_ACCESS_SECRET: 'fake-access-secret-for-module-metadata-test-0000',
  JWT_REFRESH_SECRET: 'fake-refresh-secret-for-module-metadata-test-000',
  TURNSTILE_SECRET_KEY: 'fake-turnstile-key',
};

function loadAppModule(): unknown {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(FAKE_ENV)) {
    saved[k] = process.env[k];
    process.env[k] ??= v;
  }
  try {
    let mod: unknown;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = (require('./app.module') as { AppModule: unknown }).AppModule;
    });
    return mod;
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe('AppModule: глобальный throttler (Q21)', () => {
  it('APP_GUARD для throttler — IpSubnetThrottlerGuard, а не стандартный ThrottlerGuard', () => {
    const appModule = loadAppModule() as object;
    const providers = Reflect.getMetadata('providers', appModule) as Array<{
      provide?: unknown;
      useClass?: { name: string };
    }>;
    const classes = providers
      .filter((p) => p?.provide === APP_GUARD)
      .map((p) => p.useClass);
    expect(classes.map((c) => c?.name)).toEqual(['IpSubnetThrottlerGuard']);
    expect(Object.getPrototypeOf(IpSubnetThrottlerGuard)).toBe(ThrottlerGuard);
  });
});
