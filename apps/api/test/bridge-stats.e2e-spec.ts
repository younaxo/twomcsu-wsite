import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { APP_CREATE_OPTIONS, configureApp } from './../src/configure-app';
import {
  BRIDGE_CONFIG,
  readBridgeConfig,
} from '../src/modules/bridge/bridge.config';
import { LeaderboardsService } from '../src/modules/leaderboards/leaderboards.service';
import { SETTING_STATS_PUBLIC_ENABLED } from '../src/modules/leaderboards/stats-settings.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { RedisService } from '../src/modules/redis/redis.service';
import {
  batchBody,
  freshNonce,
  makeEvent,
  signedHeaders,
} from './support/bridge-support';

jest.setTimeout(60_000);

/// `player.stats.snapshot` через реальный HTTP-стек Bridge (ADR-0195, Q68):
/// подписанное событие -> запись в PlayerStatistics -> GET /leaderboards
/// показывает данные игрока (проверка по его userId); неподписанное,
/// просроченное и повтор нонса отклоняются.
///
/// Запуск - только на ОДНОРАЗОВОЙ локальной БД и локальном Redis. Мастер-секрет
/// синтетический; значения из `.env*` не используются. Тест создаёт собственные
/// сервер (`e2e-<unique>-s`), пользователя и привязку и удаляет их в afterAll,
/// вместе с ключами Redis (маркер, блокировка, дедупликация событий);
/// настройка `stats.public.enabled` возвращается к прежнему значению. Каждый
/// тест перед запуском сам готовит данные (beforeEach), порядок тестов не
/// важен.
const MASTER_SECRET = 'e2e-bridge-synthetic-master-secret-0123456789-abcdef';
const MASTER = Buffer.from(MASTER_SECRET, 'utf8');

