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
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { SETTING_STATS_PUBLIC_ENABLED } from '../src/modules/leaderboards/stats-settings.service';
import {
  batchBody,
  freshNonce,
  makeEvent,
  signedHeaders,
} from './support/bridge-support';

jest.setTimeout(60_000);

/// `player.stats.snapshot` через реальный HTTP-стек Bridge (ADR-0195, Q68):
/// подписанное событие -> запись в PlayerStatistics -> GET /leaderboards
/// показывает данные; неподписанное, просроченное и повтор нонса отклоняются.
///
/// Запуск - только на ОДНОРАЗОВОЙ локальной БД и локальном Redis. Мастер-секрет
/// синтетический; значения из `.env*` не используются. Тест создаёт собственные
/// сервер (`e2e-<unique>-s`), пользователя и привязку и удаляет их в afterAll;
/// настройка `stats.public.enabled` возвращается к прежнему значению.
const MASTER_SECRET = 'e2e-bridge-synthetic-master-secret-0123456789-abcdef';
const MASTER = Buffer.from(MASTER_SECRET, 'utf8');

describe('Bridge player.stats.snapshot (e2e)', () => {
  let app: INestApplication | undefined;
  let prisma: PrismaService;
  const unique = randomUUID().replace(/-/g, '').slice(0, 6);
  const slug = `e2e-${unique}-s`;
  const slugNoCap = `e2e-${unique}-n`;
  const mcUuid = randomUUID();
  const username = `st${unique}`;
  let userId = '';
  let previousSetting: string | null = null;
  const previous = {
    enabled: process.env.BRIDGE_ENABLED,
    secret: process.env.BRIDGE_MASTER_SECRET,
    stats: process.env.BRIDGE_STATS_ENABLED,
  };
  const KILLS = 99_000_000 + Math.floor(Math.random() * 900_000);

  const http = () => request(app!.getHttpServer());

  function send(
    forSlug: string,
    body: Buffer,
    over: Parameters<typeof signedHeaders>[0] = {},
  ) {
    const headers = signedHeaders({ slug: forSlug, body, master: MASTER, ...over });
    return http()
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

  const boardKills = async () =>
    (await http().get('/leaderboards').expect(200)).body.kills as Array<{
      username: string;
      value: number;
    }>;

  async function waitForKills(expected: number | null) {
    const deadline = Date.now() + 15_000;
    for (;;) {
      const entry = (await boardKills()).find((e) => e.username === username);
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
    } finally {
      for (const [key, value] of [
        ['BRIDGE_ENABLED', previous.enabled],
        ['BRIDGE_MASTER_SECRET', previous.secret],
        ['BRIDGE_STATS_ENABLED', previous.stats],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await app?.close();
    }
  });

  it('подписанный снимок -> запись -> рейтинг показывает данные', async () => {
    await waitForKills(null); // прогрев кэша: игрока в рейтинге ещё нет
    const ev = snapshot(slug, KILLS);
    const res = await send(slug, batchBody([ev])).expect(200);
    expect(res.body.results[0].status).toBe('accepted');
    const row = await prisma.playerStatistics.findUnique({
      where: { userId },
    });
    expect(row).toMatchObject({
      kills: KILLS,
      deaths: 2,
      playTime: 120,
      hits: 10,
      lastServer: slug,
    });
    await waitForKills(KILLS);
  });

  it('повтор того же события - duplicate; более старый снимок - stale', async () => {
    const ev = snapshot(slug, KILLS + 1, {
      occurredAt: new Date(Date.now() - 2000).toISOString(),
    });
    const first = await send(slug, batchBody([ev])).expect(200);
    // Снимок старше уже принятого (в предыдущем тесте) - stale.
    expect(first.body.results[0].status).toBe('stale');
    const again = await send(slug, batchBody([ev])).expect(200);
    expect(again.body.results[0].status).toBe('duplicate');
    const row = await prisma.playerStatistics.findUnique({
      where: { userId },
    });
    expect(row?.kills).toBe(KILLS);
  });

  it('более новый снимок перезаписывает', async () => {
    const ev = snapshot(slug, KILLS + 5, {
      occurredAt: new Date(Date.now() + 1000).toISOString(),
    });
    const res = await send(slug, batchBody([ev])).expect(200);
    expect(res.body.results[0].status).toBe('accepted');
    const row = await prisma.playerStatistics.findUnique({
      where: { userId },
    });
    expect(row?.kills).toBe(KILLS + 5);
  });

  it('метрика вне белого списка - invalid_data, запись не меняется', async () => {
    const ev = makeEvent(
      'player.stats.snapshot',
      { uuid: mcUuid, metrics: { coins: 5 } },
      { serverId: slug },
    );
    const res = await send(slug, batchBody([ev])).expect(200);
    expect(res.body.results[0]).toMatchObject({
      status: 'rejected',
      code: 'invalid_data',
    });
  });

  it('сервер без player-events: unsupported_type', async () => {
    const ev = snapshot(slugNoCap, 1);
    const res = await send(slugNoCap, batchBody([ev])).expect(200);
    expect(res.body.results[0]).toMatchObject({
      status: 'rejected',
      code: 'unsupported_type',
    });
  });

  it('неподписанный запрос: 401', async () => {
    const body = batchBody([snapshot(slug, 1)]);
    await http()
      .post('/bridge/v1/events')
      .set('Content-Type', 'application/json')
      .send(body.toString('utf8'))
      .expect(401);
  });

  it('неверная подпись: 401', async () => {
    const body = batchBody([snapshot(slug, 1)]);
    await send(slug, body, {
      master: Buffer.from('another-synthetic-master-secret-0123456789-xyz'),
    }).expect(401);
  });

  it('просроченное время подписи: 401', async () => {
    const body = batchBody([snapshot(slug, 1)]);
    await send(slug, body, { nowMs: Date.now() - 120_000 }).expect(401);
  });

  it('повтор нонса: второй запрос 401', async () => {
    const body = batchBody([snapshot(slug, 1)]);
    const nonce = freshNonce();
    await send(slug, body, { nonce }).expect(200);
    await send(slug, body, { nonce }).expect(401);
  });
});
