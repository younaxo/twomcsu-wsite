import { restoreQuickBuyEnv } from './helpers/quick-buy-disabled-env';
import { E2E_PAYMENT_WEBHOOK_SECRET } from './helpers/payment-webhook-env';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { APP_CREATE_OPTIONS, configureApp } from './../src/configure-app';
import { signPaymentWebhook } from './helpers/sign-payment-webhook';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PaymentProviderRegistry } from '../src/modules/store/payment/payment-provider.registry';

// Подэтап 0.5: production-подобная конфигурация магазина — провайдера нет,
// quick-buy выключен (helpers/quick-buy-disabled-env задаёт переменную до
// загрузки AppModule и возвращается в afterAll).
jest.setTimeout(30_000);

describe('Store checkout 0.5: без провайдера и без quick-buy (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const unique = randomUUID().slice(0, 8);
  const nick = `NoPay${unique}`;
  let accessToken: string;
  let userId: string;
  let variantId: string;
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PaymentProviderRegistry)
      .useValue({ get: () => undefined, getConfigured: () => undefined })
      .compile();
    app = moduleFixture.createNestApplication(APP_CREATE_OPTIONS);
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const email = `nopay-${unique}@example.com`;
    const username = `nopay${unique}`;
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
      data: { name: 'E2E nopay', slug: `e2e-nopay-${unique}-cat` },
    });
    const product = await prisma.product.create({
      data: {
        name: 'E2E NoPay Product',
        slug: `e2e-nopay-${unique}-product`,
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
  });

  afterAll(async () => {
    restoreQuickBuyEnv();
    if (prisma) {
      await prisma.cart.deleteMany({ where: { userId } });
      await prisma.product.deleteMany({
        where: { slug: { startsWith: `e2e-nopay-${unique}` } },
      });
      await prisma.category.deleteMany({
        where: { slug: { startsWith: `e2e-nopay-${unique}` } },
      });
      await prisma.auditLog.deleteMany({ where: { actorId: userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await app?.close();
  }, 30_000);

  it('checkout-config честно сообщает: оплата недоступна, quick-buy выключен', async () => {
    const res = await api().get('/store/checkout-config').expect(200);
    expect(res.body).toMatchObject({
      paymentAvailable: false,
      quickBuyEnabled: false,
    });
  });

  it('оформление без провайдера — 503 payment_unavailable, заказ не создан, корзина цела', async () => {
    await api()
      .post('/store/cart/items')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ variantId, quantity: 1 })
      .expect(201);
    const res = await api()
      .post('/store/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ offerVersion: '1' })
      .expect(503);
    expect(res.body.code).toBe('payment_unavailable');
    expect(res.body.message).toBe('Оплата временно недоступна');
    expect(await prisma.order.count({ where: { userId } })).toBe(0);
    const cart = await api()
      .get('/store/cart')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(cart.body.items).toHaveLength(1);
  });

  it('quick-buy выключен — 403 quick_buy_disabled, заказ не создан', async () => {
    const before = await prisma.order.count();
    const res = await api()
      .post('/store/quick-buy')
      .send({ variantId, guestMinecraftNick: nick, offerVersion: '1' })
      .expect(403);
    expect(res.body.code).toBe('quick_buy_disabled');
    expect(await prisma.order.count()).toBe(before);
  });

  it('вебхук при пустом реестре — 404, фейк-успеха нет', async () => {
    const signed = signPaymentWebhook(E2E_PAYMENT_WEBHOOK_SECRET, {
      orderNumber: 'O-1',
      paymentId: 'p',
      status: 'succeeded',
      amount: '1',
      currency: 'RUB',
    });
    await api()
      .post('/webhooks/payments/test')
      .set('Content-Type', 'application/json')
      .set(signed.headers)
      .send(signed.rawBody)
      .expect(404);
  });
});
