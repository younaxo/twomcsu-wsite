import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { APP_CREATE_OPTIONS } from '../../configure-app';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  FakePrisma,
  FakeRedisClient,
  TEST_MASTER,
  batchBody,
  makeEvent,
  makeServer,
  punishmentData,
  signedHeaders,
} from '../../../test/support/bridge-support';
import { BridgeController } from './bridge.controller';
import { BridgeIngestService } from './bridge-ingest.service';
import { BridgePunishmentSource } from './bridge-punishment.source';
import { BridgeDeliveryService } from './bridge-delivery.service';
import { BridgeRateLimitGuard } from './bridge-rate-limit.guard';
import { BridgeRedisService } from './bridge-redis.service';
import { BridgeSignatureGuard } from './bridge-signature.guard';
import { BRIDGE_CONFIG, BridgeConfig } from './bridge.config';
import { BridgeSourceEvent } from './bridge-punishment.source';

function config(over: Partial<BridgeConfig> = {}): BridgeConfig {
  return {
    enabled: true,
    masterSecret: TEST_MASTER,
    timestampWindowS: 60,
    maxBodyBytes: 262_144,
    keyOverlapDays: 7,
    applyLatencyLimitMs: 2000,
    bodyReadTimeoutMs: 10000,
    deliveryEnabled: false,
    ...over,
  };
}

interface Harness {
  app: INestApplication;
  redis: FakeRedisClient;
  prisma: FakePrisma;
  received: BridgeSourceEvent[];
  source: BridgePunishmentSource;
  server: ReturnType<typeof makeServer>;
}

async function boot(cfg: BridgeConfig = config()): Promise<Harness> {
  const redis = new FakeRedisClient();
  const prisma = new FakePrisma();
  const server = makeServer();
  const prismaMock = Object.assign(prisma, {
    bridgeServer: {
      findUnique: jest.fn().mockResolvedValue(server),
      update: jest.fn().mockResolvedValue({}),
    },
  });
  const moduleRef = await Test.createTestingModule({
    controllers: [BridgeController],
    providers: [
      { provide: BRIDGE_CONFIG, useValue: cfg },
      { provide: PrismaService, useValue: prismaMock },
      { provide: RedisService, useValue: { client: redis } },
      BridgeRedisService,
      BridgePunishmentSource,
      BridgeIngestService,
      BridgeDeliveryService,
      BridgeSignatureGuard,
      BridgeRateLimitGuard,
    ],
  }).compile();
  const app = moduleRef.createNestApplication(APP_CREATE_OPTIONS);
  await app.init();
  const source = app.get(BridgePunishmentSource);
  const received: BridgeSourceEvent[] = [];
  source.subscribe((e) => {
    received.push(e);
  });
  return { app, redis, prisma, received, source, server };
}

function post(
  h: Harness,
  body: Buffer,
  opts: Parameters<typeof signedHeaders>[0] = {},
  path = '/bridge/v1/events',
) {
  return request(h.app.getHttpServer())
    .post(path)
    .set(signedHeaders({ method: 'POST', path, body, ...opts }))
    .set('content-type', 'application/json')
    .send(body.toString('utf8'));
}

function get(h: Harness, path = '/bridge/v1/handshake') {
  return request(h.app.getHttpServer())
    .get(path)
    .set(signedHeaders({ method: 'GET', path }));
}

