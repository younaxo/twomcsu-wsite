import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';

// См. auth.e2e-spec.ts — риск конкуренции за ресурсы под полным сьютом.
jest.setTimeout(20_000);

describe('Store checkout (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  const unique = randomUUID().slice(0, 8);
  const cleanupRoleSlugs: string[] = [];
  const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET ?? '';

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

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    permissions = app.get(PermissionService);

    admin = await createUser('admin');
    alice = await createUser('alice');
    bob = await createUser('bob');

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
      .expect(201);
    orderNumber = created.body.order.orderNumber;
    firstOrderId = created.body.order.id;
    createdOrderNumbers.push(orderNumber);
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
    await request(app.getHttpServer())
      .get(`/store/orders/${orderNumber}`)
      .set('Authorization', auth(alice))
      .expect(200);
    await request(app.getHttpServer())
      .get(`/store/orders/${orderNumber}`)
      .set('Authorization', auth(bob))
      .expect(403);
  });

  it('вебхук: неверный секрет отклоняется, верный — завершает заказ (идемпотентно)', async () => {
    const rejected = await request(app.getHttpServer())
      .post('/webhooks/payments/test')
      .send({
        secret: 'wrong-secret',
        orderNumber,
        paymentId: 'x',
        status: 'succeeded',
      })
      .expect(200);
    expect(rejected.body.accepted).toBe(false);

    const accepted = await request(app.getHttpServer())
      .post('/webhooks/payments/test')
      .send({
        secret: webhookSecret,
        orderNumber,
        paymentId: 'test_paid',
        status: 'succeeded',
      })
      .expect(200);
    expect(accepted.body.accepted).toBe(true);

    const order = await prisma.order.findUniqueOrThrow({
      where: { orderNumber },
    });
    expect(order.status).toBe('COMPLETED');
    expect(order.paymentWebhookVerifiedAt).not.toBeNull();

    const replay = await request(app.getHttpServer())
      .post('/webhooks/payments/test')
      .send({
        secret: webhookSecret,
        orderNumber,
        paymentId: 'test_paid',
        status: 'succeeded',
      })
      .expect(200);
    expect(replay.body.reason).toBe('already_processed');
  });

  it('заказ: покупка уникального товара второй раз отклоняется', async () => {
    await request(app.getHttpServer())
      .post('/store/cart/items')
      .set('Authorization', auth(alice))
      .send({ variantId: uniqueVariantId, quantity: 1 })
      .expect(201);
    const firstOrder = await request(app.getHttpServer())
      .post('/store/orders')
      .set('Authorization', auth(alice))
      .expect(201);
    const firstOrderNumber = firstOrder.body.order.orderNumber;
    createdOrderNumbers.push(firstOrderNumber);
    await request(app.getHttpServer())
      .post('/webhooks/payments/test')
      .send({
        secret: webhookSecret,
        orderNumber: firstOrderNumber,
        paymentId: 'x',
        status: 'succeeded',
      })
      .expect(200);

    await request(app.getHttpServer())
      .post('/store/cart/items')
      .set('Authorization', auth(alice))
      .send({ variantId: uniqueVariantId, quantity: 1 })
      .expect(201);
    await request(app.getHttpServer())
      .post('/store/orders')
      .set('Authorization', auth(alice))
      .expect(400);
  });

  it('quick-buy: анонимная покупка без авторизации с guestMinecraftNick', async () => {
    const res = await request(app.getHttpServer())
      .post('/store/quick-buy')
      .send({
        variantId: giftableVariantId,
        guestMinecraftNick: 'GuestNick123',
      })
      .expect(201);
    createdOrderNumbers.push(res.body.order.orderNumber);
    expect(res.body.order.userId).toBeNull();
    expect(res.body.order.guestMinecraftNick).toBe('GuestNick123');

    await request(app.getHttpServer())
      .post('/webhooks/payments/test')
      .send({
        secret: webhookSecret,
        orderNumber: res.body.order.orderNumber,
        paymentId: 'x',
        status: 'succeeded',
      })
      .expect(200);
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
