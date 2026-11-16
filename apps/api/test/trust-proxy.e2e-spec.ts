import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import type { PrismaService } from '../src/modules/prisma/prisma.service';
import type { RedisService } from '../src/modules/redis/redis.service';

jest.setTimeout(30_000);

// P3-02 / ADR-0155: клиентский IP за прокси, независимые счётчики входа и
// невозможность подделки IP заголовком. Каждая группа поднимает своё
// приложение с нужным TRUST_PROXY. ConfigModule читает process.env при
// загрузке AppModule, поэтому модули подключаются заново (isolateModules)
// после выставления переменной.

interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  redis: RedisService;
}

async function createApp(trustProxy: string | undefined): Promise<TestApp> {
  const previous = process.env.TRUST_PROXY;
  const previousTurnstile = process.env.TURNSTILE_DISABLED;
  if (trustProxy === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = trustProxy;
  // Без сети и ключей captcha вход иначе даёт 403 requiresCaptcha.
  process.env.TURNSTILE_DISABLED = 'true';
  try {
    let loaded!: {
      Test: typeof import('@nestjs/testing').Test;
      AppModule: unknown;
      configureApp: (a: INestApplication) => void;
      PrismaService: new (...a: never[]) => PrismaService;
      RedisService: new (...a: never[]) => RedisService;
    };
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      loaded = {
        Test: require('@nestjs/testing').Test,
        AppModule: require('../src/app.module').AppModule,
        configureApp: require('../src/configure-app').configureApp,
        PrismaService: require('../src/modules/prisma/prisma.service')
          .PrismaService,
        RedisService: require('../src/modules/redis/redis.service')
          .RedisService,
      };
      /* eslint-enable @typescript-eslint/no-require-imports */
    });
    const moduleRef = await loaded.Test.createTestingModule({
      imports: [loaded.AppModule as never],
    }).compile();
    const app = moduleRef.createNestApplication();
    loaded.configureApp(app);
    await app.init();
    return {
      app,
      prisma: app.get(loaded.PrismaService),
      redis: app.get(loaded.RedisService),
    };
  } finally {
    if (previous === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previous;
    if (previousTurnstile === undefined) delete process.env.TURNSTILE_DISABLED;
    else process.env.TURNSTILE_DISABLED = previousTurnstile;
  }
}

async function flushBruteForce(redis: RedisService): Promise<void> {
  const keys = await redis.client.keys('bruteforce:*');
  if (keys.length > 0) await redis.client.del(...keys);
}