describe('BridgeController (HTTP, подпись по сырому телу)', () => {
  let h: Harness;
  afterEach(async () => {
    await h.app.close();
  });

  describe('handshake', () => {
    it('200: версия протокола, лимиты, серверное время', async () => {
      h = await boot();
      const res = await get(h);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        minProtocol: 1,
        maxProtocol: 1,
        features: { punishments: true, player_events: false, snapshot: false },
        limits: { maxEventsPerBatch: 100, maxEventBytes: 16384 },
      });
      expect(Number.isNaN(Date.parse(res.body.serverTime))).toBe(false);
    });

    it('без подписи - 401 с единым телом', async () => {
      h = await boot();
      const res = await request(h.app.getHttpServer()).get(
        '/bridge/v1/handshake',
      );
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'unauthorized' });
    });

    it('query запрещён даже при валидной подписи', async () => {
      h = await boot();
      const res = await request(h.app.getHttpServer())
        .get('/bridge/v1/handshake?a=1')
        .set(signedHeaders({ method: 'GET', path: '/bridge/v1/handshake' }));
      expect(res.status).toBe(401);
    });

    it('путь в другом регистре отклоняется (без нормализации)', async () => {
      h = await boot();
      const res = await request(h.app.getHttpServer())
        .get('/Bridge/V1/handshake')
        .set(signedHeaders({ method: 'GET', path: '/Bridge/V1/handshake' }));
      expect(res.status).toBe(401);
    });
  });

  describe('fail-closed', () => {
    it.each([
      ['выключен', config({ enabled: false })],
      ['нет секрета', config({ masterSecret: null })],
    ])('%s: 503 на всех путях без деталей', async (_n, cfg) => {
      h = await boot(cfg);
      const a = await get(h);
      const b = await post(h, batchBody([makeEvent('bridge.hello', {})]));
      const c = await request(h.app.getHttpServer()).get(
        '/bridge/v1/handshake',
      );
      for (const res of [a, b, c]) {
        expect(res.status).toBe(503);
        expect(res.body).toEqual({ error: 'unavailable' });
      }
    });
  });

  describe('POST /events', () => {
    it('200: accepted, событие передано источнику', async () => {
      h = await boot();
      const ev = makeEvent('punishment.created', punishmentData());
      const res = await post(h, batchBody([ev]));
      expect(res.status).toBe(200);
      expect(res.body.results).toEqual([
        { eventId: ev.eventId, status: 'accepted' },
      ]);
      expect(typeof res.body.serverTime).toBe('string');
      expect(h.received).toHaveLength(1);
    });

    it('повтор пачки с новым нонсом - duplicate', async () => {
      h = await boot();
      const body = batchBody([
        makeEvent('punishment.created', punishmentData()),
      ]);
      await post(h, body);
      const second = await post(h, body);
      expect(second.status).toBe(200);
      expect(second.body.results[0].status).toBe('duplicate');
      expect(h.received).toHaveLength(1);
    });

    it('повтор запроса с тем же нонсом - 401', async () => {
      h = await boot();
      const body = batchBody([makeEvent('bridge.hello', {})]);
      const nonce = 'BBBBBBBBBBBBBBBBBBBBBB';
      expect((await post(h, body, { nonce })).status).toBe(200);
      const replay = await post(h, body, { nonce });
      expect(replay.status).toBe(401);
      expect(replay.body).toEqual({ error: 'unauthorized' });
    });

    it('подпись над другим телом - 401', async () => {
      h = await boot();
      const signedFor = batchBody([makeEvent('bridge.hello', {})]);
      const sent = batchBody([
        makeEvent('punishment.created', punishmentData()),
      ]);
      const res = await request(h.app.getHttpServer())
        .post('/bridge/v1/events')
        .set(signedHeaders({ method: 'POST', body: signedFor }))
        .set('content-type', 'application/json')
        .send(sent.toString('utf8'));
      expect(res.status).toBe(401);
      expect(h.received).toHaveLength(0);
    });

    it('чужой serverId в событии - rejected server_mismatch', async () => {
      h = await boot();
      const ev = makeEvent('punishment.created', punishmentData(), {
        serverId: 'creative',
      });
      const res = await post(h, batchBody([ev]));
      expect(res.body.results[0]).toEqual({
        eventId: ev.eventId,
        status: 'rejected',
        code: 'server_mismatch',
      });
    });

    it('Content-Encoding запрещён', async () => {
      h = await boot();
      const body = batchBody([makeEvent('bridge.hello', {})]);
      const res = await post(h, body).set('content-encoding', 'identity');
      expect(res.status).toBe(401);
    });

    it('Content-Type не JSON - 401', async () => {
      h = await boot();
      const body = batchBody([makeEvent('bridge.hello', {})]);
      const res = await request(h.app.getHttpServer())
        .post('/bridge/v1/events')
        .set(signedHeaders({ method: 'POST', body }))
        .set('content-type', 'text/plain')
        .send(body.toString('utf8'));
      expect(res.status).toBe(401);
    });

    it('protocol 2 - 426', async () => {
      h = await boot();
      const res = await post(h, batchBody([makeEvent('bridge.hello', {})]), {
        protocol: '2',
      });
      expect(res.status).toBe(426);
    });

    it('Redis недоступен - 503 с Retry-After', async () => {
      h = await boot();
      h.redis.failAll = true;
      const res = await post(h, batchBody([makeEvent('bridge.hello', {})]));
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'unavailable' });
      expect(res.headers['retry-after']).toBe('5');
    });

    it('нет подписчика зеркала - 503, плагин повторит пачку', async () => {
      h = await boot();
      // Подписчик снимается: источник без получателя не должен отвечать accepted.
      await h.source.close();
      expect(h.source.hasSubscribers).toBe(false);
      const res = await post(
        h,
        batchBody([makeEvent('punishment.created', punishmentData())]),
      );
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'unavailable' });
      // Журнал хранит received: повтор той же пачки применится заново.
      expect([...h.prisma.log.values()].map((r) => r.status)).toEqual([
        'received',
      ]);
    });
  });

  describe('лимиты 5.4', () => {
    it('101 событие - 422, 100 - принимается', async () => {
      h = await boot();
      const hundred = Array.from({ length: 100 }, () =>
        makeEvent('bridge.hello', {}),
      );
      expect((await post(h, batchBody(hundred))).status).toBe(200);
      const res = await post(
        h,
        batchBody([...hundred, makeEvent('bridge.hello', {})]),
      );
      expect(res.status).toBe(422);
      expect(res.body).toEqual({ error: 'invalid_envelope' });
    });

    it('невалидный конверт (лишнее поле) - 422', async () => {
      h = await boot();
      const raw = Buffer.from(
        JSON.stringify({
          schema: 'twomc.bridge.v1',
          sentAt: new Date().toISOString(),
          events: [makeEvent('bridge.hello', {})],
          extra: true,
        }),
      );
      expect((await post(h, raw)).status).toBe(422);
    });

    it('тело больше BRIDGE_MAX_BODY_BYTES - 413', async () => {
      h = await boot(config({ maxBodyBytes: 2000 }));
      const big = batchBody([
        makeEvent(
          'punishment.created',
          punishmentData({ reason: 'я'.repeat(1500) }),
        ),
      ]);
      expect(big.length).toBeGreaterThan(2000);
      const res = await post(h, big);
      expect(res.status).toBe(413);
      expect(res.body).toEqual({ error: 'payload_too_large' });
    });

    it('тело больше предела разбора express (100 КБ) - 413', async () => {
      h = await boot();
      const huge = Buffer.from(
        JSON.stringify({ pad: 'x'.repeat(150_000) }),
        'utf8',
      );
      const res = await post(h, huge);
      expect(res.status).toBe(413);
    });

    function preloadBuckets(
      h2: Harness,
      scope: string,
      windowS: number,
      value: number,
    ) {
      const bucket = Math.floor(Date.now() / 1000 / windowS);
      for (const b of [bucket, bucket + 1]) {
        h2.redis.store.set(`bridge:rl:${scope}:survival.1:${b}`, String(value));
      }
    }

    it('превышение лимита запросов на ключ - 429 с Retry-After', async () => {
      h = await boot();
      preloadBuckets(h, 'r1', 1, 30);
      const res = await get(h);
      expect(res.status).toBe(429);
      expect(res.body).toEqual({ error: 'rate_limited' });
      expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    });

    it('превышение 10 запросов в секунду в среднем (100 за 10 с) - 429', async () => {
      h = await boot();
      preloadBuckets(h, 'r10', 10, 100);
      const res = await get(h);
      expect(res.status).toBe(429);
      expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    });

    it('превышение 3000 событий в минуту - 429', async () => {
      h = await boot();
      preloadBuckets(h, 'ev', 60, 2999);
      const res = await post(
        h,
        batchBody([
          makeEvent('bridge.hello', {}),
          makeEvent('bridge.hello', {}),
        ]),
      );
      expect(res.status).toBe(429);
      expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    });

    it('больше двух параллельных запросов на ключ - 429', async () => {
      h = await boot();
      h.redis.store.set('bridge:conc:survival.1', '2');
      const res = await post(h, batchBody([makeEvent('bridge.hello', {})]));
      expect(res.status).toBe(429);
      expect(res.headers['retry-after']).toBe('1');
    });

    it('слот параллельности освобождается после запроса', async () => {
      h = await boot();
      await post(h, batchBody([makeEvent('bridge.hello', {})]));
      expect(Number(h.redis.store.get('bridge:conc:survival.1'))).toBe(0);
    });

    it('лимит считается только после подписи: аноним не расходует лимит ключа', async () => {
      h = await boot();
      for (let i = 0; i < 20; i++) {
        await request(h.app.getHttpServer())
          .get('/bridge/v1/handshake')
          .set({
            ...signedHeaders({
              method: 'GET',
              path: '/bridge/v1/handshake',
              master: Buffer.from('wrong-synthetic-master-0000000000000000'),
            }),
          });
      }
      expect(h.redis.keysWithPrefix('bridge:rl:')).toEqual([]);
      const ok = await get(h);
      expect(ok.status).toBe(200);
    });
  });
});
