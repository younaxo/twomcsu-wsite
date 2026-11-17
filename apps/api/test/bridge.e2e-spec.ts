import { INestApplication, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash, createHmac, randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { APP_CREATE_OPTIONS, configureApp } from './../src/configure-app';
import {
  BRIDGE_CONFIG,
  readBridgeConfig,
} from '../src/modules/bridge/bridge.config';
import {
  BridgePunishmentSource,
  BridgeSourceEvent,
} from '../src/modules/bridge/bridge-punishment.source';
import { signRequest } from '../src/modules/bridge/bridge-crypto';
import { PrismaPunishmentMirrorStore } from '../src/modules/punishments/prisma-punishment-mirror.store';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import {
  batchBody,
  eventId,
  freshNonce,
  makeEvent,
  punishmentData,
  signedHeaders,
} from './support/bridge-support';

jest.setTimeout(30_000);

/// Срез 1 этапа 03, приёмник Bridge (контракт, раздел 11): реальный HTTP-стек
/// (rawBody, guard подписи, лимиты, фильтры), Redis и PostgreSQL.
///
/// СТАТИЧЕСКИЙ e2e: агентом НЕ запускался. Запуск - только на ОДНОРАЗОВОЙ
/// локальной БД с применёнными миграциями (включая bridge_servers и
/// bridge_event_log) и локальном Redis, с `LITEBANS_ENABLED=false`. Мастер-секрет
/// синтетический и задаётся здесь; значения из `.env*` не используются.
/// Тест создаёт собственные серверы (slug `e2e-<unique>-*`), строки зеркала
/// (`source='bridge'`, sourceId из случайного диапазона) и удаляет их в afterAll.
/// Подписчика синхронизатора этапа 02 в приложении пока нет: тест подписывается
/// на `BridgePunishmentSource` сам и пишет в зеркало через
/// `PrismaPunishmentMirrorStore.applyBatch`.
const MASTER_SECRET = 'e2e-bridge-synthetic-master-secret-0123456789-abcdef';
const MASTER = Buffer.from(MASTER_SECRET, 'utf8');
const HELLO = { pluginVersion: '1.0.0', platform: 'paper' };

describe('Bridge receiver (e2e)', () => {
  let app: INestApplication | undefined;
  let prisma: PrismaService;
  let source: BridgePunishmentSource;
  let mirror: PrismaPunishmentMirrorStore;
  const unique = randomUUID().replace(/-/g, '').slice(0, 6);
  const slugMain = `e2e-${unique}-a`;
  const slugRevoked = `e2e-${unique}-r`;
  const slugOther = `e2e-${unique}-o`;
  const slugRate = `e2e-${unique}-l`;
  const slugs = [slugMain, slugRevoked, slugOther, slugRate];
  const marker = `e2e-marker-${unique}`;
  const idBase = 8_000_000_000 + Math.floor(Math.random() * 1e8) * 10;
  let seq = 0;
  const nextSourceId = () => String(idBase + ++seq);

  const previous = {
    enabled: process.env.BRIDGE_ENABLED,
    secret: process.env.BRIDGE_MASTER_SECRET,
  };
  const published: BridgeSourceEvent[] = [];
  const logLines: string[] = [];
  const sentSecrets: string[] = [];
  let disposeSub: { dispose(): void } | undefined;
  const spies: jest.SpyInstance[] = [];

  const http = () => request(app!.getHttpServer());

  function send(
    slug: string,
    body: Buffer,
    over: Parameters<typeof signedHeaders>[0] = {},
  ) {
    const headers = signedHeaders({ slug, body, master: MASTER, ...over });
    sentSecrets.push(headers['x-twomc-signature'], headers['x-twomc-nonce']);
    // Строка, а не Buffer: superagent сериализует Buffer в JSON как {type,data}.
    return http()
      .post('/bridge/v1/events')
      .set(headers)
      .set('Content-Type', 'application/json')
      .send(body.toString('utf8'));
  }

  const one = (slug: string, type: string, data: Record<string, unknown>) =>
    makeEvent(type, data, { serverId: slug });
  const logRows = (slug: string) =>
    prisma.bridgeEventLog.findMany({ where: { serverSlug: slug } });
  const mirrorRow = (sourceId: string) =>
    prisma.minecraftPunishment.findFirst({
      where: { source: 'bridge', sourceId: BigInt(sourceId), kind: 'BAN' },
    });
  const publishedFor = (sid: string) =>
    published.filter(
      (p) => p.type !== 'deleted' && p.punishment.sourceId === sid,
    );

  beforeAll(async () => {
    process.env.BRIDGE_ENABLED = 'true';
    process.env.BRIDGE_MASTER_SECRET = MASTER_SECRET;
    for (const m of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
      spies.push(
        jest
          .spyOn(Logger.prototype, m)
          .mockImplementation((...a: unknown[]) => {
            logLines.push(a.map((x) => String(x)).join(' '));
          }),
      );
    }
    // ConfigModule.forRoot выполняется при импорте AppModule (до beforeAll) и
    // кэширует провалидированный env: BRIDGE_ENABLED фиксируется как false
    // (Joi default). Поэтому конфигурация Bridge читается из process.env
    // здесь, уже после задания синтетических значений. Продуктовый код не
    // меняется: подменяется только провайдер, readBridgeConfig - боевой.
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BRIDGE_CONFIG)
      .useValue(readBridgeConfig({ get: (k: string) => process.env[k] as never }))
      .compile();
    app = moduleFixture.createNestApplication(APP_CREATE_OPTIONS);
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    source = app.get(BridgePunishmentSource);
    mirror = new PrismaPunishmentMirrorStore(prisma);

    disposeSub = source.subscribe(async (ev: BridgeSourceEvent) => {
      published.push(ev);
      if (ev.type === 'deleted') return;
      await mirror.applyBatch(
        'bridge',
        ev.punishment.kind,
        [ev.punishment],
        null,
        new Date(),
      );
    });

    // Подписчик открывает вложенную транзакцию, пока транзакция приёмника
    // держит соединение. На «холодном» пуле первые такие запросы упираются в
    // maxWait=2000 мс (P2028 -> 503). Прогреваем пул тем же вложенным
    // шаблоном до первого теста.
    await Promise.all(
      Array.from({ length: 4 }, () => prisma.$queryRaw`SELECT 1`),
    );
    for (let i = 0; i < 3; i++) {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1`;
        await prisma.$transaction(async (tx2) => {
          await tx2.$queryRaw`SELECT 1`;
        });
      });
    }

    await prisma.bridgeServer.createMany({
      data: [
        {
          slug: slugMain,
          displayName: 'E2E main',
          capabilities: { punishments: true },
        },
        { slug: slugRevoked, displayName: 'E2E revoked', status: 'REVOKED' },
        { slug: slugOther, displayName: 'E2E other' },
        { slug: slugRate, displayName: 'E2E rate' },
      ],
    });
  });

  afterAll(async () => {
    try {
      disposeSub?.dispose();
      if (prisma) {
        await prisma.minecraftPunishment.deleteMany({
          where: {
            source: 'bridge',
            sourceId: { gte: BigInt(idBase), lte: BigInt(idBase + 1000) },
          },
        });
        await prisma.bridgeEventLog.deleteMany({
          where: { serverSlug: { in: slugs } },
        });
        await prisma.bridgeServer.deleteMany({
          where: { slug: { in: slugs } },
        });
      }
    } finally {
      spies.forEach((s) => s.mockRestore());
      if (previous.enabled === undefined) delete process.env.BRIDGE_ENABLED;
      else process.env.BRIDGE_ENABLED = previous.enabled;
      if (previous.secret === undefined) {
        delete process.env.BRIDGE_MASTER_SECRET;
      } else process.env.BRIDGE_MASTER_SECRET = previous.secret;
      await app?.close();
    }
  });

  describe('контракт подписи', () => {
    it('эталонный вектор раздела 2.2', () => {
      const body =
        '{"schema":"twomc.bridge.v1","sentAt":"2026-11-17T12:00:00.000Z","events":[{"eventId":"0193f0a2-7c1e-7000-8000-000000000001","type":"bridge.hello","serverId":"survival","streamId":"boot-0001","seq":1,"occurredAt":"2026-11-17T12:00:00.000Z","data":{"pluginVersion":"0.0.0-example","platform":"example"}}]}';
      const key = Buffer.from(
        'example-secret-not-for-production-use-0123456789',
        'utf8',
      );
      const input = {
        keyId: 'survival.1',
        timestamp: '1794916800',
        nonce: 'AAAAAAAAAAAAAAAAAAAAAA',
        method: 'POST',
        path: '/bridge/v1/events',
        body: Buffer.from(body, 'utf8'),
      };
      const expected =
        '9cbc99b98b00133f034fd5d058bdaff1818f54fa3003c074d14823f2dd80c2fc';
      expect(signRequest(key, input)).toBe(expected);
      const sha = createHash('sha256').update(input.body).digest('hex');
      expect(sha).toBe(
        '948f3c8711ceacb9257f84d3f4037387f1a7008fd2f5239cf72c2bb4d4fd9ad5',
      );
      const canonical = [
        'twomc-bridge-v1',
        'survival.1',
        '1794916800',
        'AAAAAAAAAAAAAAAAAAAAAA',
        'POST',
        '/bridge/v1/events',
        sha,
      ].join('\n');
      expect(createHmac('sha256', key).update(canonical).digest('hex')).toBe(
        expected,
      );
    });
  });

  describe('безопасность', () => {
    it('валидный запрос принимается (hello)', async () => {
      const body = batchBody([one(slugMain, 'bridge.hello', HELLO)]);
      const res = await send(slugMain, body).expect(200);
      expect(res.body.results[0].status).toBe('accepted');
    });

    it('неверная подпись: 401 без деталей', async () => {
      const body = batchBody([one(slugMain, 'bridge.hello', HELLO)]);
      const res = await send(slugMain, body, {
        master: Buffer.from('another-synthetic-master-secret-0123456789-xyz'),
      }).expect(401);
      expect(res.body).toEqual({ error: 'unauthorized' });
    });

    it('просроченное время: 401', async () => {
      const body = batchBody([one(slugMain, 'bridge.hello', HELLO)]);
      const res = await send(slugMain, body, {
        nowMs: Date.now() - 120_000,
      }).expect(401);
      expect(res.body).toEqual({ error: 'unauthorized' });
    });

    it('повтор нонса: второй запрос 401', async () => {
      const body = batchBody([one(slugMain, 'bridge.hello', HELLO)]);
      const nonce = freshNonce();
      await send(slugMain, body, { nonce }).expect(200);
      const res = await send(slugMain, body, { nonce }).expect(401);
      expect(res.body).toEqual({ error: 'unauthorized' });
    });

    it('чужой serverId в событии: rejected server_mismatch', async () => {
      const body = batchBody([
        makeEvent('bridge.hello', HELLO, { serverId: slugOther }),
      ]);
      const res = await send(slugMain, body).expect(200);
      expect(res.body.results[0]).toMatchObject({
        status: 'rejected',
        code: 'server_mismatch',
      });
    });

    it('подпись другого сервера под чужим key-id: 401', async () => {
      const body = batchBody([one(slugMain, 'bridge.hello', HELLO)]);
      const other = signedHeaders({ slug: slugOther, body, master: MASTER });
      const headers = { ...other, 'x-twomc-key-id': `${slugMain}.1` };
      await http()
        .post('/bridge/v1/events')
        .set(headers)
        .set('Content-Type', 'application/json')
        .send(body.toString('utf8'))
        .expect(401);
    });

    it('отозванный сервер: 401', async () => {
      const body = batchBody([one(slugRevoked, 'bridge.hello', HELLO)]);
      const res = await send(slugRevoked, body).expect(401);
      expect(res.body).toEqual({ error: 'unauthorized' });
    });

    it('неизвестный сервер: 401', async () => {
      const body = batchBody([one('e2e-unknown', 'bridge.hello', HELLO)]);
      await send('e2e-unknown', body).expect(401);
    });

    it('отсутствие секрета: 503 без деталей', async () => {
      const moduleFixture = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(BRIDGE_CONFIG)
        .useValue({
          enabled: true,
          masterSecret: null,
          timestampWindowS: 60,
          maxBodyBytes: 262_144,
          keyOverlapDays: 7,
          applyLatencyLimitMs: 2000,
        })
        .compile();
      const noSecretApp =
        moduleFixture.createNestApplication(APP_CREATE_OPTIONS);
      configureApp(noSecretApp);
      await noSecretApp.init();
      try {
        const body = batchBody([one(slugMain, 'bridge.hello', HELLO)]);
        const headers = signedHeaders({ slug: slugMain, body, master: MASTER });
        const res = await request(noSecretApp.getHttpServer())
          .post('/bridge/v1/events')
          .set(headers)
          .set('Content-Type', 'application/json')
          .send(body.toString('utf8'))
          .expect(503);
        expect(res.body).toEqual({ error: 'unavailable' });
      } finally {
        await noSecretApp.close();
      }
    });
  });

  describe('идемпотентность и порядок', () => {
    it('повтор пачки: duplicate, одно применение', async () => {
      const sid = nextSourceId();
      const ev = one(
        slugMain,
        'punishment.created',
        punishmentData({ sourceId: sid, reason: marker }),
      );
      const body = batchBody([ev]);
      const first = await send(slugMain, body).expect(200);
      expect(first.body.results[0].status).toBe('accepted');
      const second = await send(slugMain, body).expect(200);
      expect(second.body.results[0].status).toBe('duplicate');
      expect(publishedFor(sid)).toHaveLength(1);
      expect(await mirrorRow(sid)).not.toBeNull();
    });

    it('параллельная отправка одной пачки: одно применение', async () => {
      const sid = nextSourceId();
      const ev = one(
        slugMain,
        'punishment.created',
        punishmentData({ sourceId: sid }),
      );
      const body = batchBody([ev]);
      const [a, b] = await Promise.all([
        send(slugMain, body),
        send(slugMain, body),
      ]);
      const statuses = [a, b].map((r) => r.body.results?.[0]?.status).sort();
      expect(statuses).toEqual(['accepted', 'duplicate']);
      expect(publishedFor(sid)).toHaveLength(1);
      const rows = await logRows(slugMain);
      expect(rows.filter((r) => r.eventId === ev.eventId)).toHaveLength(1);
      expect(
        await prisma.minecraftPunishment.count({
          where: { source: 'bridge', sourceId: BigInt(sid) },
        }),
      ).toBe(1);
    });

    it('conflict: тот же eventId, другой payloadHash', async () => {
      const sid = nextSourceId();
      const id = eventId();
      const e1 = one(
        slugMain,
        'punishment.created',
        punishmentData({ sourceId: sid }),
      );
      const e2 = one(
        slugMain,
        'punishment.created',
        punishmentData({ sourceId: sid, reason: 'Другая причина' }),
      );
      e1.eventId = id;
      e2.eventId = id;
      await send(slugMain, batchBody([e1])).expect(200);
      const res = await send(slugMain, batchBody([e2])).expect(200);
      expect(res.body.results[0]).toMatchObject({
        status: 'rejected',
        code: 'conflict',
      });
    });

    it('stale: событие старше применённого состояния записи', async () => {
      const sid = nextSourceId();
      const now = Date.now();
      const fresh = one(
        slugMain,
        'punishment.created',
        punishmentData({ sourceId: sid }),
      );
      fresh.occurredAt = new Date(now - 5_000).toISOString();
      const old = one(
        slugMain,
        'punishment.updated',
        punishmentData({ sourceId: sid, reason: 'Устаревшее' }),
      );
      old.occurredAt = new Date(now - 60_000).toISOString();
      await send(slugMain, batchBody([fresh])).expect(200);
      const res = await send(slugMain, batchBody([old])).expect(200);
      expect(res.body.results[0].status).toBe('stale');
      expect((await mirrorRow(sid))?.reason).not.toBe('Устаревшее');
    });
  });

  describe('лимиты', () => {
    it('413: тело больше лимита', async () => {
      const big = Buffer.from(
        JSON.stringify({ schema: 'twomc.bridge.v1', pad: 'x'.repeat(300_000) }),
      );
      await send(slugMain, big).expect(413);
    });

    it('422: 101 событие в пачке', async () => {
      const events = Array.from({ length: 101 }, () =>
        one(slugMain, 'bridge.hello', HELLO),
      );
      await send(slugMain, batchBody(events)).expect(422);
    });

    it('429 с Retry-After: всплеск запросов на ключ', async () => {
      const results = await Promise.all(
        Array.from({ length: 60 }, () => {
          const headers = signedHeaders({
            slug: slugRate,
            method: 'GET',
            path: '/bridge/v1/handshake',
            master: MASTER,
          });
          sentSecrets.push(
            headers['x-twomc-signature'],
            headers['x-twomc-nonce'],
          );
          return http().get('/bridge/v1/handshake').set(headers);
        }),
      );
      const limited = results.filter((r) => r.status === 429);
      expect(limited.length).toBeGreaterThan(0);
      for (const r of limited) {
        expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
      }
      expect(results.some((r) => r.status === 200)).toBe(true);
    });
  });

  describe('интеграция с этапом 02', () => {
    it('created и updated попадают в зеркало через PunishmentSource', async () => {
      const sid = nextSourceId();
      const now = Date.now();
      const created = one(
        slugMain,
        'punishment.created',
        punishmentData({ sourceId: sid, reason: 'Первая причина' }),
      );
      created.occurredAt = new Date(now - 20_000).toISOString();
      await send(slugMain, batchBody([created])).expect(200);
      const row1 = await mirrorRow(sid);
      expect(row1).not.toBeNull();
      expect(row1?.reason).toBe('Первая причина');
      expect(row1?.source).toBe('bridge');
      expect(row1?.ipBan).toBe(false);

      const updated = one(
        slugMain,
        'punishment.updated',
        punishmentData({ sourceId: sid, reason: 'Вторая причина' }),
      );
      updated.occurredAt = new Date(now - 10_000).toISOString();
      const res = await send(slugMain, batchBody([updated])).expect(200);
      expect(res.body.results[0].status).toBe('accepted');
      expect((await mirrorRow(sid))?.reason).toBe('Вторая причина');
    });

    it('removed: зеркало получает статус REMOVED и данные снятия', async () => {
      const sid = nextSourceId();
      const now = Date.now();
      const created = one(
        slugMain,
        'punishment.created',
        punishmentData({ sourceId: sid }),
      );
      created.occurredAt = new Date(now - 30_000).toISOString();
      await send(slugMain, batchBody([created])).expect(200);
      expect((await mirrorRow(sid))?.status).toBe('ACTIVE');

      const removed = one(
        slugMain,
        'punishment.removed',
        punishmentData({
          sourceId: sid,
          removal: {
            by: { uuid: null, name: null, console: true },
            reason: 'Снято в e2e',
            at: new Date(now - 5_000).toISOString(),
          },
        }),
      );
      removed.occurredAt = new Date(now - 5_000).toISOString();
      const res = await send(slugMain, batchBody([removed])).expect(200);
      expect(res.body.results[0].status).toBe('accepted');
      const row = await mirrorRow(sid);
      expect(row?.status).toBe('REMOVED');
      expect(row?.removedReason).toBe('Снято в e2e');
      expect(row?.removedAt).not.toBeNull();
    });

    it('deleted: событие уходит источнику (kind, sourceId), в журнале запись', async () => {
      const sid = nextSourceId();
      const before = published.length;
      const deleted = one(slugMain, 'punishment.deleted', {
        kind: 'BAN',
        sourceId: sid,
      });
      const res = await send(slugMain, batchBody([deleted])).expect(200);
      expect(res.body.results[0].status).toBe('accepted');
      const got = published
        .slice(before)
        .filter((p) => p.type === 'deleted');
      expect(got).toHaveLength(1);
      expect(got[0]).toMatchObject({
        type: 'deleted',
        kind: 'BAN',
        sourceId: sid,
        serverSlug: slugMain,
      });
      const rows = await logRows(slugMain);
      expect(rows.some((r) => r.type === 'punishment.deleted')).toBe(true);
    });
  });

  describe('логи и журнал', () => {
    it('нет секретов, подписей, нонсов, IP и данных событий', async () => {
      const text = logLines.join('\n');
      // Перехват Logger действует (иначе проверка ниже пуста).
      expect(logLines.length).toBeGreaterThan(0);
      expect(text).not.toContain(MASTER_SECRET);
      for (const s of sentSecrets) expect(text).not.toContain(s);
      expect(text).not.toContain(marker);
      expect(text).not.toMatch(/127\.0\.0\.1|::1\b/);

      const rows = await logRows(slugMain);
      expect(rows.length).toBeGreaterThan(0);
      const dump = JSON.stringify(rows);
      expect(dump).not.toContain(marker);
      expect(dump).not.toContain('TestPlayer001');
      expect(dump).not.toContain(MASTER_SECRET);
      expect(dump).not.toMatch(/127\.0\.0\.1|::1\b/);
      // Журнал содержит только принятые punishment.*: hello и отказы не пишутся.
      expect(rows.every((r) => r.type.startsWith('punishment.'))).toBe(true);
    });
  });
});
