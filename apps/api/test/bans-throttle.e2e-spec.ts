import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

jest.setTimeout(60_000);

/// Срез 2, /bans (контракт, тест-план п.21 и 15): 429 на публичных маршрутах
/// после 60 запросов в минуту, заголовки ответа 429.
///
/// СТАТИЧЕСКИЙ e2e: агентом НЕ запускался. Нужны PostgreSQL и Redis обычного
/// окружения e2e на одноразовой БД. БД тест не изменяет: до лимита запросы идут
/// как есть (404 при выключенном разделе или 200/503 по состоянию БД), а guard
/// троттлера выполняется раньше всех остальных проверок. IP клиента берётся из
/// X-Forwarded-For при TRUST_PROXY=loopback (как в throttler-subnet.e2e-spec.ts);
/// случайный адрес из диапазона документации исключает пересечение со счётчиками
/// других наборов. Счётчик отдельный у каждого обработчика (список и карточка).
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
    const created = moduleRef.createNestApplication();
    loaded.configureApp(created);
    await created.init();
    return created;
  } finally {
    if (previous === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previous;
  }
}

describe('Bans: throttle публичных маршрутов (e2e)', () => {
  let app: INestApplication | undefined;
  const LIMIT = 60;
  const octet = () => 1 + Math.floor(Math.random() * 253);
  const ip = `198.51.${octet()}.${octet()}`;
  const otherIp = `198.51.${octet()}.${octet()}`;

  const hit = (path: string, xff: string) =>
    request(app!.getHttpServer()).get(path).set('X-Forwarded-For', xff);

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('список: 60 запросов проходят, 61-й - 429 с Retry-After и no-store; другой адрес не затронут', async () => {
    for (let i = 0; i < LIMIT; i += 1) {
      const res = await hit('/punishments/public?limit=1', ip);
      expect(res.status).not.toBe(429);
    }
    const blocked = await hit('/punishments/public?limit=1', ip).expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    // Контракт 6.1: ответ 429 не кэшируется, без ETag.
    expect(blocked.headers['cache-control']).toBe('no-store');
    expect(blocked.headers['etag']).toBeUndefined();

    const other = await hit('/punishments/public?limit=1', otherIp);
    expect(other.status).not.toBe(429);
  });

  it('карточка: отдельный счётчик, 61-й запрос - 429 с Retry-After', async () => {
    for (let i = 0; i < LIMIT; i += 1) {
      const res = await hit('/punishments/public/ban-1', ip);
      expect(res.status).not.toBe(429);
    }
    const blocked = await hit('/punishments/public/ban-1', ip).expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.headers['cache-control']).toBe('no-store');
  });

  it('me и admin: без токена 401 в пределах лимита', async () => {
    const me = await hit('/punishments/me', otherIp);
    expect(me.status).toBe(401);
    const admin = await hit('/admin/punishments/status', otherIp);
    expect(admin.status).toBe(401);
  });
});
