import { E2E_PAYMENT_WEBHOOK_SECRET } from './helpers/payment-webhook-env';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { createHash, randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { APP_CREATE_OPTIONS, configureApp } from './../src/configure-app';
import { signPaymentWebhook } from './helpers/sign-payment-webhook';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PaidRemovalService } from '../src/modules/store/paid-removal.service';
import { PAID_REMOVAL_SETTING } from '../src/modules/store/paid-removal-rules';

jest.setTimeout(30_000);

/// 0.12: быстрая покупка по нику, страница заказа без входа по секретному
/// токену, платное снятие мута (ADR-0186, ADR-0190). Покупатель анонимен.
describe('Store quick-buy by nick (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const unique = randomUUID().slice(0, 8);
  const knownNick = `Qb${unique}`.slice(0, 16);
  const mutedNick = `Qm${unique}`.slice(0, 16);
  const ACCEPT_OFFER = { offerVersion: '1' };
  const orderNumbers: string[] = [];
  let userId: string;
  let accessToken: string;
  let systemUserId: string;
  let mutedUserId: string;
  let privilegeVariantId: string;
  let unmuteVariantId: string;
  let previousRules: { value: string } | null = null;
  const email = `qb-${unique}@example.com`;
  const sysEmail = `qb-sys-${unique}@example.com`;
  const mutedEmail = `qb-muted-${unique}@example.com`;
  const PASSWORD = 'Sup3rSecretPassw0rd!';

  async function register(addr: string, username: string): Promise<string> {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: addr, username, password: PASSWORD })
      .expect(201);
    return (await prisma.user.findUniqueOrThrow({ where: { email: addr } })).id;
  }

  const quickBuy = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/store/quick-buy')
      .send({ ...ACCEPT_OFFER, ...body });

  const lookup = (token: string) =>
    request(app.getHttpServer())
      .post('/store/orders/guest/lookup')
      .send({ token });

  function pay(orderNumber: string) {
    return prisma.order
      .findUniqueOrThrow({ where: { orderNumber } })
      .then((order) => {
        const signed = signPaymentWebhook(E2E_PAYMENT_WEBHOOK_SECRET, {
          orderNumber,
          paymentId: order.paymentId,
          status: 'succeeded',
          amount: order.total.toString(),
          currency: 'RUB',
        });
        return request(app.getHttpServer())
          .post('/webhooks/payments/test')
          .set('Content-Type', 'application/json')
          .set(signed.headers)
          .send(signed.rawBody);
      });
  }

  async function payOk(orderNumber: string) {
    const res = await pay(orderNumber);
    expect(res.status).toBe(200);
    return res;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication(APP_CREATE_OPTIONS);
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const password = PASSWORD;
    const username = `qb${unique}`.slice(0, 16);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ emailOrUsername: email, password })
      .expect(200);
    accessToken = login.body.accessToken;
    userId = (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
    await prisma.minecraftAccount.createMany({
      data: [{ userId, uuid: randomUUID(), name: knownNick }],
    });

    systemUserId = await register(sysEmail, `qbsys${unique}`.slice(0, 16));
    await prisma.user.update({
      where: { id: systemUserId },
      data: { accountType: 'SYSTEM' },
    });
    mutedUserId = await register(mutedEmail, `qbmu${unique}`.slice(0, 16));
    await prisma.minecraftAccount.create({
      data: { userId: mutedUserId, uuid: randomUUID(), name: mutedNick },
    });

    const category = await prisma.category.create({
      data: { name: 'E2E QB', slug: `e2e-qb-${unique}-cat` },
    });
    const privilege = await prisma.product.create({
      data: {
        name: 'E2E QB Privilege',
        slug: `e2e-qb-${unique}-priv`,
        type: 'PRIVILEGE',
        categoryId: category.id,
        variants: { create: [{ duration: 'MONTH_1', price: 100 }] },
      },
      include: { variants: true },
    });
    privilegeVariantId = privilege.variants[0].id;
    const unmute = await prisma.product.create({
      data: {
        name: 'E2E QB Unmute',
        slug: `e2e-qb-${unique}-unmute`,
        type: 'UNMUTE',
        categoryId: category.id,
        variants: { create: [{ duration: 'ONE_TIME', price: 50 }] },
      },
      include: { variants: true },
    });
    unmuteVariantId = unmute.variants[0].id;
    previousRules = await prisma.siteSetting.findUnique({
      where: { key: PAID_REMOVAL_SETTING },
      select: { value: true },
    });
  }, 40_000);

  /// Возвращает настройку правил к значению до теста (upsert / удаление, если её не было).
  async function restoreRules() {
    if (previousRules) {
      await prisma.siteSetting.upsert({
        where: { key: PAID_REMOVAL_SETTING },
        update: { value: previousRules.value },
        create: { key: PAID_REMOVAL_SETTING, value: previousRules.value },
      });
    } else {
      await prisma.siteSetting.deleteMany({
        where: { key: PAID_REMOVAL_SETTING },
      });
    }
  }

  afterEach(() => {
    const storage = app.get<{ storage: Record<string, unknown> }>(
      ThrottlerStorage,
    );
    for (const key of Object.keys(storage.storage)) delete storage.storage[key];
  });

  afterAll(async () => {
    const orders = await prisma.order.findMany({
      where: { orderNumber: { in: orderNumbers } },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);
    await prisma.paidRemovalRecord.deleteMany({
      where: { orderId: { in: orderIds } },
    });
    await prisma.deliveryTask.deleteMany({
      where: { orderItem: { orderId: { in: orderIds } } },
    });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.minecraftPunishment.deleteMany({
      where: { subjectName: mutedNick },
    });
    await restoreRules();
    await prisma.auditLog.deleteMany({ where: { actorId: systemUserId } });
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `e2e-qb-${unique}` } },
    });
    await prisma.category.deleteMany({
      where: { slug: { startsWith: `e2e-qb-${unique}` } },
    });
    await prisma.minecraftAccount.deleteMany({
      where: { userId: { in: [userId, mutedUserId] } },
    });
    await prisma.cart.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({
      where: { id: { in: [userId, systemUserId, mutedUserId] } },
    });
    await app.close();
  }, 40_000);

  it('несуществующий ник не оформляется: единый nick_unavailable, заказа нет', async () => {
    const before = await prisma.order.count({
      where: { guestMinecraftNick: `Nope${unique}`.slice(0, 16) },
    });
    const res = await quickBuy({
      variantId: privilegeVariantId,
      guestMinecraftNick: `Nope${unique}`.slice(0, 16),
    }).expect(400);
    expect(res.body.code).toBe('nick_unavailable');
    expect(JSON.stringify(res.body)).not.toMatch(/uuid|account|ban/i);
    expect(
      await prisma.order.count({
        where: { guestMinecraftNick: `Nope${unique}`.slice(0, 16) },
      }),
    ).toBe(before);
  });

  it('лимит: 11-й запрос quick-buy за минуту — 429 (Q13)', async () => {
    let tooMany = 0;
    for (let i = 0; i < 11; i += 1) {
      const res = await quickBuy({
        variantId: privilegeVariantId,
        guestMinecraftNick: `Nope${i}${unique}`.slice(0, 16),
      });
      if (res.status === 429) tooMany += 1;
    }
    expect(tooMany).toBeGreaterThanOrEqual(1);
  });

  it('оформление: токен возвращается один раз, в БД только хеш; страница заказа по токену', async () => {
    const res = await quickBuy({
      variantId: privilegeVariantId,
      guestMinecraftNick: knownNick.toLowerCase(),
    }).expect(201);
    const { orderNumber } = res.body.order;
    orderNumbers.push(orderNumber);
    const token: string = res.body.guestAccessToken;
    expect(Buffer.from(token, 'base64url').length).toBeGreaterThanOrEqual(16);
    expect(res.body.order.guestMinecraftNick).toBe(knownNick);
    expect(res.body.order).not.toHaveProperty('guestAccessTokenHash');

    const row = await prisma.order.findUniqueOrThrow({
      where: { orderNumber },
    });
    expect(row.guestAccessTokenHash).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
    expect(row.guestAccessTokenHash).not.toBe(token);
    expect(row.guestAccessExpiresAt!.getTime()).toBeGreaterThan(Date.now());

    const page = await lookup(token).expect(200);
    expect(page.headers['cache-control']).toContain('no-store');
    expect(page.headers['referrer-policy']).toBe('no-referrer');
    expect(page.body.orderNumber).toBe(orderNumber);
    expect(page.body.status).toBe('PENDING');
    const json = JSON.stringify(page.body);
    for (const key of [
      'paymentId',
      'paymentUrl',
      'userId',
      'guestAccessTokenHash',
      'email',
      'ipAddress',
    ]) {
      expect(json).not.toContain(key);
    }
  });

  it('чужой заказ по угаданному номеру — 404, а не 200', async () => {
    const res = await quickBuy({
      variantId: privilegeVariantId,
      guestMinecraftNick: knownNick,
    }).expect(201);
    const { orderNumber } = res.body.order;
    orderNumbers.push(orderNumber);

    // Вошедший пользователь, номер заказа — не доступ.
    await request(app.getHttpServer())
      .get(`/store/orders/${orderNumber}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    // Номер заказа вместо токена и случайный токен — один и тот же 404.
    const byNumber = await lookup(orderNumber).expect(400);
    expect(byNumber.body).not.toHaveProperty('orderNumber');
    const wrong = await lookup(
      createHash('sha256').update(`x${unique}`).digest('base64url'),
    ).expect(404);
    expect(wrong.body).not.toHaveProperty('orderNumber');
    // Без входа номер заказа тоже ничего не открывает.
    await request(app.getHttpServer())
      .get(`/store/orders/${orderNumber}`)
      .expect(401);
  });

  it('просроченный токен — 404', async () => {
    const res = await quickBuy({
      variantId: privilegeVariantId,
      guestMinecraftNick: knownNick,
    }).expect(201);
    orderNumbers.push(res.body.order.orderNumber);
    await prisma.order.update({
      where: { orderNumber: res.body.order.orderNumber },
      data: { guestAccessExpiresAt: new Date(Date.now() - 1000) },
    });
    await lookup(res.body.guestAccessToken).expect(404);
  });

  it('идемпотентность: повторный вебхук не меняет заказ и не плодит задания', async () => {
    const res = await quickBuy({
      variantId: privilegeVariantId,
      guestMinecraftNick: knownNick,
    }).expect(201);
    const { orderNumber } = res.body.order;
    orderNumbers.push(orderNumber);

    await payOk(orderNumber);
    const first = await prisma.order.findUniqueOrThrow({
      where: { orderNumber },
      include: { items: { include: { deliveryTasks: true } } },
    });
    expect(first.status).toBe('COMPLETED');
    const tasks = first.items.flatMap((i) => i.deliveryTasks).length;

    const again = await payOk(orderNumber);
    expect(again.body.reason).toBe('already_processed');
    const second = await prisma.order.findUniqueOrThrow({
      where: { orderNumber },
      include: { items: { include: { deliveryTasks: true } } },
    });
    expect(second.paidAt!.getTime()).toBe(first.paidAt!.getTime());
    expect(second.items.flatMap((i) => i.deliveryTasks)).toHaveLength(tasks);

    const page = await lookup(res.body.guestAccessToken).expect(200);
    expect(page.body.status).toBe('COMPLETED');
  });

  it('снятие мута без правил: paid_removal_unavailable (fail closed), заказа нет', async () => {
    // Пустые правила (не JSON-объект с причинами) = fail closed.
    await prisma.siteSetting.upsert({
      where: { key: PAID_REMOVAL_SETTING },
      update: { value: '{}' },
      create: { key: PAID_REMOVAL_SETTING, value: '{}' },
    });
    try {
      const before = await prisma.order.count({
        where: { items: { some: { variantId: unmuteVariantId } } },
      });
      const res = await quickBuy({
        variantId: unmuteVariantId,
        guestMinecraftNick: knownNick,
      }).expect(503);
      expect(res.body.code).toBe('paid_removal_unavailable');
      expect(
        await prisma.order.count({
          where: { items: { some: { variantId: unmuteVariantId } } },
        }),
      ).toBe(before);
    } finally {
      await restoreRules();
    }
  });

  it('исполнитель снятия не подключён: снятие не оформляется даже при верных правилах (ADR-0190)', async () => {
    const removal = app.get(PaidRemovalService);
    expect(removal.isExecutorWired()).toBe(false);
    const res = await quickBuy({
      variantId: unmuteVariantId,
      guestMinecraftNick: knownNick,
    }).expect(503);
    expect(res.body.code).toBe('paid_removal_unavailable');
  });

  describe('платное снятие мута при настроенных правилах', () => {
    beforeAll(async () => {
      // Исполнитель снятия ещё не подключён (ADR-0190 п. 15): здесь проверяем
      // остальную цепочку, поэтому признак подменяется только в этом блоке.
      jest
        .spyOn(app.get(PaidRemovalService), 'isExecutorWired')
        .mockReturnValue(true);
      await prisma.minecraftPunishment.create({
        data: {
          kind: 'MUTE',
          sourceId: BigInt(Date.now()),
          sourceScope: `e2e-${unique}`,
          subjectName: mutedNick,
          reason: 'Spam in chat',
          executorName: 'Moderator',
          startedAt: new Date(Date.now() - 86_400_000),
          status: 'ACTIVE',
          rowHash: randomUUID().replace(/-/g, ''),
        },
      });
      const value = JSON.stringify({
        version: 'e2e',
        enabled: true,
        unmuteEnabled: true,
        allowedReasons: ['spam'],
        actorUserId: systemUserId,
      });
      await prisma.siteSetting.upsert({
        where: { key: PAID_REMOVAL_SETTING },
        update: { value },
        create: { key: PAID_REMOVAL_SETTING, value },
      });
    });

    afterAll(() => {
      jest.restoreAllMocks();
    });

    it('ник без наказания: nick_unavailable (без раскрытия причины)', async () => {
      const res = await quickBuy({
        variantId: unmuteVariantId,
        guestMinecraftNick: knownNick,
      }).expect(400);
      expect(res.body.code).toBe('nick_unavailable');
    });

    it('оплата, запись «система от имени владельца, заказ №», повтор не снимает дважды', async () => {
      const res = await quickBuy({
        variantId: unmuteVariantId,
        guestMinecraftNick: mutedNick,
      }).expect(201);
      const { orderNumber } = res.body.order;
      orderNumbers.push(orderNumber);
      await payOk(orderNumber);
      await payOk(orderNumber);

      const order = await prisma.order.findUniqueOrThrow({
        where: { orderNumber },
        include: { items: true },
      });
      expect(order.status).toBe('COMPLETED');
      const itemId = order.items[0].id;

      const removal = app.get(PaidRemovalService);
      const first = await removal.recordRemoval(itemId);
      const second = await removal.recordRemoval(itemId);
      expect(first.created).toBe(true);
      expect(second.created).toBe(false);

      const records = await prisma.paidRemovalRecord.findMany({
        where: { orderItemId: itemId },
      });
      expect(records).toHaveLength(1);
      expect(records[0].orderNumber).toBe(orderNumber);
      const audits = await prisma.auditLog.findMany({
        where: {
          actorId: systemUserId,
          action: 'punishment.paid_removal',
          targetId: records[0].punishmentId ?? undefined,
        },
      });
      expect(audits).toHaveLength(1);
      expect(JSON.stringify(audits[0].changes)).toContain(orderNumber);
      expect(audits[0].ipAddress).toBeNull();
    });
  });
});
