import { E2E_PAYMENT_WEBHOOK_SECRET } from './helpers/payment-webhook-env';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { APP_CREATE_OPTIONS, configureApp } from './../src/configure-app';
import { signPaymentWebhook } from './helpers/sign-payment-webhook';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { markStaffTwoFactorEnabled } from './helpers/staff-two-factor';
import { OrdersService } from '../src/modules/store/orders.service';
import { PaymentsWebhookController } from '../src/modules/store/payments-webhook.controller';
import { PaymentProviderRegistry } from '../src/modules/store/payment/payment-provider.registry';
import { TestPaymentProvider } from '../src/modules/store/payment/test-payment-provider.service';
import { PermissionService } from '../src/modules/roles/permission.service';

// См. auth.e2e-spec.ts — риск конкуренции за ресурсы под полным сьютом.
jest.setTimeout(20_000);

/// Служебные поля товара не должны попадать в ответы покупателю (N3 ревью S1).
const SERVICE_FIELDS = [
  'gameCommands',
  'server',
  'currencyType',
  'currencyAmount',
  'positionId',
  'decorationId',
];
function expectNoServiceFields(body: unknown) {
  const json = JSON.stringify(body);
  for (const field of SERVICE_FIELDS) {
    expect(json).not.toContain(`"${field}"`);
  }
}

