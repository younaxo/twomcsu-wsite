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
import { ConfigService } from '@nestjs/config';
import { InventoryEnabledGuard } from '../src/modules/inventory/inventory-enabled.guard';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { RedisService } from '../src/modules/redis/redis.service';
import {
  batchBody,
  freshNonce,
  makeEvent,
  signedHeaders,
} from './support/bridge-support';

jest.setTimeout(60_000);

/// `inventory.snapshot` через реальный HTTP-стек Bridge: подписанное событие
/// -> ряд инвентаря -> владелец видит его в GET /inventory/me, чужой
/// пользователь (со своей привязкой) - нет; неподписанное, просроченное и
/// повтор нонса отклоняются.
///
/// Запуск - только на ОДНОРАЗОВОЙ локальной БД и локальном Redis. Мастер-секрет
/// синтетический; значения из `.env*` не используются. Тест создаёт собственные
/// серверы (`e2e-<unique>-i`), двух пользователей и привязки и удаляет их в
/// afterAll вместе с ключами дедупликации в Redis.
const MASTER_SECRET = 'e2e-bridge-synthetic-master-secret-0123456789-abcdef';
const MASTER = Buffer.from(MASTER_SECRET, 'utf8');

describe('Bridge inventory.snapshot (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  const unique = randomUUID().replace(/-/g, '').slice(0, 6);
  const slug = `e2e-${unique}-i`;
  const slugNoCap = `e2e-${unique}-n`;
  const password = 'Sup3rSecretPassw0rd!';
  const mcUuid = randomUUID();
  const otherUuid = randomUUID();
  const userIds: string[] = [];
  const sentEventIds: string[] = [];
  const previous = {
    enabled: process.env.BRIDGE_ENABLED,
    secret: process.env.BRIDGE_MASTER_SECRET,
    inventory: process.env.BRIDGE_INVENTORY_ENABLED,
  };
  let owner = { id: '', auth: '' };
  let stranger = { id: '', auth: '' };
  const http = () => request(app.getHttpServer());

  async function createUser(label: string, uuid: string) {
    const email = `invb-${label}-${unique}@example.com`;
    const username = `ib${label}${unique}`.slice(0, 16);
    await http()
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);
    const login = await http()
      .post('/auth/login')
      .send({ emailOrUsername: username, password })
      .expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    userIds.push(user.id);
    await prisma.minecraftAccount.create({
      data: { userId: user.id, uuid, name: `P${label}${unique}`.slice(0, 16) },
    });
    return { id: user.id, auth: `Bearer ${login.body.accessToken}` };
  }

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

  const snapshot = (forSlug: string, rev: number, over = {}) =>
    makeEvent(
      'inventory.snapshot',
      {
        uuid: mcUuid,
        group: 'main',
        epoch: Date.now() - 3_600_000,
        rev,
        capturedAt: new Date().toISOString(),
        playerOnline: true,
        schemaVersion: 1,
        slots: [
          {
            area: 'hotbar',
            slot: 0,
            item: { id: 'minecraft:diamond_sword', count: 1 },
          },
        ],
      },
      { serverId: forSlug, ...over },
    );

  const rowCount = () =>
    prisma.playerInventory.count({ where: { userId: owner.id } });

  const mine = (who: { auth: string }) =>
    http().get('/inventory/me').set('Authorization', who.auth);

  beforeAll(async () => {
    process.env.BRIDGE_ENABLED = 'true';
    process.env.BRIDGE_MASTER_SECRET = MASTER_SECRET;
    process.env.BRIDGE_INVENTORY_ENABLED = 'true';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // ConfigModule кэширует провалидированный env при импорте AppModule:
      // боевой guard (fail-closed) читает process.env, заданный выше.
      .overrideGuard(InventoryEnabledGuard)
      .useValue(
        new InventoryEnabledGuard({
          get: (k: string) => process.env[k],
        } as unknown as ConfigService),
      )
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
    owner = await createUser('own', mcUuid);
    stranger = await createUser('str', otherUuid);
    await prisma.bridgeServer.createMany({
      data: [
        {
          slug,
          displayName: 'E2E inventory',
          capabilities: { punishments: true, 'inventory-sync': true },
        },
        { slug: slugNoCap, displayName: 'E2E inventory no capability' },
      ],
    });
  });

  beforeEach(async () => {
    await prisma.playerInventory.deleteMany({
      where: { userId: { in: userIds } },
    });
  });

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.bridgeServer.deleteMany({
          where: { slug: { in: [slug, slugNoCap] } },
        });
        if (userIds.length > 0) {
          await prisma.user.deleteMany({ where: { id: { in: userIds } } });
        }
      }
      if (redis && sentEventIds.length > 0) {
        await redis.client.del(
          ...sentEventIds.flatMap((id) => [
            `bridge:pe:${slug}:${id}`,
            `bridge:pe:${slugNoCap}:${id}`,
          ]),
        );
      }
    } finally {
      for (const [key, value] of [
        ['BRIDGE_ENABLED', previous.enabled],
        ['BRIDGE_MASTER_SECRET', previous.secret],
        ['BRIDGE_INVENTORY_ENABLED', previous.inventory],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      if (app) await app.close();
    }
  });

  it('подписанный снимок -> владелец видит его в GET /inventory/me', async () => {
    const res = await send(slug, [snapshot(slug, 1)]).expect(200);
    expect(res.body.results[0].status).toBe('accepted');
    const view = await mine(owner).expect(200);
    expect(view.body.state).toBe('ok');
    const server = view.body.servers.find(
      (s: { server: { slug: string } }) => s.server.slug === slug,
    );
    expect(server).toBeDefined();
    const main = server.groups.find(
      (g: { group: string }) => g.group === 'main',
    );
    expect(main.state).toBe('ok');
    expect(JSON.stringify(main)).toContain('minecraft:diamond_sword');
  });

  it('чужой пользователь снимок не видит', async () => {
    await send(slug, [snapshot(slug, 1)]).expect(200);
    const view = await mine(stranger).expect(200);
    expect(view.body.state).toBe('no_data');
    expect(JSON.stringify(view.body)).not.toContain('diamond_sword');
  });

  it('повтор того же события - duplicate; старая ревизия - stale', async () => {
    const epoch = Date.now() - 3_600_000;
    const newer = makeEvent(
      'inventory.snapshot',
      {
        uuid: mcUuid,
        group: 'main',
        epoch,
        rev: 5,
        capturedAt: new Date().toISOString(),
        playerOnline: true,
        schemaVersion: 1,
        slots: [],
      },
      { serverId: slug },
    );
    await send(slug, [newer]).expect(200);
    const older = makeEvent(
      'inventory.snapshot',
      { ...(newer.data as object), rev: 4 },
      { serverId: slug },
    );
    const first = await send(slug, [older]).expect(200);
    expect(first.body.results[0].status).toBe('stale');
    const again = await send(slug, [older]).expect(200);
    expect(again.body.results[0].status).toBe('duplicate');
  });

  it('поле вне схемы (ip) - invalid_data, запись не создаётся', async () => {
    const ev = makeEvent(
      'inventory.snapshot',
      { ...(snapshot(slug, 1).data as object), ip: '203.0.113.9' },
      { serverId: slug },
    );
    const res = await send(slug, [ev]).expect(200);
    expect(res.body.results[0]).toMatchObject({
      status: 'rejected',
      code: 'invalid_data',
    });
    expect(await rowCount()).toBe(0);
  });

  it('сервер без inventory-sync: unsupported_type', async () => {
    const res = await send(slugNoCap, [snapshot(slugNoCap, 1)]).expect(200);
    expect(res.body.results[0]).toMatchObject({
      status: 'rejected',
      code: 'unsupported_type',
    });
    expect(await rowCount()).toBe(0);
  });

  it('неподписанный запрос: 401', async () => {
    const body = batchBody([snapshot(slug, 1)]);
    await http()
      .post('/bridge/v1/events')
      .set('Content-Type', 'application/json')
      .send(body.toString('utf8'))
      .expect(401);
    expect(await rowCount()).toBe(0);
  });

  it('просроченное время подписи: 401', async () => {
    await send(slug, [snapshot(slug, 1)], {
      nowMs: Date.now() - 120_000,
    }).expect(401);
    expect(await rowCount()).toBe(0);
  });

  it('повтор нонса: второй запрос 401', async () => {
    const events = [snapshot(slug, 1)];
    const nonce = freshNonce();
    await send(slug, events, { nonce }).expect(200);
    await send(slug, events, { nonce }).expect(401);
  });
});
