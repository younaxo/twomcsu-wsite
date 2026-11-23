import { E2E_PAYMENT_WEBHOOK_SECRET } from './helpers/payment-webhook-env';
import { restorePaymentRouterEnv } from './helpers/payment-router-env';
import { Prisma } from '@prisma/client';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { APP_CREATE_OPTIONS, configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PaymentProviderRegistry } from '../src/modules/store/payment/payment-provider.registry';
import { signPaymentWebhook } from './helpers/sign-payment-webhook';

jest.setTimeout(30_000);

/// 0.8b (ADR-0193): маршрутизатор способов оплаты на мок-провайдерах.
describe('Store payment router (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const unique = randomUUID().slice(0, 8);
  let accessToken: string;
  let userId = '';
  let variantId: string;
  const createdOrders: string[] = [];
  const api = () => request(app.getHttpServer());

  async function addToCart() {
    await api()
      .post('/store/cart/items')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ variantId, quantity: 1 })
      .expect(201);
  }

  function checkout(body: Record<string, unknown>) {
    return api()
      .post('/store/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ offerVersion: '1', ...body });
  }

  async function orderWith(method: string) {
    await addToCart();
    const res = await checkout({ paymentMethod: method }).expect(201);
    const orderNumber = res.body.order.orderNumber as string;
    createdOrders.push(orderNumber);
    return prisma.order.findUniqueOrThrow({ where: { orderNumber } });
  }

  function postWebhook(provider: string, body: Record<string, unknown>) {
    const signed = signPaymentWebhook(E2E_PAYMENT_WEBHOOK_SECRET, body);
    return api()
      .post(`/webhooks/payments/${provider}`)
      .set('Content-Type', 'application/json')
      .set(signed.headers)
      .send(signed.rawBody);
  }

  const event = (
    order: { orderNumber: string; paymentId: string | null },
    status: 'succeeded' | 'failed' = 'succeeded',
  ) => ({
    orderNumber: order.orderNumber,
    paymentId: order.paymentId,
    status,
    amount: '100.00',
    currency: 'RUB',
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication(APP_CREATE_OPTIONS);
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const email = `payrouter-${unique}@example.com`;
    // DTO: username 3..16 символов; `pr` + 8 hex = 10.
    const username = `pr${unique}`;
    const password = 'Sup3rSecretPassw0rd!';
    await api()
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);
    const login = await api()
      .post('/auth/login')
      .send({ emailOrUsername: email, password })
      .expect(200);
    accessToken = login.body.accessToken;
    userId = (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
    await prisma.minecraftAccount.create({
      data: { userId, uuid: randomUUID(), name: `Pr${unique}` },
    });
    const category = await prisma.category.create({
      data: { name: 'E2E payrouter', slug: `e2e-payrouter-${unique}-cat` },
    });
    const product = await prisma.product.create({
      data: {
        name: 'E2E PayRouter Product',
        slug: `e2e-payrouter-${unique}-product`,
        type: 'PRIVILEGE',
        categoryId: category.id,
        isGiftable: false,
        isUnique: false,
        gameCommands: ['lp user {player} parent add e2e'],
        server: 'e2e-server',
        variants: { create: [{ duration: 'MONTH_1', price: 100 }] },
      },
      include: { variants: true },
    });
    variantId = product.variants[0].id;
  }, 30_000);

  afterEach(() => {
    const storage = app.get<{ storage: Record<string, unknown> }>(
      ThrottlerStorage,
    );
    for (const key of Object.keys(storage.storage)) delete storage.storage[key];
  });

  afterAll(async () => {
    restorePaymentRouterEnv();
    if (prisma) {
      await prisma.order.deleteMany({
        where: { orderNumber: { in: createdOrders } },
      });
      await prisma.product.deleteMany({
        where: { slug: { startsWith: `e2e-payrouter-${unique}` } },
      });
      await prisma.category.deleteMany({
        where: { slug: { startsWith: `e2e-payrouter-${unique}` } },
      });
      // userId может быть не задан (сбой beforeAll): undefined в where Prisma
      // игнорирует, и deleteMany снёс бы ВСЕХ пользователей общей БД.
      if (userId) {
        await prisma.cart.deleteMany({ where: { userId } });
        await prisma.auditLog.deleteMany({ where: { actorId: userId } });
        await prisma.user.deleteMany({ where: { id: userId } });
      }
    }
    await app?.close();
  }, 30_000);

  it('GET /store/payment-methods: только включённые способы и публичные поля', async () => {
    const res = await api().get('/store/payment-methods').expect(200);
    const codes = (res.body.methods as { code: string }[]).map((m) => m.code);
    expect(codes).toEqual(['SBP', 'CARD_RU', 'CRYPTO', 'CARD_FOREIGN']);
    for (const m of res.body.methods) {
      expect(Object.keys(m).sort()).toEqual(['code', 'currency', 'title']);
    }
    const config = await api().get('/store/checkout-config').expect(200);
    expect(config.body.paymentAvailable).toBe(true);
  });

  it('способ не выбран / неизвестный / выключен: 400 с кодом, заказ не создан', async () => {
    await addToCart();
    const before = await prisma.order.count({ where: { userId } });

    const none = await checkout({}).expect(400);
    expect(none.body.code).toBe('payment_method_required');
    const invalid = await checkout({ paymentMethod: 'BITCOIN' }).expect(400);
    expect(invalid.body.code).toBe('payment_method_invalid');
    const disabled = await checkout({ paymentMethod: 'SBERPAY' }).expect(400);
    expect(disabled.body.code).toBe('payment_method_unavailable');

    expect(await prisma.order.count({ where: { userId } })).toBe(before);
    // Корзина цела для следующих проверок.
    const cart = await api()
      .get('/store/cart')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(cart.body.items?.length ?? 0).toBeGreaterThan(0);
  });

  it('СБП: способ и провайдер сохранены, вебхук mock-ru завершает заказ, повтор идемпотентен', async () => {
    const order = await orderWith('SBP');
    expect(order.paymentMethod).toBe('SBP');
    expect(order.paymentProvider).toBe('mock-ru');
    expect(order.paymentId).toBe(`mockru_${order.orderNumber}`);

    const ok = await postWebhook('mock-ru', event(order)).expect(200);
    expect(ok.body.accepted).toBe(true);
    const replay = await postWebhook('mock-ru', event(order)).expect(200);
    expect(replay.body.reason).toBe('already_processed');
    const after = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(after.status).toBe('COMPLETED');
  });

  it('вебхук чужого провайдера отклонён, неизвестный маршрут — 404, плохая подпись — 401', async () => {
    const order = await orderWith('CARD_RU');
    expect(order.paymentProvider).toBe('mock-ru');

    const wrong = await postWebhook('mock-crypto', event(order)).expect(200);
    expect(wrong.body).toMatchObject({
      accepted: false,
      reason: 'provider_mismatch',
    });
    await postWebhook('no-such-provider', event(order)).expect(404);
    await api()
      .post('/webhooks/payments/mock-ru')
      .set('Content-Type', 'application/json')
      .set(signPaymentWebhook('x'.repeat(40), event(order)).headers)
      .send(JSON.stringify(event(order)))
      .expect(401);
    const still = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(still.status).toBe('PENDING');
  });

  it('крипто: возврат через провайдера платежа с идемпотентным ключом', async () => {
    const order = await orderWith('CRYPTO');
    expect(order.paymentProvider).toBe('mock-crypto');
    await postWebhook('mock-crypto', event(order)).expect(200);

    const provider = app
      .get(PaymentProviderRegistry)
      .get(order.paymentProvider as string)!;
    const key = `e2e-${unique}-crypto`;
    const first = await provider.refund(
      order.paymentId as string,
      new Prisma.Decimal(40),
      key,
    );
    const again = await provider.refund(
      order.paymentId as string,
      new Prisma.Decimal(40),
      key,
    );
    expect(again.refundId).toBe(first.refundId);
    const status = await provider.getPaymentStatus(order.paymentId as string);
    expect(status.refundedAmount.toString()).toBe('40');
    await expect(
      provider.refund(
        order.paymentId as string,
        new Prisma.Decimal(61),
        `${key}-over`,
      ),
    ).rejects.toMatchObject({ code: 'refund_not_allowed' });
  });

  it('иностранная карта: платёж создан у mock-foreign, отказ даёт FAILED', async () => {
    const order = await orderWith('CARD_FOREIGN');
    expect(order.paymentProvider).toBe('mock-foreign');
    await postWebhook('mock-foreign', event(order, 'failed')).expect(200);
    const after = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(after.status).toBe('FAILED');
  });
});