describe('TRUST_PROXY (e2e)', () => {
  const unique = randomUUID().slice(0, 8);
  const email = `tp-${unique}@example.com`;
  const username = `tp${unique}`;
  const password = 'Sup3rSecretPassw0rd!';

  describe('TRUST_PROXY=loopback', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let redis: RedisService;

    const login = (xff: string | undefined, pass = 'wrong-password') => {
      const req = request(app.getHttpServer()).post('/auth/login');
      if (xff !== undefined) req.set('X-Forwarded-For', xff);
      return req.send({ emailOrUsername: email, password: pass });
    };

    beforeAll(async () => {
      ({ app, prisma, redis } = await createApp('loopback'));
      await flushBruteForce(redis);
      const existingDefault = await prisma.position.findFirst({
        where: { isDefault: true },
      });
      if (!existingDefault) {
        await prisma.position.create({
          data: {
            name: `e2e-default-${unique}`,
            slug: `e2e-default-${unique}`,
            displayName: 'Default (e2e)',
            group: 'default',
            color: '#ffffff',
            isDefault: true,
          },
        });
      }
      await request(app.getHttpServer())
        .post('/auth/register')
        .set('X-Forwarded-For', '198.51.100.250')
        .send({ email, username, password })
        .expect(201);
    });

    afterAll(async () => {
      await flushBruteForce(redis);
      await prisma.auditLog.deleteMany({ where: { actor: { email } } });
      await prisma.user.deleteMany({ where: { email } });
      await app.close();
    });

    it('10 неудач с IP A блокируют A, а клиент B входит', async () => {
      const a = '203.0.113.10';
      for (let i = 0; i < 10; i += 1) {
        await login(a).expect(401);
      }
      await login(a).expect(429);
      expect(await redis.client.get(`bruteforce:blocked:${a}`)).not.toBeNull();

      const ok = await login('203.0.113.11', password).expect(200);
      expect(ok.body.accessToken).toEqual(expect.any(String));
    });

    it('lastLoginIp равен адресу из заголовка', async () => {
      await login('203.0.113.77', password).expect(200);
      const user = await prisma.user.findUnique({ where: { email } });
      expect(user?.lastLoginIp).toBe('203.0.113.77');
    });

    it('цепочка «подделка, клиент» не обходит лимит', async () => {
      const real = '203.0.113.20';
      for (let i = 0; i < 10; i += 1) {
        await login(`10.${i}.0.1, ${real}`).expect(401);
      }
      expect(
        await redis.client.get(`bruteforce:blocked:${real}`),
      ).not.toBeNull();
      // Любая новая «подделка» слева всё равно считается как real.
      await login(`192.0.2.99, ${real}`).expect(429);
      // Подставные адреса слева счётчиков не получили.
      expect(await redis.client.get('bruteforce:login:10.0.0.1')).toBeNull();
      expect(await redis.client.get('bruteforce:login:192.0.2.99')).toBeNull();
    });

    it('::ffff: и обычная форма одного адреса — один счётчик', async () => {
      const plain = '203.0.113.30';
      for (let i = 0; i < 5; i += 1) {
        await login(plain).expect(401);
        await login(`::ffff:${plain}`).expect(401);
      }
      expect(
        await redis.client.get(`bruteforce:blocked:${plain}`),
      ).not.toBeNull();
      expect(await redis.client.keys('bruteforce:*ffff*')).toEqual([]);
    });
  });

  describe('TRUST_PROXY=1', () => {
    let app: INestApplication;
    let redis: RedisService;

    beforeAll(async () => {
      ({ app, redis } = await createApp('1'));
      await flushBruteForce(redis);
    });

    afterAll(async () => {
      await flushBruteForce(redis);
      await app.close();
    });

    it('«a, b»: клиент добавил a, прокси добавил b — счётчик по правому b', async () => {
      const forged = '198.51.100.1';
      const proxyAdded = '203.0.113.50';
      for (let i = 0; i < 3; i += 1) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .set('X-Forwarded-For', `${forged}, ${proxyAdded}`)
          .send({ emailOrUsername: email, password: 'wrong-password' })
          .expect(401);
      }
      expect(await redis.client.get(`bruteforce:login:${proxyAdded}`)).toBe(
        '3',
      );
      expect(await redis.client.get(`bruteforce:login:${forged}`)).toBeNull();
    });
  });

  describe('невалидный TRUST_PROXY', () => {
    it('TRUST_PROXY=true: приложение не создаётся (валидация env)', async () => {
      await expect(createApp('true')).rejects.toThrow(/TRUST_PROXY/);
    });
  });

  describe('TRUST_PROXY не задан', () => {
    let app: INestApplication;
    let redis: RedisService;

    beforeAll(async () => {
      ({ app, redis } = await createApp(undefined));
      await flushBruteForce(redis);
    });

    afterAll(async () => {
      await flushBruteForce(redis);
      await app.close();
    });

    it('X-Forwarded-For игнорируется: счётчик на адресе соединения', async () => {
      for (let i = 0; i < 4; i += 1) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .set('X-Forwarded-For', `203.0.113.${100 + i}`)
          .send({ emailOrUsername: email, password: 'wrong-password' })
          .expect(401);
      }
      const keys = await redis.client.keys('bruteforce:login:*');
      expect(keys).toHaveLength(1);
      expect(keys[0]).toMatch(/^bruteforce:login:(127\.0\.0\.1|::1)$/);
      const counter = await redis.client.get(keys[0]);
      expect(Number(counter)).toBe(4);
    });
  });
});