describe('Store checkout (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  const unique = randomUUID().slice(0, 8);
  const cleanupRoleSlugs: string[] = [];
  const webhookSecret = E2E_PAYMENT_WEBHOOK_SECRET;
  const aliceNick = `ChkAl${unique}`;
  const bobNick = `ChkBo${unique}`;
  /// Версия оферты по умолчанию (настройка store.offerVersion не задана).
  const ACCEPT_OFFER = { offerVersion: '1' };

  interface TestUser {
    id: string;
    accessToken: string;
    username: string;
    email: string;
  }

  async function createUser(label: string): Promise<TestUser> {
    const email = `chk-${label}-${unique}@example.com`;
    const username = `chk${label}${unique}`
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 16);
    const password = 'Sup3rSecretPassw0rd!';
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ emailOrUsername: email, password })
      .expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return {
      id: user.id,
      accessToken: loginRes.body.accessToken,
      username,
      email,
    };
  }

  async function createRole(slug: string, priority: number) {
    cleanupRoleSlugs.push(slug);
    return prisma.role.create({
      data: {
        name: slug,
        slug,
        displayName: slug,
        priority,
        isSystem: false,
        isAssignable: true,
      },
    });
  }

  async function grantRole(userId: string, roleId: string) {
    await prisma.userRole.create({ data: { userId, roleId } });
    await markStaffTwoFactorEnabled(prisma, userId);
    await permissions.invalidateUser(userId);
  }

  async function grantPermissions(roleId: string, keys: string[]) {
    const records = await prisma.permission.findMany({
      where: { key: { in: keys } },
    });
    await prisma.rolePermission.createMany({
      data: records.map((p) => ({ roleId, permissionId: p.id })),
    });
    await permissions.invalidateRole(roleId);
  }

  let admin: TestUser;
  let alice: TestUser;
  let bob: TestUser;

  let categoryId: string;
  let productId: string;
  let variantId: string;
  let giftableVariantId: string;
  let uniqueVariantId: string;

  const createdOrderNumbers: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication(APP_CREATE_OPTIONS);
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    permissions = app.get(PermissionService);

    admin = await createUser('admin');
    alice = await createUser('alice');
    bob = await createUser('bob');
    // Привязанный Minecraft-ник — ник получателя по умолчанию (0.5).
    for (const [user, name] of [
      [alice, aliceNick],
      [bob, bobNick],
    ] as const) {
      await prisma.minecraftAccount.create({
        data: { userId: user.id, uuid: randomUUID(), name },
      });
    }

    const adminRole = await createRole(`store-chk-admin-${unique}`, 20);
    await grantRole(admin.id, adminRole.id);
    await grantPermissions(adminRole.id, [
      'orders.view',
      'orders.stats',
      'orders.cancel',
      'orders.refund',
      'store.stats',
    ]);

    categoryId = (
      await prisma.category.create({
        data: { name: 'E2E', slug: `e2e-chk-${unique}-cat` },
      })
    ).id;
    const product = await prisma.product.create({
      data: {
        name: 'E2E Checkout Product',
        slug: `e2e-chk-${unique}-product`,
        type: 'PRIVILEGE',
        categoryId,
        isGiftable: false,
        isUnique: false,
        gameCommands: ['lp user {player} parent add e2e'],
        server: 'e2e-server',
        variants: { create: [{ duration: 'MONTH_1', price: 100 }] },
      },
      include: { variants: true },
    });
    productId = product.id;
    variantId = product.variants[0].id;

    const giftableProduct = await prisma.product.create({
      data: {
        name: 'E2E Giftable Product',
        slug: `e2e-chk-${unique}-giftable`,
        type: 'BADGE',
        categoryId,
        isGiftable: true,
        gameCommands: ['lp user {player} parent add e2e'],
        server: 'e2e-server',
        variants: { create: [{ duration: 'FOREVER', price: 50 }] },
      },
      include: { variants: true },
    });
    giftableVariantId = giftableProduct.variants[0].id;

    const uniqueProduct = await prisma.product.create({
      data: {
        name: 'E2E Unique Product',
        slug: `e2e-chk-${unique}-unique`,
        type: 'DECORATION',
        categoryId,
        isUnique: true,
        variants: { create: [{ duration: 'ONE_TIME', price: 20 }] },
      },
      include: { variants: true },
    });
    uniqueVariantId = uniqueProduct.variants[0].id;

    await prisma.bulkDiscount.create({
      data: {
        productId,
        minQuantity: 3,
        discountType: 'PERCENT',
        discountValue: 10,
      },
    });
    await prisma.loyaltyDiscount.create({
      data: {
        minPurchases: 1,
        discountPercent: 5,
        name: `Loyalty checkout ${unique}`,
      },
    });
    await prisma.promoCode.create({
      data: {
        code: `CHK${unique.toUpperCase()}`,
        discountType: 'PERCENT',
        discountValue: 10,
      },
    });
  }, 30_000);

  afterAll(async () => {
    await prisma.order.deleteMany({
      where: { orderNumber: { in: createdOrderNumbers } },
    });
    await prisma.promoCode.deleteMany({
      where: { code: { startsWith: `CHK${unique.toUpperCase()}` } },
    });
    await prisma.loyaltyDiscount.deleteMany({
      where: { name: { contains: unique } },
    });
    await prisma.bulkDiscount.deleteMany({ where: { productId } });
    await prisma.wishlist.deleteMany({
      where: { userId: { in: [alice.id, bob.id] } },
    });
    await prisma.cart.deleteMany({
      where: { userId: { in: [alice.id, bob.id] } },
    });
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `e2e-chk-${unique}` } },
    });
    await prisma.category.deleteMany({
      where: { slug: { startsWith: `e2e-chk-${unique}` } },
    });
    await prisma.userRole.deleteMany({
      where: { role: { slug: { in: cleanupRoleSlugs } } },
    });
    await prisma.rolePermission.deleteMany({
      where: { role: { slug: { in: cleanupRoleSlugs } } },
    });
    await prisma.role.deleteMany({ where: { slug: { in: cleanupRoleSlugs } } });
    await prisma.auditLog.deleteMany({
      where: {
        actor: { email: { in: [admin.email, alice.email, bob.email] } },
      },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [admin.email, alice.email, bob.email] } },
    });
    await app.close();
  }, 20_000);

  const auth = (user: TestUser) => `Bearer ${user.accessToken}`;

  /// Подписанный вебхук тестового провайдера (ADR-0157). Тело — ровно rawBody.
  function postWebhook(
    payload: Record<string, unknown> | string,
    opts: { secret?: string; provider?: string; sign?: boolean } = {},
  ) {
    const signed = signPaymentWebhook(opts.secret ?? webhookSecret, payload);
    const req = request(app.getHttpServer())
      .post(`/webhooks/payments/${opts.provider ?? 'test'}`)
      .set('Content-Type', 'application/json');
    if (opts.sign !== false) {
      req.set(signed.headers);
    }
    return req.send(signed.rawBody);
  }

  async function webhookPayload(
    orderNumber: string,
    over: Record<string, unknown> = {},
  ) {
    const order = await prisma.order.findUniqueOrThrow({
      where: { orderNumber },
    });
    return {
      orderNumber,
      paymentId: order.paymentId,
      status: 'succeeded',
      amount: order.total.toString(),
      currency: 'RUB',
      ...over,
    };
  }

  async function payOrder(orderNumber: string) {
    return postWebhook(await webhookPayload(orderNumber)).expect(200);
  }

  it('webhook secret задан в окружении', () => {
    expect(webhookSecret.length).toBeGreaterThan(0);
  });

  let cartItemId: string;

  it('корзина: добавление товара, получение, пересчёт', async () => {
    const added = await request(app.getHttpServer())
      .post('/store/cart/items')
      .set('Authorization', auth(alice))
      .send({ variantId, quantity: 1 })
      .expect(201);
    cartItemId = added.body.items[0].id;
    expect(added.body.subtotal).toBe('100');
    expect(added.body.total).toBe('100');

    const cart = await request(app.getHttpServer())
      .get('/store/cart')
      .set('Authorization', auth(alice))
      .expect(200);
    expect(cart.body.items).toHaveLength(1);
  });

  it('корзина: bulk-скидка применяется при достижении порога количества', async () => {
    const updated = await request(app.getHttpServer())
      .patch(`/store/cart/items/${cartItemId}`)
      .set('Authorization', auth(alice))
      .send({ quantity: 3 })
      .expect(200);
    expect(updated.body.subtotal).toBe('300');
    expect(updated.body.bulkDiscountTotal).toBe('30');
    expect(updated.body.total).toBe('270');
  });

  it('корзина: подарок — запрещён для не-giftable, разрешён для giftable', async () => {
    await request(app.getHttpServer())
      .post('/store/cart/items')
      .set('Authorization', auth(alice))
      .send({ variantId, quantity: 1, giftToUsername: bob.username })
      .expect(400);

    const gifted = await request(app.getHttpServer())
      .post('/store/cart/items')
      .set('Authorization', auth(alice))
      .send({
        variantId: giftableVariantId,
        quantity: 1,
        giftToUsername: bob.username,
      })
      .expect(201);
    const giftItem = gifted.body.items.find(
      (i: { variantId: string }) => i.variantId === giftableVariantId,
    );
    expect(giftItem.giftToUserId).toBe(bob.id);

    await request(app.getHttpServer())
      .delete(`/store/cart/items/${giftItem.id}`)
      .set('Authorization', auth(alice))
      .expect(200);
  });

  it('корзина: промокод применяется и снимается, calculate учитывает превью', async () => {
    const preview = await request(app.getHttpServer())
      .post('/store/cart/calculate')
      .set('Authorization', auth(alice))
      .send({ promoCode: `CHK${unique.toUpperCase()}` })
      .expect(201);
    expect(Number(preview.body.promoDiscountTotal)).toBeGreaterThan(0);

    const applied = await request(app.getHttpServer())
      .post('/store/cart/apply-promo')
      .set('Authorization', auth(alice))
      .send({ code: `CHK${unique.toUpperCase()}` })
      .expect(201);
    expect(Number(applied.body.promoDiscountTotal)).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .delete('/store/cart/promo')
      .set('Authorization', auth(alice))
      .expect(200);

    const after = await request(app.getHttpServer())
      .get('/store/cart')
      .set('Authorization', auth(alice))
      .expect(200);
    expect(Number(after.body.promoDiscountTotal)).toBe(0);
  });

  let orderNumber: string;
  let firstOrderId: string;

  it('заказ: создание из корзины переводит в PENDING, назначает тестовый провайдер', async () => {
    const created = await request(app.getHttpServer())
      .post('/store/orders')
      .set('Authorization', auth(alice))
      .send(ACCEPT_OFFER)
      .expect(201);
    orderNumber = created.body.order.orderNumber;
    firstOrderId = created.body.order.id;
    createdOrderNumbers.push(orderNumber);
    expectNoServiceFields(created.body);
    expect(created.body.order.status).toBe('PENDING');
    expect(created.body.order.paymentProvider).toBe('test');
    expect(created.body.paymentUrl).toBeNull();

    const cartAfter = await request(app.getHttpServer())
      .get('/store/cart')
      .set('Authorization', auth(alice))
      .expect(200);
    expect(cartAfter.body.items).toHaveLength(0);
  });

  it('заказ: доступен автору, недоступен другому пользователю', async () => {
    const own = await request(app.getHttpServer())
      .get(`/store/orders/${orderNumber}`)
      .set('Authorization', auth(alice))
      .expect(200);
    expectNoServiceFields(own.body);
    const list = await request(app.getHttpServer())
      .get('/store/orders')
      .set('Authorization', auth(alice))
      .expect(200);
    expect(JSON.stringify(list.body)).toContain(orderNumber);
    expectNoServiceFields(list.body);
    await request(app.getHttpServer())
      .get(`/store/orders/${orderNumber}`)
      .set('Authorization', auth(bob))
      .expect(403);
  });

  it('вебхук: без подписи, с чужой подписью и подменой тела — 401, заказ не меняется', async () => {
    const payload = await webhookPayload(orderNumber);
    await postWebhook(payload, { sign: false }).expect(401);
    await postWebhook(payload, { secret: 'wrong-secret' }).expect(401);

    const signed = signPaymentWebhook(webhookSecret, payload);
    await request(app.getHttpServer())
      .post('/webhooks/payments/test')
      .set('Content-Type', 'application/json')
      .set(signed.headers)
      .send(signed.rawBody.replace(orderNumber, 'O-00000000-FFFFFF'))
      .expect(401);
    // Секрет в теле (старый протокол) больше не принимается.
    await request(app.getHttpServer())
      .post('/webhooks/payments/test')
      .send({ ...payload, secret: webhookSecret })
      .expect(401);

    const order = await prisma.order.findUniqueOrThrow({
      where: { orderNumber },
    });
    expect(order.status).toBe('PENDING');
  });

  it('вебхук: неизвестный провайдер — 404', async () => {
    await postWebhook(await webhookPayload(orderNumber), {
      provider: 'nope',
    }).expect(404);
  });

  it('вебхук: переплата и недоплата, чужая валюта, чужой paymentId — отказ без перехода', async () => {
    const order = await prisma.order.findUniqueOrThrow({
      where: { orderNumber },
    });
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ amount: order.total.plus(0.01).toString() }, 'amount_mismatch'],
      [{ amount: order.total.minus(0.01).toString() }, 'amount_mismatch'],
      [{ currency: 'USD' }, 'currency_mismatch'],
      [{ paymentId: 'forged_payment' }, 'payment_id_mismatch'],
    ];
    for (const [over, reason] of cases) {
      const res = await postWebhook(
        await webhookPayload(orderNumber, over),
      ).expect(200);
      expect(res.body).toEqual({ accepted: false, reason });
    }
    const after = await prisma.order.findUniqueOrThrow({
      where: { orderNumber },
    });
    expect(after.status).toBe('PENDING');
    expect(after.paymentId).toBe(order.paymentId);
  });

  it('вебхук: верная подпись завершает заказ, повтор — already_processed', async () => {
    const accepted = await payOrder(orderNumber);
    expect(accepted.body.accepted).toBe(true);

    const order = await prisma.order.findUniqueOrThrow({
      where: { orderNumber },
    });
    expect(order.status).toBe('COMPLETED');
    expect(order.paymentWebhookVerifiedAt).not.toBeNull();

    const replay = await postWebhook(await webhookPayload(orderNumber)).expect(
      200,
    );
    expect(replay.body.reason).toBe('already_processed');

    // failed после COMPLETED статус не меняет.
    await postWebhook(
      await webhookPayload(orderNumber, { status: 'failed' }),
    ).expect(200);
    const still = await prisma.order.findUniqueOrThrow({
      where: { orderNumber },
    });
    expect(still.status).toBe('COMPLETED');
  });

  it.each([2, 10])(
    'вебхук: %i параллельных подписанных запросов — один переход, usedCount === 1, нет 500',
    async (n) => {
      const code = `CHK${unique.toUpperCase()}C${n}`;
      const promo = await prisma.promoCode.create({
        data: { code, discountType: 'PERCENT', discountValue: 10 },
      });
      await request(app.getHttpServer())
        .post('/store/cart/items')
        .set('Authorization', auth(alice))
        .send({ variantId, quantity: 1 })
        .expect(201);
      await request(app.getHttpServer())
        .post('/store/cart/apply-promo')
        .set('Authorization', auth(alice))
        .send({ code })
        .expect(201);
      const created = await request(app.getHttpServer())
        .post('/store/orders')
        .set('Authorization', auth(alice))
        .send(ACCEPT_OFFER)
        .expect(201);
      const number = created.body.order.orderNumber;
      createdOrderNumbers.push(number);
      expect(created.body.order.promoCodeId).toBe(promo.id);

      const payload = await webhookPayload(number);
      const results = await Promise.all(
        Array.from({ length: n }, () => postWebhook(payload)),
      );
      expect(results.map((r) => r.status)).toEqual(Array(n).fill(200));
      const transitions = results.filter((r) => r.body.reason === undefined);
      expect(transitions).toHaveLength(1);
      expect(
        results.filter((r) => r.body.reason === 'already_processed'),
      ).toHaveLength(n - 1);

      const order = await prisma.order.findUniqueOrThrow({
        where: { orderNumber: number },
      });
      expect(order.status).toBe('COMPLETED');
      const after = await prisma.promoCode.findUniqueOrThrow({
        where: { id: promo.id },
      });
      expect(after.usedCount).toBe(1);
    },
  );

  it('заказ: покупка уникального товара второй раз отклоняется', async () => {
    await request(app.getHttpServer())
      .post('/store/cart/items')
      .set('Authorization', auth(alice))
      .send({ variantId: uniqueVariantId, quantity: 1 })
      .expect(201);
    const firstOrder = await request(app.getHttpServer())
      .post('/store/orders')
      .set('Authorization', auth(alice))
      .send(ACCEPT_OFFER)
      .expect(201);
    const firstOrderNumber = firstOrder.body.order.orderNumber;
    createdOrderNumbers.push(firstOrderNumber);
    await payOrder(firstOrderNumber);

    await request(app.getHttpServer())
      .post('/store/cart/items')
      .set('Authorization', auth(alice))
      .send({ variantId: uniqueVariantId, quantity: 1 })
      .expect(201);
    await request(app.getHttpServer())
      .post('/store/orders')
      .set('Authorization', auth(alice))
      .send(ACCEPT_OFFER)
      .expect(400);
  });

  it('quick-buy: анонимная покупка без авторизации с guestMinecraftNick', async () => {
    const res = await request(app.getHttpServer())
      .post('/store/quick-buy')
      .send({
        variantId: giftableVariantId,
        guestMinecraftNick: aliceNick,
        ...ACCEPT_OFFER,
      })
      .expect(201);
    createdOrderNumbers.push(res.body.order.orderNumber);
    expectNoServiceFields(res.body);
    expect(res.body.order.userId).toBeNull();
    expect(res.body.order.guestMinecraftNick).toBe(aliceNick);

    await payOrder(res.body.order.orderNumber);
  });

  it('admin: список заказов, статистика, отмена PENDING, возврат COMPLETED', async () => {
    await request(app.getHttpServer())
      .post('/store/cart/items')
      .set('Authorization', auth(bob))
      .send({ variantId, quantity: 1 })
      .expect(201);
    const pendingOrder = await request(app.getHttpServer())
      .post('/store/orders')
      .set('Authorization', auth(bob))
      .send(ACCEPT_OFFER)
      .expect(201);
    const pendingOrderNumber = pendingOrder.body.order.orderNumber;
    createdOrderNumbers.push(pendingOrderNumber);

    const list = await request(app.getHttpServer())
      .get('/admin/orders')
      .set('Authorization', auth(admin))
      .expect(200);
    expect(
      list.body.items.some(
        (o: { orderNumber: string }) => o.orderNumber === pendingOrderNumber,
      ),
    ).toBe(true);

    const stats = await request(app.getHttpServer())
      .get('/admin/orders/stats')
      .set('Authorization', auth(admin))
      .expect(200);
    expect(stats.body.total).toBeGreaterThan(0);

    const cancelled = await request(app.getHttpServer())
      .patch(`/admin/orders/${pendingOrder.body.order.id}/cancel`)
      .set('Authorization', auth(admin))
      .send({ reason: 'Тест отмены' })
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');

    const refunded = await request(app.getHttpServer())
      .patch(`/admin/orders/${firstOrderId}/refund`)
      .set('Authorization', auth(admin))
      .send({ reason: 'Тест возврата' })
      .expect(200);
    expect(refunded.body.status).toBe('REFUNDED');
  });

  it('wishlist: добавление/удаление, видимость, публичный просмотр, gift из wishlist', async () => {
    const giftableProductId = (
      await prisma.productVariant.findUniqueOrThrow({
        where: { id: giftableVariantId },
      })
    ).productId;

    await request(app.getHttpServer())
      .post(`/store/wishlist/items/${giftableProductId}`)
      .set('Authorization', auth(alice))
      .expect(201);

    const mine = await request(app.getHttpServer())
      .get('/store/wishlist')
      .set('Authorization', auth(alice))
      .expect(200);
    expectNoServiceFields(mine.body);
    expect(
      mine.body.items.some(
        (i: { productId: string }) => i.productId === giftableProductId,
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .patch('/store/wishlist')
      .set('Authorization', auth(alice))
      .send({ isPublic: true })
      .expect(200);

    const publicView = await request(app.getHttpServer())
      .get(`/store/wishlist/${alice.username}`)
      .expect(200);
    expectNoServiceFields(publicView.body);
    expect(
      publicView.body.items.some(
        (i: { productId: string }) => i.productId === giftableProductId,
      ),
    ).toBe(true);

    const gifted = await request(app.getHttpServer())
      .post(`/store/wishlist/items/${giftableProductId}/gift`)
      .set('Authorization', auth(alice))
      .send({ toUsername: bob.username, message: 'С днём рождения!' })
      .expect(201);
    const giftLine = gifted.body.items.find(
      (i: { variantId: string }) => i.variantId === giftableVariantId,
    );
    expect(giftLine.giftToUserId).toBe(bob.id);

    await request(app.getHttpServer())
      .delete(`/store/cart/items/${giftLine.id}`)
      .set('Authorization', auth(alice))
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/store/wishlist/items/${giftableProductId}`)
      .set('Authorization', auth(alice))
      .expect(200);
  });

  it('recent-purchases: публичная лента отражает завершённую покупку', async () => {
    const recent = await request(app.getHttpServer())
      .get('/store/recent-purchases')
      .expect(200);
    expect(Array.isArray(recent.body)).toBe(true);
  });
});

describe('Payment webhook при NODE_ENV=production (e2e, ADR-0157)', () => {
  let app: INestApplication;
  const handleWebhook = jest.fn();

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [PaymentsWebhookController],
      providers: [
        PaymentProviderRegistry,
        TestPaymentProvider,
        { provide: OrdersService, useValue: { handleWebhook } },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'NODE_ENV'
                ? 'production'
                : key === 'PAYMENT_WEBHOOK_SECRET'
                  ? E2E_PAYMENT_WEBHOOK_SECRET
                  : undefined,
          },
        },
      ],
    }).compile();
    app = moduleFixture.createNestApplication(APP_CREATE_OPTIONS);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('тестовый провайдер не зарегистрирован: корректно подписанный вебхук — 404', async () => {
    const signed = signPaymentWebhook(E2E_PAYMENT_WEBHOOK_SECRET, {
      orderNumber: 'O-1',
      paymentId: 'p',
      status: 'succeeded',
      amount: '1',
      currency: 'RUB',
    });
    await request(app.getHttpServer())
      .post('/webhooks/payments/test')
      .set('Content-Type', 'application/json')
      .set(signed.headers)
      .send(signed.rawBody)
      .expect(404);
    expect(handleWebhook).not.toHaveBeenCalled();
  });
});
