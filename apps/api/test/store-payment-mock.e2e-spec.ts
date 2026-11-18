import {
  MOCK_API_KEY,
  MOCK_PROVIDER_PORT,
  MOCK_WEBHOOK_SECRET,
  MOCK_WEBHOOK_SECRET_PREVIOUS,
  restoreMockPaymentEnv,
} from './helpers/mock-payment-env';
import { Prisma } from '@prisma/client';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { APP_CREATE_OPTIONS, configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PaymentProviderRegistry } from '../src/modules/store/payment/payment-provider.registry';
import { MockPaymentProvider } from './helpers/mock-payment-provider';
import { signPaymentWebhook } from './helpers/sign-payment-webhook';

// Подэтап 0.8a (ADR-0187): адаптер mock-http против локального мок-сервера.
// Без внешней сети; настройка окружения — helpers/mock-payment-env.
jest.setTimeout(30_000);

describe('Store payment: mock-http провайдер (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mock: MockPaymentProvider;
  const unique = randomUUID().slice(0, 8);
  const nick = `MockPay${unique}`;
  let accessToken: string;
  let userId: string;
  let variantId: string;
  const createdOrders: string[] = [];
  const api = () => request(app.getHttpServer());

  async function createOrder(): Promise<{
    orderNumber: string;
    paymentId: string;
  }> {
    await api()
      .post('/store/cart/items')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ variantId, quantity: 1 })
      .expect(201);
    const created = await api()
      .post('/store/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ offerVersion: '1' })
      .expect(201);
    const orderNumber = created.body.order.orderNumber as string;
    createdOrders.push(orderNumber);
    const stored = await prisma.order.findUniqueOrThrow({
      where: { orderNumber },
    });
    expect(stored.paymentProvider).toBe('mock-http');
    expect(stored.status).toBe('PENDING');
    return { orderNumber, paymentId: stored.paymentId as string };
  }

  function postWebhook(signed: ReturnType<typeof signPaymentWebhook>) {
    return api()
      .post('/webhooks/payments/mock-http')
      .set('Content-Type', 'application/json')
      .set(signed.headers)
      .send(signed.rawBody);
  }

  const statusOf = async (orderNumber: string) =>
    (await prisma.order.findUniqueOrThrow({ where: { orderNumber } })).status;

  beforeAll(async () => {
    mock = new MockPaymentProvider({ apiKey: MOCK_API_KEY });
    await mock.start(MOCK_PROVIDER_PORT);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication(APP_CREATE_OPTIONS);
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const email = `mockpay-${unique}@example.com`;
    const username = `mockpay${unique}`;
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
      data: { userId, uuid: randomUUID(), name: nick },
    });
    const category = await prisma.category.create({
      data: { name: 'E2E mockpay', slug: `e2e-mockpay-${unique}-cat` },
    });
    const product = await prisma.product.create({
      data: {
        name: 'E2E MockPay Product',
        slug: `e2e-mockpay-${unique}-product`,
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

  afterAll(async () => {
    restoreMockPaymentEnv();
    if (prisma) {
      await prisma.order.deleteMany({
        where: { orderNumber: { in: createdOrders } },
      });
      await prisma.cart.deleteMany({ where: { userId } });
      await prisma.product.deleteMany({
        where: { slug: { startsWith: `e2e-mockpay-${unique}` } },
      });
      await prisma.category.deleteMany({
        where: { slug: { startsWith: `e2e-mockpay-${unique}` } },
      });
      await prisma.auditLog.deleteMany({ where: { actorId: userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await app?.close();
    await mock?.stop();
  }, 30_000);

  it('успех: платёж создан у мок-провайдера, вебхук завершает заказ, повтор — already_processed', async () => {
    const { orderNumber, paymentId } = await createOrder();
    expect(paymentId).toMatch(/^mock_/);
    expect(mock.countRequests('POST', '/payments')).toBeGreaterThan(0);
    mock.succeed(paymentId);
    const ok = await postWebhook(
      mock.webhook(MOCK_WEBHOOK_SECRET, paymentId, 'succeeded', orderNumber),
    ).expect(200);
    expect(ok.body.accepted).toBe(true);
    expect(await statusOf(orderNumber)).toBe('COMPLETED');

    const replay = await postWebhook(
      mock.webhook(MOCK_WEBHOOK_SECRET, paymentId, 'succeeded', orderNumber),
    ).expect(200);
    expect(replay.body.reason).toBe('already_processed');
    expect(await statusOf(orderNumber)).toBe('COMPLETED');
  });

  it('отказ, затем поздний succeeded: FAILED -> COMPLETED', async () => {
    const { orderNumber, paymentId } = await createOrder();
    mock.fail(paymentId);
    await postWebhook(
      mock.webhook(MOCK_WEBHOOK_SECRET, paymentId, 'failed', orderNumber),
    ).expect(200);
    expect(await statusOf(orderNumber)).toBe('FAILED');

    mock.succeed(paymentId);
    await postWebhook(
      mock.webhook(MOCK_WEBHOOK_SECRET, paymentId, 'succeeded', orderNumber),
    ).expect(200);
    expect(await statusOf(orderNumber)).toBe('COMPLETED');
  });

  it('ротация: чужой и короткий секреты — 401; предыдущий секрет принимается', async () => {
    const { orderNumber, paymentId } = await createOrder();
    mock.succeed(paymentId);
    await postWebhook(
      mock.webhook(
        'wrong-secret-wrong-secret-wrong-secret-00',
        paymentId,
        'succeeded',
        orderNumber,
      ),
    ).expect(401);
    await postWebhook(
      mock.webhook('short', paymentId, 'succeeded', orderNumber),
    ).expect(401);
    expect(await statusOf(orderNumber)).toBe('PENDING');

    await postWebhook(
      mock.webhook(
        MOCK_WEBHOOK_SECRET_PREVIOUS,
        paymentId,
        'succeeded',
        orderNumber,
      ),
    ).expect(200);
    expect(await statusOf(orderNumber)).toBe('COMPLETED');
  });

  it('getPaymentStatus и возврат: частичный, затем остаток; повтор с тем же ключом не дублирует', async () => {
    const { orderNumber, paymentId } = await createOrder();
    mock.succeed(paymentId);
    await postWebhook(
      mock.webhook(MOCK_WEBHOOK_SECRET, paymentId, 'succeeded', orderNumber),
    ).expect(200);

    const provider = app.get(PaymentProviderRegistry).get('mock-http')!;
    const status = await provider.getPaymentStatus(paymentId);
    expect(status.status).toBe('succeeded');

    const part = await provider.refund(
      paymentId,
      new Prisma.Decimal(30),
      `e2e-${unique}-part`,
    );
    expect(part.amount.toString()).toBe('30');
    const again = await provider.refund(
      paymentId,
      new Prisma.Decimal(30),
      `e2e-${unique}-part`,
    );
    expect(again.refundId).toBe(part.refundId);
    const rest = await provider.refund(
      paymentId,
      new Prisma.Decimal(70),
      `e2e-${unique}-rest`,
    );
    expect(rest.refundId).not.toBe(part.refundId);
    await expect(
      provider.refund(paymentId, new Prisma.Decimal(1), `e2e-${unique}-over`),
    ).rejects.toMatchObject({ code: 'refund_not_allowed' });
  });

  it('временный сбой 5xx: ретрай адаптера, запрос проходит', async () => {
    const before = mock.requests.length;
    mock.failNext(1, 503);
    const { orderNumber } = await createOrder();
    expect(orderNumber).toBeTruthy();
    expect(mock.requests.length - before).toBeGreaterThanOrEqual(2);
  });
});
