import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';

// multer не объявлен в package.json api (см. app.module.spec.ts): виртуальный мок.
jest.mock('multer', () => ({ memoryStorage: jest.fn() }), { virtual: true });

const KEYS = [
  'GIVEAWAY_ONLY',
  'NODE_ENV',
  'DATABASE_URL',
  'GIVEAWAY_ENABLED',
  'GIVEAWAY_MASTER_SECRET',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'TWO_FACTOR_ENCRYPTION_KEY',
  'TURNSTILE_SECRET_KEY',
  'COOKIE_DOMAIN',
  'COOKIE_SECURE',
] as const;

/* eslint-disable @typescript-eslint/no-require-imports */
// Всё грузится внутри одного isolateModules: иначе Reflector/Test из другой
// копии @nestjs/core не совпадут с классами AppModule.
type AppModuleExports = {
  AppModule: new () => unknown;
  GIVEAWAY_ONLY: boolean;
  Test: typeof import('@nestjs/testing').Test;
  configureApp: typeof import('../../configure-app').configureApp;
  PrismaService: typeof import('../prisma/prisma.service').PrismaService;
  RedisService: typeof import('../redis/redis.service').RedisService;
  request: typeof import('supertest');
};

function loadAppModule(env: Record<string, string>): AppModuleExports {
  const saved: Record<string, string | undefined> = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  Object.assign(process.env, env);
  try {
    let mod: AppModuleExports | undefined;
    jest.isolateModules(() => {
      mod = {
        ...(require('../../app.module') as object),
        ...(require('@nestjs/testing') as object),
        ...(require('../../configure-app') as object),
        ...(require('../prisma/prisma.service') as object),
        ...(require('../redis/redis.service') as object),
        request: require('supertest'),
      } as AppModuleExports;
    });
    return mod as AppModuleExports;
  } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const GIVEAWAY_ONLY_ENV = {
  GIVEAWAY_ONLY: 'true',
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://fake:fake@localhost:5432/fake',
  GIVEAWAY_ENABLED: 'true',
  GIVEAWAY_MASTER_SECRET: Buffer.from(
    Array.from({ length: 32 }, (_, i) => i * 7 + 3),
  ).toString('latin1'),
};

function importNames(appModule: object): string[] {
  const imports = Reflect.getMetadata('imports', appModule) as Array<{
    name?: string;
    module?: { name: string };
  }>;
  return imports.map((m) => m.module?.name ?? m.name ?? '?');
}

/* eslint-enable @typescript-eslint/no-require-imports */

describe('AppModule: режим GIVEAWAY_ONLY', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('список imports ограничен модулями приёмника', () => {
    const { AppModule, GIVEAWAY_ONLY } = loadAppModule(GIVEAWAY_ONLY_ENV);
    expect(GIVEAWAY_ONLY).toBe(true);
    const names = importNames(AppModule as object);
    expect(names).toHaveLength(6);
    expect(names).toEqual(
      expect.arrayContaining([
        'ThrottlerModule',
        'PrismaModule',
        'RedisModule',
        'HealthModule',
        'GiveawayModule',
      ]),
    );
    expect(names).not.toContain('AuthModule');
  });

  it('без флага список модулей полный (режим по умолчанию)', () => {
    const { AppModule, GIVEAWAY_ONLY } = loadAppModule({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://fake:fake@localhost:5432/fake',
      JWT_ACCESS_SECRET: 'x'.repeat(32),
      JWT_REFRESH_SECRET: 'y'.repeat(32),
      TURNSTILE_SECRET_KEY: 'fake',
    });
    expect(GIVEAWAY_ONLY).toBe(false);
    const names = importNames(AppModule as object);
    expect(names).toEqual(
      expect.arrayContaining(['AuthModule', 'AdminModule', 'GiveawayModule']),
    );
    expect(names.length).toBeGreaterThan(30);
  });

  it('приложение стартует без JWT/2FA/captcha/cookie: /giveaway/v1/events есть, /auth нет', async () => {
    const {
      AppModule,
      Test,
      configureApp,
      PrismaService,
      RedisService,
      request,
    } = loadAppModule(GIVEAWAY_ONLY_ENV);
    // ConfigModule валидирует process.env при создании модуля.
    const saved: Record<string, string | undefined> = {};
    for (const k of KEYS) saved[k] = process.env[k];
    for (const k of KEYS) delete process.env[k];
    Object.assign(process.env, GIVEAWAY_ONLY_ENV);
    try {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(PrismaService)
        .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
        .overrideProvider(RedisService)
        .useValue({})
        .compile();
      app = moduleRef.createNestApplication({ rawBody: true });
      configureApp(app);
      await app.init();

      const events = await request(app.getHttpServer())
        .post('/giveaway/v1/events')
        .send({});
      expect(events.status).not.toBe(404);

      // Контроллеры фазы 3 входят в режим GIVEAWAY_ONLY (маршруты есть).
      for (const p of [
        '/giveaway/v1/admin/session',
        '/giveaway/v1/stream',
        '/giveaway/v1/public/results',
      ]) {
        const r = await request(app.getHttpServer()).get(p);
        expect(r.status).not.toBe(404);
      }

      const auth = await request(app.getHttpServer())
        .post('/auth/login')
        .send({});
      expect(auth.status).toBe(404);
      const me = await request(app.getHttpServer()).get('/users/me');
      expect(me.status).toBe(404);
    } finally {
      for (const k of KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });
});
