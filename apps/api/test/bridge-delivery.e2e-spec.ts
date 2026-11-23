import { INestApplication, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { APP_CREATE_OPTIONS, configureApp } from './../src/configure-app';
import {
  BRIDGE_CONFIG,
  readBridgeConfig,
} from '../src/modules/bridge/bridge.config';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { signedHeaders } from './support/bridge-support';

jest.setTimeout(30_000);

/// Выдача заказов через Bridge (0.13, ADR-0194): HTTP-уровень claim/ack с
/// реальной подписью, guard, парсером тела и PostgreSQL.
///
/// СТАТИЧЕСКИЙ e2e: агентом НЕ запускался. Запуск - только на ОДНОРАЗОВОЙ
/// локальной БД с применёнными миграциями (включая bridge_delivery_jobs) и
/// локальном Redis. Мастер-секрет синтетический. Тест создаёт серверы
/// `e2e-<unique>-*` и удаляет их в afterAll. Полный цикл «заказ -> задание ->
/// ack -> DELIVERED» требует цепочки заказа и покрыт юнит-тестами
/// (bridge.executor.spec, bridge-delivery.service.spec); его e2e - срез 2.
const MASTER_SECRET = 'e2e-bridge-synthetic-master-secret-0123456789-abcdef';
const MASTER = Buffer.from(MASTER_SECRET, 'utf8');
const TOKEN = '123e4567-e89b-12d3-a456-426614174000';

describe('Bridge delivery claim/ack (e2e)', () => {
  let app: INestApplication | undefined;
  let prisma: PrismaService;
  const unique = randomUUID().replace(/-/g, '').slice(0, 6);
  const slugOn = `e2e-${unique}-d`;
  const slugNoCap = `e2e-${unique}-n`;
  const slugs = [slugOn, slugNoCap];
  const prev = {
    enabled: process.env.BRIDGE_ENABLED,
    secret: process.env.BRIDGE_MASTER_SECRET,
    delivery: process.env.BRIDGE_DELIVERY_ENABLED,
  };
  const spies: jest.SpyInstance[] = [];

  function post(slug: string, path: string, payload: unknown) {
    const body = Buffer.from(JSON.stringify(payload), 'utf8');
    const headers = signedHeaders({ slug, body, master: MASTER, path });
    return request(app!.getHttpServer())
      .post(path)
      .set(headers)
      .set('Content-Type', 'application/json')
      .send(body.toString('utf8'));
  }

  beforeAll(async () => {
    process.env.BRIDGE_ENABLED = 'true';
    process.env.BRIDGE_MASTER_SECRET = MASTER_SECRET;
    process.env.BRIDGE_DELIVERY_ENABLED = 'true';
    for (const m of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
      spies.push(jest.spyOn(Logger.prototype, m).mockImplementation());
    }
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BRIDGE_CONFIG)
      .useValue(
        readBridgeConfig({ get: (k: string) => process.env[k] as never }),
      )
      .compile();
    app = moduleFixture.createNestApplication(APP_CREATE_OPTIONS);
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.bridgeServer.createMany({
      data: [
        {
          slug: slugOn,
          displayName: 'E2E delivery',
          capabilities: { delivery: true },
        },
        {
          slug: slugNoCap,
          displayName: 'E2E no delivery',
          capabilities: { punishments: true },
        },
      ],
    });
  });

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.bridgeDeliveryJob.deleteMany({
          where: { serverSlug: { in: slugs } },
        });
        await prisma.bridgeServer.deleteMany({
          where: { slug: { in: slugs } },
        });
      }
    } finally {
      spies.forEach((s) => s.mockRestore());
      restore('BRIDGE_ENABLED', prev.enabled);
      restore('BRIDGE_MASTER_SECRET', prev.secret);
      restore('BRIDGE_DELIVERY_ENABLED', prev.delivery);
      await app?.close();
    }
  });

  it('claim без очереди -> 200 и пустой список, сервер отмечен на связи', async () => {
    const res = await post(slugOn, '/bridge/v1/delivery/claim', {});
    expect(res.status).toBe(200);
    expect(res.body.jobs).toEqual([]);
    expect(typeof res.body.pollAfterMs).toBe('number');
    const server = await prisma.bridgeServer.findUnique({
      where: { slug: slugOn },
    });
    expect(server?.lastSeenAt).not.toBeNull();
  });

  it('сервер без права delivery -> 403 capability_missing', async () => {
    const res = await post(slugNoCap, '/bridge/v1/delivery/claim', {});
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('capability_missing');
  });

  it('тело не по схеме -> 422 invalid_envelope', async () => {
    const a = await post(slugOn, '/bridge/v1/delivery/claim', { max: 99 });
    expect(a.status).toBe(422);
    const b = await post(slugOn, '/bridge/v1/delivery/ack', { results: [] });
    expect(b.status).toBe(422);
    expect(b.body.error).toBe('invalid_envelope');
  });

  it('ack несуществующего задания -> rejected unknown_job', async () => {
    const res = await post(slugOn, '/bridge/v1/delivery/ack', {
      results: [
        { jobId: 'job_nonexistent', claimToken: TOKEN, status: 'done' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([
      { jobId: 'job_nonexistent', status: 'rejected', code: 'unknown_job' },
    ]);
  });

  it('запрос без подписи -> 401', async () => {
    const res = await request(app!.getHttpServer())
      .post('/bridge/v1/delivery/claim')
      .set('Content-Type', 'application/json')
      .send('{}');
    expect(res.status).toBe(401);
  });

  it('повтор того же nonce -> 401 (защита от повторов)', async () => {
    const body = Buffer.from('{}', 'utf8');
    const headers = signedHeaders({
      slug: slugOn,
      body,
      master: MASTER,
      path: '/bridge/v1/delivery/claim',
    });
    const send = () =>
      request(app!.getHttpServer())
        .post('/bridge/v1/delivery/claim')
        .set(headers)
        .set('Content-Type', 'application/json')
        .send('{}');
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(401);
  });
});

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
