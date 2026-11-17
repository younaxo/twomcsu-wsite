import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { APP_CREATE_OPTIONS, configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { RedisService } from '../src/modules/redis/redis.service';

// См. auth.e2e-spec.ts — риск конкуренции за ресурсы под полным сьютом.
jest.setTimeout(20_000);

/// Серверные лимиты корзины, коды ошибок промокода, promoError, публичные поля
/// (S1, A1, A2, A3, N2 — отчёт 2026-11-18-store-cart-server-limits).
describe('Store cart: серверные лимиты и коды ошибок (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  const unique = randomUUID().slice(0, 8);
  const tag = unique.toUpperCase();

  interface TestUser {
    id: string;
    accessToken: string;
    username: string;
    email: string;
  }
  async function createUser(
    label: string,
    exactUsername?: string,
  ): Promise<TestUser> {
    const email = `cart-${label}-${unique}@example.com`;
    const username =
      exactUsername ??
      `ct${label}${unique}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
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
  let categoryId: string;
  // обычный товар с maxPerPurchase = 3 и двумя вариантами
  let limitedProductId: string;
  let limitedVariantA: string;
  let limitedVariantB: string;
  let uniqueProductId: string;
  let uniqueVariant: string;
  let giftableVariant: string;
  let plainVariant: string;
  let bundleId: string;

  const auth = (u: TestUser) => `Bearer ${u.accessToken}`;
  const api = () => request(app.getHttpServer());

  const addItem = (u: TestUser, body: Record<string, unknown>) =>
    api().post('/store/cart/items').set('Authorization', auth(u)).send(body);
  const getCart = (u: TestUser) =>
    api().get('/store/cart').set('Authorization', auth(u));
  const clearCart = async (u: TestUser) => {
    await api().delete('/store/cart').set('Authorization', auth(u)).expect(200);
    await api()
      .delete('/store/cart/promo')
      .set('Authorization', auth(u))
      .expect(200);
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication(APP_CREATE_OPTIONS);
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);

    alice = await createUser('alice');
    bob = await createUser('bob');

    categoryId = (
      await prisma.category.create({
        data: { name: 'E2E cart', slug: `e2e-cart-${unique}-cat` },
      })
    ).id;
    const limited = await prisma.product.create({
      data: {
        name: 'Cart Limited',
        slug: `e2e-cart-${unique}-limited`,
        type: 'PRIVILEGE',
        categoryId,
        isGiftable: true,
        maxPerPurchase: 3,
        gameCommands: ['lp user {player} parent add e2e'],
        server: 'e2e-server',
        variants: {
          create: [
            { duration: 'MONTH_1', price: 100 },
            { duration: 'MONTHS_3', price: 250 },
          ],
        },
      },
      include: { variants: { orderBy: { price: 'asc' } } },
    });
    limitedProductId = limited.id;
    limitedVariantA = limited.variants[0].id;
    limitedVariantB = limited.variants[1].id;

    const uniq = await prisma.product.create({
      data: {
        name: 'Cart Unique',
        slug: `e2e-cart-${unique}-unique`,
        type: 'DECORATION',
        categoryId,
        isUnique: true,
        variants: { create: [{ duration: 'ONE_TIME', price: 20 }] },
      },
      include: { variants: true },
    });
    uniqueProductId = uniq.id;
    uniqueVariant = uniq.variants[0].id;

    const giftable = await prisma.product.create({
      data: {
        name: 'Cart Giftable',
        slug: `e2e-cart-${unique}-giftable`,
        type: 'BADGE',
        categoryId,
        isGiftable: true,
        variants: { create: [{ duration: 'FOREVER', price: 50 }] },
      },
      include: { variants: true },
    });
    giftableVariant = giftable.variants[0].id;

    const plain = await prisma.product.create({
      data: {
        name: 'Cart Plain',
        slug: `e2e-cart-${unique}-plain`,
        type: 'PRIVILEGE',
        categoryId,
        isGiftable: false,
        variants: { create: [{ duration: 'MONTH_1', price: 100 }] },
      },
      include: { variants: true },
    });
    plainVariant = plain.variants[0].id;

    const bundle = await prisma.bundle.create({
      data: {
        name: 'Cart Bundle',
        slug: `e2e-cart-${unique}-bundle`,
        totalPrice: 300,
        originalPrice: 350,
      },
    });
    bundleId = bundle.id;

    const mk = (suffix: string, data: Record<string, unknown>) =>
      prisma.promoCode.create({
        data: {
          code: `CT${tag}${suffix}`,
          discountType: 'PERCENT',
          discountValue: 10,
          ...data,
        } as never,
      });
    await mk('OK', {
      description: 'Скидка 10%',
      maxUses: 100,
      usedCount: 5,
      minOrderAmount: 10,
      firstPurchaseOnly: true,
    });
    await mk('EXP', { validUntil: new Date(Date.now() - 86_400_000) });
    await mk('FUT', { validFrom: new Date(Date.now() + 86_400_000) });
    await mk('USED', { maxUses: 1, usedCount: 1 });
    await mk('MIN', { minOrderAmount: 100000 });
    await mk('TYPE', { applicableToTypes: ['KEY'] });
    await mk('OFF', { isActive: false });
  }, 30_000);

  /// Лимит подарков (Q81) копится в Redis по пользователю и IP; тесты делят
  /// один адрес и пользователей, поэтому счётчики сбрасываются перед каждым.
  const resetGiftRate = async () => {
    const keys = await redis.client.keys('cart:gift:*');
    if (keys.length > 0) await redis.client.del(...keys);
  };
  beforeEach(resetGiftRate);

  afterAll(async () => {
    const userIds = [alice.id, bob.id];
    await prisma.order.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.cart.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.promoCode.deleteMany({
      where: { code: { startsWith: `CT${tag}` } },
    });
    await prisma.bundle.deleteMany({
      where: { slug: { startsWith: `e2e-cart-${unique}` } },
    });
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `e2e-cart-${unique}` } },
    });
    await prisma.category.deleteMany({
      where: { slug: { startsWith: `e2e-cart-${unique}` } },
    });
    await prisma.auditLog.deleteMany({
      where: { actor: { email: { in: [alice.email, bob.email] } } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [alice.email, bob.email] } },
    });
    await app.close();
  }, 20_000);

  describe('слияние строк и maxPerPurchase', () => {
    beforeEach(() => clearCart(alice));

    it('повторное добавление того же варианта сливается в одну строку', async () => {
      await addItem(alice, { variantId: limitedVariantA, quantity: 1 }).expect(
        201,
      );
      const res = await addItem(alice, {
        variantId: limitedVariantA,
        quantity: 2,
      }).expect(201);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].quantity).toBe(3);
    });

    it('сумма с уже лежащим количеством выше maxPerPurchase — 400 CART_MAX_PER_PURCHASE', async () => {
      await addItem(alice, { variantId: limitedVariantA, quantity: 2 }).expect(
        201,
      );
      const res = await addItem(alice, {
        variantId: limitedVariantA,
        quantity: 2,
      }).expect(400);
      expect(res.body.code).toBe('CART_MAX_PER_PURCHASE');
      expect(typeof res.body.message).toBe('string');
      const cart = await getCart(alice).expect(200);
      expect(cart.body.items[0].quantity).toBe(2);
    });

    it('лимит считается на товар: разные варианты суммируются', async () => {
      await addItem(alice, { variantId: limitedVariantA, quantity: 2 }).expect(
        201,
      );
      await addItem(alice, { variantId: limitedVariantB, quantity: 1 }).expect(
        201,
      );
      const res = await addItem(alice, {
        variantId: limitedVariantB,
        quantity: 1,
      }).expect(400);
      expect(res.body.code).toBe('CART_MAX_PER_PURCHASE');
    });

    it('PATCH: количество выше лимита — 400, в пределах — 200', async () => {
      const added = await addItem(alice, {
        variantId: limitedVariantA,
        quantity: 1,
      }).expect(201);
      const id = added.body.items[0].id;
      const over = await api()
        .patch(`/store/cart/items/${id}`)
        .set('Authorization', auth(alice))
        .send({ quantity: 4 })
        .expect(400);
      expect(over.body.code).toBe('CART_MAX_PER_PURCHASE');
      const ok = await api()
        .patch(`/store/cart/items/${id}`)
        .set('Authorization', auth(alice))
        .send({ quantity: 3 })
        .expect(200);
      expect(ok.body.items[0].quantity).toBe(3);
    });

    it('PATCH: смена получателя, совпавшая с другой строкой, сливает строки', async () => {
      await addItem(alice, { variantId: limitedVariantA, quantity: 1 }).expect(
        201,
      );
      const gifted = await addItem(alice, {
        variantId: limitedVariantA,
        quantity: 1,
        giftToUsername: bob.username,
      }).expect(201);
      // свой вариант и подарок другому — разные строки
      expect(gifted.body.items).toHaveLength(2);
      const giftLine = gifted.body.items.find(
        (i: { giftToUserId: string | null }) => i.giftToUserId === bob.id,
      );
      const merged = await api()
        .patch(`/store/cart/items/${giftLine.id}`)
        .set('Authorization', auth(alice))
        .send({ giftToUsername: '' })
        .expect(200);
      expect(merged.body.items).toHaveLength(1);
      expect(merged.body.items[0].quantity).toBe(2);
      expect(merged.body.items[0].giftToUserId).toBeNull();
    });

    it('набор сливается так же, как вариант', async () => {
      await addItem(alice, { bundleId, quantity: 1 }).expect(201);
      const res = await addItem(alice, { bundleId, quantity: 1 }).expect(201);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].quantity).toBe(2);
    });
  });

  describe('уникальные товары', () => {
    beforeEach(() => clearCart(alice));

    it('количество больше 1 — 409 CART_UNIQUE_DUPLICATE', async () => {
      const res = await addItem(alice, {
        variantId: uniqueVariant,
        quantity: 2,
      }).expect(409);
      expect(res.body.code).toBe('CART_UNIQUE_DUPLICATE');
    });

    it('повторное добавление — 409, строка остаётся одна', async () => {
      await addItem(alice, { variantId: uniqueVariant, quantity: 1 }).expect(
        201,
      );
      const res = await addItem(alice, {
        variantId: uniqueVariant,
        quantity: 1,
      }).expect(409);
      expect(res.body.code).toBe('CART_UNIQUE_DUPLICATE');
      const cart = await getCart(alice).expect(200);
      expect(cart.body.items).toHaveLength(1);
      expect(cart.body.items[0].quantity).toBe(1);
    });

    it('PATCH quantity=2 для уникального — 409', async () => {
      const added = await addItem(alice, {
        variantId: uniqueVariant,
        quantity: 1,
      }).expect(201);
      const res = await api()
        .patch(`/store/cart/items/${added.body.items[0].id}`)
        .set('Authorization', auth(alice))
        .send({ quantity: 2 })
        .expect(409);
      expect(res.body.code).toBe('CART_UNIQUE_DUPLICATE');
    });

    it('параллельные добавления не плодят строки и не обходят лимит', async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          addItem(alice, { variantId: uniqueVariant, quantity: 1 }),
        ),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(4);
      const lim = await Promise.all(
        Array.from({ length: 5 }, () =>
          addItem(alice, { variantId: limitedVariantA, quantity: 1 }),
        ),
      );
      expect(lim.filter((r) => r.status === 201)).toHaveLength(5 - 2);
      const cart = await getCart(alice).expect(200);
      const lines = cart.body.items.filter(
        (i: { variantId: string }) => i.variantId === limitedVariantA,
      );
      expect(lines).toHaveLength(1);
      expect(lines[0].quantity).toBe(3);
    });
  });

  describe('оформление заказа проверяет лимиты (обход API корзины)', () => {
    beforeEach(() => clearCart(alice));

    it('дубли строк уникального товара — 409 при создании заказа', async () => {
      const cart = await prisma.cart.findUniqueOrThrow({
        where: { userId: alice.id },
      });
      await prisma.cartItem.createMany({
        data: [1, 2].map(() => ({
          cartId: cart.id,
          productId: uniqueProductId,
          variantId: uniqueVariant,
          quantity: 1,
        })),
      });
      const res = await api()
        .post('/store/orders')
        .set('Authorization', auth(alice))
        .expect(409);
      expect(res.body.code).toBe('CART_UNIQUE_DUPLICATE');
      expect(await prisma.order.count({ where: { userId: alice.id } })).toBe(0);
    });

    it('превышение maxPerPurchase суммой по двум строкам — 400', async () => {
      const cart = await prisma.cart.findUniqueOrThrow({
        where: { userId: alice.id },
      });
      await prisma.cartItem.createMany({
        data: [
          {
            cartId: cart.id,
            productId: limitedProductId,
            variantId: limitedVariantA,
            quantity: 2,
          },
          {
            cartId: cart.id,
            productId: limitedProductId,
            variantId: limitedVariantB,
            quantity: 2,
          },
        ],
      });
      const res = await api()
        .post('/store/orders')
        .set('Authorization', auth(alice))
        .expect(400);
      expect(res.body.code).toBe('CART_MAX_PER_PURCHASE');
      expect(await prisma.order.count({ where: { userId: alice.id } })).toBe(0);
    });

    it('quick-buy: уникальный товар в количестве 2 и сверх maxPerPurchase — отказ', async () => {
      const uniq = await api()
        .post('/store/quick-buy')
        .send({
          variantId: uniqueVariant,
          quantity: 2,
          guestMinecraftNick: 'Guest_Tester',
        })
        .expect(409);
      expect(uniq.body.code).toBe('CART_UNIQUE_DUPLICATE');
      const lim = await api()
        .post('/store/quick-buy')
        .send({
          variantId: limitedVariantA,
          quantity: 4,
          guestMinecraftNick: 'Guest_Tester',
        })
        .expect(400);
      expect(lim.body.code).toBe('CART_MAX_PER_PURCHASE');
    });
  });

  describe('коды ошибок промокода и promoError', () => {
    beforeEach(async () => {
      await clearCart(alice);
      await addItem(alice, { variantId: plainVariant, quantity: 1 }).expect(
        201,
      );
    });

    const cases: Array<[string, number, string]> = [
      ['EXP', 400, 'PROMO_EXPIRED'],
      ['FUT', 400, 'PROMO_NOT_STARTED'],
      ['USED', 400, 'PROMO_EXHAUSTED'],
      ['MIN', 400, 'PROMO_MIN_AMOUNT'],
      ['TYPE', 400, 'PROMO_NOT_APPLICABLE'],
      ['OFF', 404, 'PROMO_NOT_FOUND'],
      ['NOPE', 404, 'PROMO_NOT_FOUND'],
    ];
    it.each(cases)('apply-promo: %s — %i %s', async (suffix, status, code) => {
      const res = await api()
        .post('/store/cart/apply-promo')
        .set('Authorization', auth(alice))
        .send({ code: `CT${tag}${suffix}` })
        .expect(status);
      expect(res.body.code).toBe(code);
      expect(typeof res.body.message).toBe('string');
    });

    it('calculate с явным неверным кодом — 4xx с кодом (не promoError)', async () => {
      const res = await api()
        .post('/store/cart/calculate')
        .set('Authorization', auth(alice))
        .send({ promoCode: `CT${tag}EXP` })
        .expect(400);
      expect(res.body.code).toBe('PROMO_EXPIRED');
    });

    it('публичная проверка кода возвращает code', async () => {
      const res = await api()
        .post('/store/promocodes/validate')
        .send({ code: `CT${tag}EXP` });
      expect(res.body).toMatchObject({ valid: false, code: 'PROMO_EXPIRED' });
    });

    it('PROMO_FIRST_PURCHASE_ONLY: у покупателя есть завершённый заказ', async () => {
      const order = await prisma.order.create({
        data: {
          orderNumber: `O-CT-${unique}`,
          userId: bob.id,
          subtotal: 1,
          total: 1,
          status: 'COMPLETED',
        },
      });
      try {
        await clearCart(bob);
        await addItem(bob, { variantId: plainVariant, quantity: 1 }).expect(
          201,
        );
        const res = await api()
          .post('/store/cart/apply-promo')
          .set('Authorization', auth(bob))
          .send({ code: `CT${tag}OK` })
          .expect(400);
        expect(res.body.code).toBe('PROMO_FIRST_PURCHASE_ONLY');
      } finally {
        await prisma.order.delete({ where: { id: order.id } });
      }
    });

    it('сохранённый промокод стал недействителен: GET корзины — 200 с promoError и без скидки', async () => {
      const applied = await api()
        .post('/store/cart/apply-promo')
        .set('Authorization', auth(alice))
        .send({ code: `CT${tag}OK` })
        .expect(201);
      expect(Number(applied.body.promoDiscountTotal)).toBeGreaterThan(0);
      expect(applied.body.promoError).toBeNull();

      await prisma.promoCode.update({
        where: { code: `CT${tag}OK` },
        data: { validUntil: new Date(Date.now() - 1000) },
      });
      try {
        const cart = await getCart(alice).expect(200);
        expect(cart.body.promoError).toMatchObject({ code: 'PROMO_EXPIRED' });
        expect(typeof cart.body.promoError.message).toBe('string');
        expect(Number(cart.body.promoDiscountTotal)).toBe(0);
        expect(cart.body.total).toBe('100');
        expect(cart.body.items).toHaveLength(1);

        // остальные операции корзины тоже живы
        await api()
          .post('/store/cart/calculate')
          .set('Authorization', auth(alice))
          .send({})
          .expect(201);
        await addItem(alice, { variantId: plainVariant, quantity: 1 }).expect(
          201,
        );

        // заказ с недействительным промокодом — явная ошибка, а не тихая смена суммы
        const order = await api()
          .post('/store/orders')
          .set('Authorization', auth(alice))
          .expect(400);
        expect(order.body.code).toBe('PROMO_EXPIRED');

        // снятие промокода возвращает корзину без ошибки
        const removed = await api()
          .delete('/store/cart/promo')
          .set('Authorization', auth(alice))
          .expect(200);
        expect(removed.body.promoError).toBeNull();
        expect(removed.body.promoCode).toBeNull();
      } finally {
        await prisma.promoCode.update({
          where: { code: `CT${tag}OK` },
          data: { validUntil: null },
        });
      }
    });
  });

  describe('публичные поля ответа корзины (N2, A1)', () => {
    beforeEach(() => clearCart(alice));

    it('promoCode — белый список, без maxUses/usedCount/minOrderAmount/firstPurchaseOnly', async () => {
      await addItem(alice, { variantId: plainVariant, quantity: 1 }).expect(
        201,
      );
      const res = await api()
        .post('/store/cart/apply-promo')
        .set('Authorization', auth(alice))
        .send({ code: `CT${tag}OK` })
        .expect(201);
      expect(Object.keys(res.body.promoCode).sort()).toEqual([
        'code',
        'description',
        'discountType',
        'discountValue',
      ]);
      expect(res.body.promoCode.code).toBe(`CT${tag}OK`);
      expect(res.body.promoCode.description).toBe('Скидка 10%');
      const json = JSON.stringify(res.body);
      for (const field of [
        'maxUses',
        'usedCount',
        'minOrderAmount',
        'firstPurchaseOnly',
        'applicableToTypes',
        'gameCommands',
        'server',
      ]) {
        expect(json).not.toContain(`"${field}"`);
      }
    });

    it('lines расчёта содержат cartItemId, совпадающий с id строк корзины', async () => {
      await addItem(alice, { variantId: plainVariant, quantity: 1 }).expect(
        201,
      );
      const res = await addItem(alice, { bundleId, quantity: 1 }).expect(201);
      const itemIds = res.body.items.map((i: { id: string }) => i.id).sort();
      const lineIds = res.body.lines
        .map((l: { cartItemId: string }) => l.cartItemId)
        .sort();
      expect(lineIds).toEqual(itemIds);
      expect(lineIds).toHaveLength(2);
    });
  });

  describe('старые нарушения в корзине не блокируют несвязанный товар (L1)', () => {
    beforeEach(() => clearCart(alice));

    it('дубли уникального товара лежат в корзине — добавление другого товара 201', async () => {
      const cart = await prisma.cart.findUniqueOrThrow({
        where: { userId: alice.id },
      });
      await prisma.cartItem.createMany({
        data: [1, 2].map(() => ({
          cartId: cart.id,
          productId: uniqueProductId,
          variantId: uniqueVariant,
          quantity: 1,
        })),
      });
      await addItem(alice, { variantId: plainVariant }).expect(201);
      // затронутый товар по-прежнему проверяется
      await addItem(alice, { variantId: uniqueVariant }).expect(409);
    });
  });

  describe('подарок: формат ника и единый ответ (A3)', () => {
    beforeEach(() => clearCart(alice));

    it.each([['ab'], ['a'.repeat(17)], ['bad nick!'], ['Ник_кириллица']])(
      'некорректный ник %j — 400 валидации',
      async (giftToUsername) => {
        await addItem(alice, {
          variantId: giftableVariant,
          giftToUsername,
        }).expect(400);
      },
    );

    it('несуществующий получатель и подарок самому себе — одинаковый ответ', async () => {
      const missing = await addItem(alice, {
        variantId: giftableVariant,
        giftToUsername: `NoSuchUser_${unique}`.slice(0, 16),
      }).expect(404);
      const self = await addItem(alice, {
        variantId: giftableVariant,
        giftToUsername: alice.username,
      }).expect(404);
      expect(self.body).toEqual(missing.body);
      expect(missing.body.code).toBe('CART_GIFT_UNAVAILABLE');
    });

    it('товар не для подарка — 400 CART_GIFT_NOT_ALLOWED независимо от получателя', async () => {
      const real = await addItem(alice, {
        variantId: plainVariant,
        giftToUsername: bob.username,
      }).expect(400);
      const fake = await addItem(alice, {
        variantId: plainVariant,
        giftToUsername: 'NoSuchUser_x',
      }).expect(400);
      expect(real.body).toEqual(fake.body);
      expect(real.body.code).toBe('CART_GIFT_NOT_ALLOWED');
    });

    it('подарок существующему игроку работает, ник регистронезависим', async () => {
      const res = await addItem(alice, {
        variantId: giftableVariant,
        giftToUsername: bob.username.toUpperCase(),
      }).expect(201);
      expect(res.body.items[0].giftToUserId).toBe(bob.id);
    });
  });

  describe('подарок: ник с подчёркиванием не работает как маска (M2)', () => {
    beforeEach(() => clearCart(alice));

    it('a_b и aXb — подарок уходит именно a_b', async () => {
      const tail = unique.slice(0, 4);
      const under = await createUser('x', `u_${tail}`);
      const other = await createUser('y', `uX${tail}`);
      const res = await addItem(alice, {
        variantId: giftableVariant,
        giftToUsername: under.username,
      }).expect(201);
      expect(res.body.items[0].giftToUserId).toBe(under.id);
      expect(res.body.items[0].giftToUserId).not.toBe(other.id);
      await clearCart(alice);
      const res2 = await addItem(alice, {
        variantId: giftableVariant,
        giftToUsername: other.username.toLowerCase(),
      }).expect(201);
      expect(res2.body.items[0].giftToUserId).toBe(other.id);
    });
  });

  describe('подарок: лимит операций (Q81, M1)', () => {
    beforeEach(() => clearCart(alice));

    it('11-я операция с подарком за минуту — 429, Retry-After, код', async () => {
      const gift = {
        variantId: giftableVariant,
        giftToUsername: bob.username,
      };
      for (let i = 0; i < 10; i++) {
        await addItem(alice, gift).expect(201);
      }
      const res = await addItem(alice, gift).expect(429);
      expect(res.body.code).toBe('CART_GIFT_RATE_LIMITED');
      expect(res.body.statusCode).toBe(429);
      const retry = Number(res.headers['retry-after']);
      expect(retry).toBeGreaterThan(0);
      expect(retry).toBeLessThanOrEqual(3600);
      // PATCH с подарком — тот же счётчик
      const line = (await getCart(alice).expect(200)).body.items[0];
      await api()
        .patch(`/store/cart/items/${line.id}`)
        .set('Authorization', auth(alice))
        .send({ giftToUsername: bob.username })
        .expect(429);
    });

    it('операции без подарка и снятие подарка лимитом не затрагиваются', async () => {
      const gift = {
        variantId: giftableVariant,
        giftToUsername: bob.username,
      };
      for (let i = 0; i < 11; i++) {
        await addItem(alice, gift);
      }
      await addItem(alice, { variantId: giftableVariant, quantity: 1 }).expect(
        201,
      );
      const line = (await getCart(alice).expect(200)).body.items[0];
      await api()
        .patch(`/store/cart/items/${line.id}`)
        .set('Authorization', auth(alice))
        .send({ quantity: 2 })
        .expect(200);
      await api()
        .patch(`/store/cart/items/${line.id}`)
        .set('Authorization', auth(alice))
        .send({ giftToUsername: '' })
        .expect(200);
    });

    it('лимит пользователя не мешает другому пользователю', async () => {
      const gift = {
        variantId: giftableVariant,
        giftToUsername: alice.username,
      };
      for (let i = 0; i < 10; i++) {
        await addItem(bob, gift).expect(201);
      }
      await addItem(bob, gift).expect(429);
      await addItem(alice, {
        variantId: giftableVariant,
        giftToUsername: bob.username,
      }).expect(201);
      await clearCart(bob);
    });
  });
});
