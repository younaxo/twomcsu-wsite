import { E2E_PAYMENT_WEBHOOK_SECRET } from './helpers/payment-webhook-env';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { APP_CREATE_OPTIONS, configureApp } from './../src/configure-app';
import { signPaymentWebhook } from './helpers/sign-payment-webhook';
import { PrismaService } from '../src/modules/prisma/prisma.service';

// Подэтап 0.5: акцепт оферты, ник получателя (ADR-0186), статус заказа и вебхук.
// Отдельный файл: обычные store-checkout/store-cart не затрагиваются.
jest.setTimeout(30_000);

describe('Store checkout 0.5: оферта, ник, статус, вебхук (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const unique = randomUUID().slice(0, 8);
  const OFFER_SETTING = 'store.offerVersion';

  interface TestUser {
    id: string;
    accessToken: string;
    username: string;
    email: string;
  }

  async function createUser(label: string): Promise<TestUser> {
    const email = `off-${label}-${unique}@example.com`;
    const username = `off${label}${unique}`
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

  let alice: TestUser;
  let bob: TestUser;
  let loner: TestUser; // без привязанного Minecraft-ника
  let variantId: string;
  const aliceNick = `OffAl${unique}`;
  const bobNick = `OffBo${unique}`;
  const auth = (u: TestUser) => `Bearer ${u.accessToken}`;
  const api = () => request(app.getHttpServer());

  async function fillCart(user: TestUser) {
    await api()
      .post('/store/cart/items')
      .set('Authorization', auth(user))
      .send({ variantId, quantity: 1 })
      .expect(201);
  }

  async function cartCount(user: TestUser) {
    const res = await api()
      .get('/store/cart')
      .set('Authorization', auth(user))
      .expect(200);
    return res.body.items.length as number;
  }

  function postWebhook(
    payload: Record<string, unknown> | string,
    opts: { secret?: string; sign?: boolean } = {},
  ) {
    const signed = signPaymentWebhook(
      opts.secret ?? E2E_PAYMENT_WEBHOOK_SECRET,
      payload,
    );
    const req = api()
      .post('/webhooks/payments/test')
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
    loner = await createUser('loner');
    for (const [user, name] of [
      [alice, aliceNick],
      [bob, bobNick],
    ] as const) {
      await prisma.minecraftAccount.create({
        data: { userId: user.id, uuid: randomUUID(), name },
      });
    }
    const category = await prisma.category.create({
      data: { name: 'E2E offer', slug: `e2e-off-${unique}-cat` },
    });
    const product = await prisma.product.create({
      data: {
        name: 'E2E Offer Product',
        slug: `e2e-off-${unique}-product`,
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
    const users = [alice, bob, loner].filter(Boolean).map((u) => u.id);
    await prisma.siteSetting.deleteMany({ where: { key: OFFER_SETTING } });
    await prisma.order.deleteMany({ where: { userId: { in: users } } });
    await prisma.cart.deleteMany({ where: { userId: { in: users } } });
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `e2e-off-${unique}` } },
    });
    await prisma.category.deleteMany({
      where: { slug: { startsWith: `e2e-off-${unique}` } },
    });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  }, 30_000);

  it('checkout-config: версия оферты, оплата доступна, quick-buy включён в test', async () => {
    const res = await api().get('/store/checkout-config').expect(200);
    expect(res.body).toEqual({
      offerVersion: '1',
      paymentAvailable: true,
      quickBuyEnabled: true,
    });
  });

  describe('акцепт оферты', () => {
    it('без версии — 400 offer_not_accepted, заказ не создан, корзина цела', async () => {
      await fillCart(alice);
      const res = await api()
        .post('/store/orders')
        .set('Authorization', auth(alice))
        .send({})
        .expect(400);
      expect(res.body.code).toBe('offer_not_accepted');
      expect(await prisma.order.count({ where: { userId: alice.id } })).toBe(0);
      expect(await cartCount(alice)).toBe(1);
    });

    it('устаревшая версия — 400 offer_version_mismatch', async () => {
      const res = await api()
        .post('/store/orders')
        .set('Authorization', auth(alice))
        .send({ offerVersion: '0' })
        .expect(400);
      expect(res.body.code).toBe('offer_version_mismatch');
      expect(await prisma.order.count({ where: { userId: alice.id } })).toBe(0);
    });

    it('текущая версия из настройки store.offerVersion сохраняется в заказе вместе со временем акцепта', async () => {
      await prisma.siteSetting.upsert({
        where: { key: OFFER_SETTING },
        create: { key: OFFER_SETTING, value: `v-${unique}` },
        update: { value: `v-${unique}` },
      });
      // прежняя версия «1» после смены оферты больше не принимается
      await api()
        .post('/store/orders')
        .set('Authorization', auth(alice))
        .send({ offerVersion: '1' })
        .expect(400);

      const before = Date.now();
      const res = await api()
        .post('/store/orders')
        .set('Authorization', auth(alice))
        .send({ offerVersion: `v-${unique}` })
        .expect(201);
      const stored = await prisma.order.findUniqueOrThrow({
        where: { orderNumber: res.body.order.orderNumber },
      });
      expect(stored.offerVersion).toBe(`v-${unique}`);
      expect(stored.offerAcceptedAt).not.toBeNull();
      expect(stored.offerAcceptedAt!.getTime()).toBeGreaterThanOrEqual(
        before - 1000,
      );
      expect(await cartCount(alice)).toBe(0);

      await prisma.siteSetting.delete({ where: { key: OFFER_SETTING } });
    });
  });

  describe('ник получателя (ADR-0186)', () => {
    it('без targetMinecraftNick — свой привязанный ник', async () => {
      await fillCart(alice);
      const res = await api()
        .post('/store/orders')
        .set('Authorization', auth(alice))
        .send({ offerVersion: '1' })
        .expect(201);
      expect(res.body.order.guestMinecraftNick).toBe(aliceNick);
    });

    it('чужой, но известный сайту ник (регистр не важен) — принимается, сохраняется каноническое написание', async () => {
      await fillCart(alice);
      const res = await api()
        .post('/store/orders')
        .set('Authorization', auth(alice))
        .send({ offerVersion: '1', targetMinecraftNick: bobNick.toLowerCase() })
        .expect(201);
      expect(res.body.order.guestMinecraftNick).toBe(bobNick);
    });

    it('неизвестный ник — единый 400 nick_unavailable, заказ не создан, корзина цела', async () => {
      await fillCart(alice);
      const ordersBefore = await prisma.order.count({
        where: { userId: alice.id },
      });
      const res = await api()
        .post('/store/orders')
        .set('Authorization', auth(alice))
        .send({ offerVersion: '1', targetMinecraftNick: `Ghost${unique}` })
        .expect(400);
      expect(res.body.code).toBe('nick_unavailable');
      expect(JSON.stringify(res.body)).not.toContain(bobNick);
      expect(await prisma.order.count({ where: { userId: alice.id } })).toBe(
        ordersBefore,
      );
      expect(await cartCount(alice)).toBe(1);
    });

    it('без привязанного ника и без targetMinecraftNick — 400 nick_required', async () => {
      await fillCart(loner);
      const res = await api()
        .post('/store/orders')
        .set('Authorization', auth(loner))
        .send({ offerVersion: '1' })
        .expect(400);
      expect(res.body.code).toBe('nick_required');
    });

    it('quick-buy: неизвестный ник — nick_unavailable, известный — заказ; без оферты — offer_not_accepted', async () => {
      const noOffer = await api()
        .post('/store/quick-buy')
        .send({ variantId, guestMinecraftNick: aliceNick })
        .expect(400);
      expect(noOffer.body.code).toBe('offer_not_accepted');
      const unknown = await api()
        .post('/store/quick-buy')
        .send({
          variantId,
          guestMinecraftNick: `Ghost${unique}`,
          offerVersion: '1',
        })
        .expect(400);
      expect(unknown.body.code).toBe('nick_unavailable');
      const ok = await api()
        .post('/store/quick-buy')
        .send({ variantId, guestMinecraftNick: aliceNick, offerVersion: '1' })
        .expect(201);
      expect(ok.body.order.userId).toBeNull();
      expect(ok.body.order.guestMinecraftNick).toBe(aliceNick);
      await prisma.order.delete({
        where: { orderNumber: ok.body.order.orderNumber },
      });
    });
  });

  describe('статус заказа и вебхук', () => {
    let orderNumber: string;

    it('заказ создаётся PENDING, владелец читает статус, чужой — 403', async () => {
      await fillCart(bob);
      const created = await api()
        .post('/store/orders')
        .set('Authorization', auth(bob))
        .send({ offerVersion: '1' })
        .expect(201);
      orderNumber = created.body.order.orderNumber;
      expect(created.body.order.status).toBe('PENDING');
      expect(created.body.paymentUrl).toBeNull();

      const own = await api()
        .get(`/store/orders/${orderNumber}`)
        .set('Authorization', auth(bob))
        .expect(200);
      expect(own.body.status).toBe('PENDING');
      await api()
        .get(`/store/orders/${orderNumber}`)
        .set('Authorization', auth(alice))
        .expect(403);
    });

    it('неверная подпись — 401, статус не меняется', async () => {
      const payload = await webhookPayload(orderNumber);
      await postWebhook(payload, { secret: 'not-the-secret' }).expect(401);
      await postWebhook(payload, { sign: false }).expect(401);
      const o = await prisma.order.findUniqueOrThrow({
        where: { orderNumber },
      });
      expect(o.status).toBe('PENDING');
      expect(o.paymentWebhookVerifiedAt).toBeNull();
    });

    it('сумма и валюта сверяются: расхождение не завершает заказ', async () => {
      const base = await webhookPayload(orderNumber);
      const wrongAmount = await postWebhook({
        ...base,
        amount: '99.00',
      }).expect(200);
      expect(wrongAmount.body).toEqual({
        accepted: false,
        reason: 'amount_mismatch',
      });
      const wrongCurrency = await postWebhook({
        ...base,
        currency: 'USD',
      }).expect(200);
      expect(wrongCurrency.body).toEqual({
        accepted: false,
        reason: 'currency_mismatch',
      });
      const o = await prisma.order.findUniqueOrThrow({
        where: { orderNumber },
      });
      expect(o.status).toBe('PENDING');
    });

    it('верный вебхук завершает заказ (опрос видит COMPLETED); повтор идемпотентен', async () => {
      const payload = await webhookPayload(orderNumber);
      const first = await postWebhook(payload).expect(200);
      expect(first.body.reason).toBeUndefined();
      const polled = await api()
        .get(`/store/orders/${orderNumber}`)
        .set('Authorization', auth(bob))
        .expect(200);
      expect(polled.body.status).toBe('COMPLETED');
      const paidAt = polled.body.paidAt;
      expect(paidAt).toBeTruthy();

      const again = await postWebhook(payload).expect(200);
      expect(again.body).toEqual({
        accepted: true,
        reason: 'already_processed',
      });
      const failedLater = await postWebhook({
        ...payload,
        status: 'failed',
      }).expect(200);
      expect(failedLater.body.reason).toBe('already_processed');
      const final = await prisma.order.findUniqueOrThrow({
        where: { orderNumber },
      });
      expect(final.status).toBe('COMPLETED');
      expect(final.paidAt!.toISOString()).toBe(
        new Date(paidAt as string).toISOString(),
      );
    });
  });
});
