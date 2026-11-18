import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { APP_CREATE_OPTIONS, configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';

// См. auth.e2e-spec.ts — риск конкуренции за ресурсы под полным сьютом.
jest.setTimeout(20_000);

const FORBIDDEN_FIELDS = [
  'paymentId',
  'paymentProvider',
  'paymentWebhookVerifiedAt',
  'promoCodeId',
  'gameCommands',
];

describe('Мои заказы и личный журнал (0.6, e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const unique = randomUUID().slice(0, 8);
  const password = 'Sup3rSecretPassw0rd!';
  const numbers = {
    aliceOld: `MY-${unique}-A1`,
    aliceNew: `MY-${unique}-A2`,
    aliceFailed: `MY-${unique}-A3`,
    bob: `MY-${unique}-B1`,
    guest: `MY-${unique}-G1`,
  };

  interface TestUser {
    id: string;
    accessToken: string;
  }

  async function createUser(label: string): Promise<TestUser> {
    const email = `my-${label}-${unique}@example.com`;
    const username = `my${label}${unique}`.replace(/[^a-zA-Z0-9]/g, '');
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ emailOrUsername: email, password })
      .expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { id: user.id, accessToken: login.body.accessToken };
  }

  const auth = (u: TestUser) => `Bearer ${u.accessToken}`;
  let alice: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication(APP_CREATE_OPTIONS);
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    alice = await createUser('alice');
    bob = await createUser('bob');

    const base = {
      subtotal: 100,
      total: 100,
      paymentId: 'pay_internal',
      paymentProvider: 'test',
    };
    const day = 24 * 60 * 60 * 1000;
    await prisma.order.create({
      data: {
        ...base,
        orderNumber: numbers.aliceOld,
        userId: alice.id,
        status: 'COMPLETED',
        paidAt: new Date(),
        paymentWebhookVerifiedAt: new Date(),
        createdAt: new Date(Date.now() - 2 * day),
      },
    });
    await prisma.order.create({
      data: {
        ...base,
        orderNumber: numbers.aliceNew,
        userId: alice.id,
        status: 'PENDING',
        createdAt: new Date(Date.now() - day),
      },
    });
    await prisma.order.create({
      data: {
        ...base,
        orderNumber: numbers.aliceFailed,
        userId: alice.id,
        status: 'FAILED',
      },
    });
    await prisma.order.create({
      data: { ...base, orderNumber: numbers.bob, userId: bob.id },
    });
    await prisma.order.create({
      data: {
        ...base,
        orderNumber: numbers.guest,
        guestMinecraftNick: `Guest${unique}`.slice(0, 16),
      },
    });
  }, 30_000);

  afterAll(async () => {
    await prisma.order.deleteMany({
      where: { orderNumber: { in: Object.values(numbers) } },
    });
    const userIds = [alice.id, bob.id];
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('без токена список заказов — 401', async () => {
    await request(app.getHttpServer()).get('/store/orders').expect(401);
  });

  it('список: только свои, пагинация и порядок от новых к старым', async () => {
    const res = await request(app.getHttpServer())
      .get('/store/orders')
      .set('Authorization', auth(alice))
      .expect(200);
    const got = res.body.items.map(
      (o: { orderNumber: string }) => o.orderNumber,
    );
    expect(got).toHaveLength(3);
    expect(got).toEqual(
      expect.arrayContaining([
        numbers.aliceOld,
        numbers.aliceNew,
        numbers.aliceFailed,
      ]),
    );
    expect(got).not.toContain(numbers.bob);
    expect(got).not.toContain(numbers.guest);
    expect(got[2]).toBe(numbers.aliceOld);
    expect(res.body).toMatchObject({ total: 3, page: 1, limit: 20 });

    const page2 = await request(app.getHttpServer())
      .get('/store/orders?page=2&limit=2')
      .set('Authorization', auth(alice))
      .expect(200);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body).toMatchObject({ total: 3, page: 2, limit: 2 });
  });

  it('список: фильтр по статусу, неверный статус и limit — 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/store/orders?status=COMPLETED')
      .set('Authorization', auth(alice))
      .expect(200);
    expect(res.body.items.map((o: { status: string }) => o.status)).toEqual([
      'COMPLETED',
    ]);
    expect(res.body.total).toBe(1);
    await request(app.getHttpServer())
      .get('/store/orders?status=NOPE')
      .set('Authorization', auth(alice))
      .expect(400);
    await request(app.getHttpServer())
      .get('/store/orders?limit=1000')
      .set('Authorization', auth(alice))
      .expect(400);
  });

  it('список: огромный page — 400, а не 500', async () => {
    await request(app.getHttpServer())
      .get('/store/orders?page=99999999999')
      .set('Authorization', auth(alice))
      .expect(400);
  });

  it('пустой список у пользователя без заказов', async () => {
    const fresh = await createUser('fresh');
    try {
      const res = await request(app.getHttpServer())
        .get('/store/orders')
        .set('Authorization', auth(fresh))
        .expect(200);
      expect(res.body).toEqual({ items: [], total: 0, page: 1, limit: 20 });
    } finally {
      await prisma.refreshToken.deleteMany({ where: { userId: fresh.id } });
      await prisma.auditLog.deleteMany({ where: { actorId: fresh.id } });
      await prisma.user.deleteMany({ where: { id: fresh.id } });
    }
  });

  it('карточка: свой — 200 со статусом и paidAt; чужой и гостевой — 404 одинаково', async () => {
    const own = await request(app.getHttpServer())
      .get(`/store/orders/${numbers.aliceOld}`)
      .set('Authorization', auth(alice))
      .expect(200);
    expect(own.body).toMatchObject({
      orderNumber: numbers.aliceOld,
      status: 'COMPLETED',
    });
    expect(own.body.paidAt).toBeTruthy();

    const foreign = await request(app.getHttpServer())
      .get(`/store/orders/${numbers.bob}`)
      .set('Authorization', auth(alice))
      .expect(404);
    const guest = await request(app.getHttpServer())
      .get(`/store/orders/${numbers.guest}`)
      .set('Authorization', auth(alice))
      .expect(404);
    const missing = await request(app.getHttpServer())
      .get(`/store/orders/MY-${unique}-NONE`)
      .set('Authorization', auth(alice))
      .expect(404);
    expect(foreign.body).toEqual(missing.body);
    expect(guest.body).toEqual(missing.body);
  });

  it('ответы покупателю — без внутренних платёжных и служебных полей', async () => {
    const list = await request(app.getHttpServer())
      .get('/store/orders')
      .set('Authorization', auth(alice))
      .expect(200);
    const card = await request(app.getHttpServer())
      .get(`/store/orders/${numbers.aliceOld}`)
      .set('Authorization', auth(alice))
      .expect(200);
    for (const body of [list.body, card.body]) {
      const json = JSON.stringify(body);
      for (const field of FORBIDDEN_FIELDS) {
        expect(json).not.toContain(`"${field}"`);
      }
      expect(json).not.toContain('pay_internal');
    }
  });

  it('сессии: свои, IP замаскирован, без токенов и хешей', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/sessions')
      .set('Authorization', auth(alice))
      .expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    const stored = await prisma.refreshToken.findMany({
      where: { userId: alice.id },
    });
    for (const session of res.body) {
      expect(Object.keys(session).sort()).toEqual([
        'createdAt',
        'current',
        'expiresAt',
        'id',
        'ipAddress',
        'userAgent',
      ]);
      if (session.ipAddress !== null) {
        expect(session.ipAddress).toMatch(/\*/);
      }
    }
    const json = JSON.stringify(res.body);
    for (const row of stored) {
      if (row.ipAddress) {
        expect(json).not.toContain(row.ipAddress);
      }
      expect(json).not.toContain(row.tokenHash);
    }
    // Чужие сессии в ответе не появляются.
    const bobSessions = await prisma.refreshToken.findMany({
      where: { userId: bob.id },
    });
    for (const row of bobSessions) {
      expect(res.body.map((s: { id: string }) => s.id)).not.toContain(row.id);
    }
  });
});
