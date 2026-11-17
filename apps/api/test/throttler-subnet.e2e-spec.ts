import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

jest.setTimeout(30_000);

// Q21 / ADR-0163: глобальный throttler ключуется по подсети /64 для IPv6.
//
// ВНИМАНИЕ: написан статически и НЕ запускался (запрет владельца на e2e в
// рабочей ветке). Нужны PostgreSQL и Redis из обычного окружения e2e.
//
// Окружение: IP клиента берётся из X-Forwarded-For только при TRUST_PROXY
// (apps/api/src/config/trust-proxy.ts). supertest подключается с loopback,
// поэтому TRUST_PROXY=loopback: заголовок принимается, а req.ip становится
// адресом клиента из X-Forwarded-For. ConfigModule читает process.env при
// загрузке AppModule, поэтому модули подключаются заново (isolateModules)
// после выставления переменной — как в trust-proxy.e2e-spec.ts.
//
// Маршрут: POST /auth/register/minecraft/challenge с @Throttle limit=5/мин.
// Guard срабатывает до валидации тела, поэтому пустое тело даёт 400 (не 429)
// без побочных эффектов в БД; шестой запрос с того же ключа даёт 429.

async function createApp(): Promise<INestApplication> {
  const previous = process.env.TRUST_PROXY;
  process.env.TRUST_PROXY = 'loopback';
  try {
    let loaded!: {
      Test: typeof import('@nestjs/testing').Test;
      AppModule: unknown;
      configureApp: (a: INestApplication) => void;
    };
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      loaded = {
        Test: require('@nestjs/testing').Test,
        AppModule: require('../src/app.module').AppModule,
        configureApp: require('../src/configure-app').configureApp,
      };
      /* eslint-enable @typescript-eslint/no-require-imports */
    });
    const moduleRef = await loaded.Test.createTestingModule({
      imports: [loaded.AppModule as never],
    }).compile();
    const app = moduleRef.createNestApplication();
    loaded.configureApp(app);
    await app.init();
    return app;
  } finally {
    if (previous === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previous;
  }
}

describe('Global throttler: ключ по /64 (e2e)', () => {
  let app: INestApplication;
  const LIMIT = 5;

  const hit = (xff: string) =>
    request(app.getHttpServer())
      .post('/auth/register/minecraft/challenge')
      .set('X-Forwarded-For', xff)
      .send({});

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('разные адреса одной /64 делят лимит маршрута', async () => {
    // Префикс 2001:db8:a:1::/64 — документационный диапазон.
    for (let i = 0; i < LIMIT; i += 1) {
      const res = await hit(`2001:db8:a:1::${i + 1}`);
      expect(res.status).not.toBe(429);
    }
    // Шестой адрес из той же /64 не обходит лимит.
    await hit('2001:db8:a:1:ffff:ffff:ffff:ffff').expect(429);
  });

  it('другая /64 и IPv4 лимит исчерпанной подсети не делят', async () => {
    // Исчерпываем лимит отдельной /64 (2001:db8:a:3::/64) до 429.
    for (let i = 0; i < LIMIT; i += 1) {
      await hit(`2001:db8:a:3::${i + 1}`);
    }
    await hit('2001:db8:a:3::ffff').expect(429);

    // Уже после этого соседние /64 и IPv4 не получают 429: изоляция доказана
    // именно на исчерпанном лимите, а не на «пустой» корзине.
    const other = await hit('2001:db8:a:4::1');
    expect(other.status).not.toBe(429);
    const v4 = await hit('203.0.113.44');
    expect(v4.status).not.toBe(429);
    // Исчерпанная /64 по-прежнему блокируется.
    await hit('2001:db8:a:3::1234').expect(429);
  });
});