describe('Bridge player.stats.snapshot (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let leaderboards: LeaderboardsService;
  const unique = randomUUID().replace(/-/g, '').slice(0, 6);
  const slug = `e2e-${unique}-s`;
  const slugNoCap = `e2e-${unique}-n`;
  const mcUuid = randomUUID();
  const username = `st${unique}`;
  let userId = '';
  let previousSetting: string | null = null;
  const sentEventIds: string[] = [];
  const previous = {
    enabled: process.env.BRIDGE_ENABLED,
    secret: process.env.BRIDGE_MASTER_SECRET,
    stats: process.env.BRIDGE_STATS_ENABLED,
  };
  // Рейтинг показывает топ-10: значение выше любых реальных данных стенда.
  const KILLS = 99_000_000 + Math.floor(Math.random() * 900_000);

  const markerKey = () => `bridge:ps:all:stats:${userId}`;
  const occurredAt = (offsetMs: number) =>
    new Date(Date.now() + offsetMs).toISOString();

  function send(
    forSlug: string,
    events: Array<ReturnType<typeof makeEvent>>,
    over: Parameters<typeof signedHeaders>[0] = {},
  ) {
    for (const ev of events) sentEventIds.push(ev.eventId);
    const body = batchBody(events);
    const headers = signedHeaders({
      slug: forSlug,
      body,
      master: MASTER,
      ...over,
    });
    return request(app.getHttpServer())
      .post('/bridge/v1/events')
      .set(headers)
      .set('Content-Type', 'application/json')
      .send(body.toString('utf8'));
  }

  const snapshot = (forSlug: string, kills: number, over = {}) =>
    makeEvent(
      'player.stats.snapshot',
      {
        uuid: mcUuid,
        metrics: { kills, deaths: 2, playTimeMinutes: 120, hits: 10 },
      },
      { serverId: forSlug, ...over },
    );

  const rowOf = () => prisma.playerStatistics.findUnique({ where: { userId } });

  const boardEntry = async () => {
    const res = await request(app.getHttpServer())
      .get('/leaderboards')
      .expect(200);
    const kills = res.body.kills as Array<{ userId: string; value: number }>;
    return kills.find((e) => e.userId === userId);
  };

  async function waitForKills(expected: number | null) {
    const deadline = Date.now() + 15_000;
    for (;;) {
      const entry = await boardEntry();
      if (expected === null ? entry === undefined : entry?.value === expected) {
        return;
      }
      if (Date.now() > deadline) {
        throw new Error(`рейтинг не показал ожидаемое значение ${expected}`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  beforeAll(async () => {
    process.env.BRIDGE_ENABLED = 'true';
    process.env.BRIDGE_MASTER_SECRET = MASTER_SECRET;
    process.env.BRIDGE_STATS_ENABLED = 'true';
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
    redis = app.get(RedisService);
    leaderboards = app.get(LeaderboardsService);

    previousSetting =
      (
        await prisma.siteSetting.findUnique({
          where: { key: SETTING_STATS_PUBLIC_ENABLED },
        })
      )?.value ?? null;
    await prisma.siteSetting.upsert({
      where: { key: SETTING_STATS_PUBLIC_ENABLED },
      create: { key: SETTING_STATS_PUBLIC_ENABLED, value: 'true' },
      update: { value: 'true' },
    });

    const position = await prisma.position.findFirstOrThrow({
      where: { isDefault: true },
      select: { id: true },
    });
    const user = await prisma.user.create({
      data: {
        email: `stats-${unique}@example.com`,
        username,
        tag: `${username}#9998`,
        discriminator: 9998,
        positionId: position.id,
        password: 'x',
      },
      select: { id: true },
    });
    userId = user.id;
    await prisma.minecraftAccount.create({
      data: { userId, uuid: mcUuid, name: 'StatsE2E' },
    });
    await prisma.bridgeServer.createMany({
      data: [
        {
          slug,
          displayName: 'E2E stats',
          capabilities: { punishments: true, 'player-events': true },
        },
        { slug: slugNoCap, displayName: 'E2E stats no capability' },
      ],
    });
  });

  /// Каждый тест начинает с чистого состояния игрока: нет строки статистики,
  /// нет маркера монотонности, кэш рейтингов сброшен.
  beforeEach(async () => {
    await prisma.playerStatistics.deleteMany({ where: { userId } });
    await redis.client.del(markerKey());
    leaderboards.invalidate();
  });

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.bridgeServer.deleteMany({
          where: { slug: { in: [slug, slugNoCap] } },
        });
        if (userId) await prisma.user.deleteMany({ where: { id: userId } });
        if (previousSetting === null) {
          await prisma.siteSetting.deleteMany({
            where: { key: SETTING_STATS_PUBLIC_ENABLED },
          });
        } else {
          await prisma.siteSetting.update({
            where: { key: SETTING_STATS_PUBLIC_ENABLED },
            data: { value: previousSetting },
          });
        }
      }
      if (redis && userId) {
        const keys = [
          markerKey(),
          `bridge:pl:all:stats:${userId}`,
          ...sentEventIds.flatMap((id) => [
            `bridge:pe:${slug}:${id}`,
            `bridge:pe:${slugNoCap}:${id}`,
          ]),
        ];
        await redis.client.del(...keys);
      }
    } finally {
      for (const [key, value] of [
        ['BRIDGE_ENABLED', previous.enabled],
        ['BRIDGE_MASTER_SECRET', previous.secret],
        ['BRIDGE_STATS_ENABLED', previous.stats],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      if (app) await app.close();
    }
  });

  it('подписанный снимок -> запись -> рейтинг показывает данные игрока', async () => {
    await waitForKills(null); // игрока в рейтинге ещё нет
    const res = await send(slug, [snapshot(slug, KILLS)]).expect(200);
    expect(res.body.results[0].status).toBe('accepted');
    expect(await rowOf()).toMatchObject({
      kills: KILLS,
      deaths: 2,
      playTime: 120,
      hits: 10,
      lastServer: slug,
    });
    await waitForKills(KILLS);
    const entry = await boardEntry();
    expect(entry).toMatchObject({ userId, value: KILLS });
  });

  it('повтор того же события - duplicate; более старый снимок - stale', async () => {
    await send(slug, [
      snapshot(slug, KILLS, { occurredAt: occurredAt(0) }),
    ]).expect(200);
    const older = snapshot(slug, KILLS + 1, { occurredAt: occurredAt(-2000) });
    const first = await send(slug, [older]).expect(200);
    expect(first.body.results[0].status).toBe('stale');
    const again = await send(slug, [older]).expect(200);
    expect(again.body.results[0].status).toBe('duplicate');
    expect((await rowOf())?.kills).toBe(KILLS);
  });

  it('более новый снимок перезаписывает', async () => {
    await send(slug, [
      snapshot(slug, KILLS, { occurredAt: occurredAt(0) }),
    ]).expect(200);
    const res = await send(slug, [
      snapshot(slug, KILLS + 5, { occurredAt: occurredAt(1000) }),
    ]).expect(200);
    expect(res.body.results[0].status).toBe('accepted');
    expect((await rowOf())?.kills).toBe(KILLS + 5);
  });

  it('метрика вне белого списка - invalid_data, запись не меняется', async () => {
    const ev = makeEvent(
      'player.stats.snapshot',
      { uuid: mcUuid, metrics: { coins: 5 } },
      { serverId: slug },
    );
    const res = await send(slug, [ev]).expect(200);
    expect(res.body.results[0]).toMatchObject({
      status: 'rejected',
      code: 'invalid_data',
    });
    expect(await rowOf()).toBeNull();
  });

  it('сервер без player-events: unsupported_type', async () => {
    const res = await send(slugNoCap, [snapshot(slugNoCap, 1)]).expect(200);
    expect(res.body.results[0]).toMatchObject({
      status: 'rejected',
      code: 'unsupported_type',
    });
    expect(await rowOf()).toBeNull();
  });

  it('неподписанный запрос: 401', async () => {
    const body = batchBody([snapshot(slug, 1)]);
    await request(app.getHttpServer())
      .post('/bridge/v1/events')
      .set('Content-Type', 'application/json')
      .send(body.toString('utf8'))
      .expect(401);
    expect(await rowOf()).toBeNull();
  });

  it('неверная подпись: 401', async () => {
    await send(slug, [snapshot(slug, 1)], {
      master: Buffer.from('another-synthetic-master-secret-0123456789-xyz'),
    }).expect(401);
    expect(await rowOf()).toBeNull();
  });

  it('просроченное время подписи: 401', async () => {
    await send(slug, [snapshot(slug, 1)], {
      nowMs: Date.now() - 120_000,
    }).expect(401);
    expect(await rowOf()).toBeNull();
  });

  it('повтор нонса: второй запрос 401', async () => {
    const events = [snapshot(slug, 1)];
    const nonce = freshNonce();
    await send(slug, events, { nonce }).expect(200);
    await send(slug, events, { nonce }).expect(401);
  });
});
