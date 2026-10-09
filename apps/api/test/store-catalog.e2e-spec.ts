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

describe('Store catalog (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  const unique = randomUUID().slice(0, 8);
  const cleanupRoleSlugs: string[] = [];

  interface TestUser {
    id: string;
    accessToken: string;
    username: string;
    email: string;
  }

  async function createUser(label: string): Promise<TestUser> {
    const email = `store-${label}-${unique}@example.com`;
    const username = `store${label}${unique}`
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

  const categorySlug = `e2e-${unique}-category`;
  const productSlug = `e2e-${unique}-product`;
  const bundleSlug = `e2e-${unique}-bundle`;
  const promoCode = `E2E${unique.toUpperCase()}`;
  const currencyCode = unique.toUpperCase();

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

    const adminRole = await createRole(`store-admin-${unique}`, 20);
    await grantRole(admin.id, adminRole.id);
    await grantPermissions(adminRole.id, [
      'store.categories.view',
      'store.categories.create',
      'store.categories.edit',
      'store.categories.delete',
      'store.products.view',
      'store.products.create',
      'store.products.edit',
      'store.products.delete',
      'store.products.variants',
      'store.bundles.create',
      'store.bundles.edit',
      'store.bundles.delete',
      'store.discounts.bulk.create',
      'store.discounts.bulk.edit',
      'store.discounts.bulk.delete',
      'store.discounts.loyalty.create',
      'store.discounts.loyalty.edit',
      'store.discounts.loyalty.delete',
      'store.currencies.view',
      'store.currencies.create',
      'store.currencies.edit',
      'promocodes.view',
      'promocodes.create',
      'promocodes.edit',
      'promocodes.delete',
    ]);
  }, 30_000);

  afterAll(async () => {
    await prisma.promoCode.deleteMany({
      where: { code: { startsWith: 'E2E' + unique.toUpperCase() } },
    });
    await prisma.currencyRate.deleteMany({
      where: { currency: { startsWith: unique.toUpperCase() } },
    });
    await prisma.loyaltyDiscount.deleteMany({
      where: { name: { contains: unique } },
    });
    await prisma.bulkDiscount.deleteMany({
      where: { product: { slug: productSlug } },
    });
    await prisma.bundle.deleteMany({
      where: { slug: { startsWith: `e2e-${unique}` } },
    });
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `e2e-${unique}` } },
    });
    await prisma.category.deleteMany({
      where: { slug: { startsWith: `e2e-${unique}` } },
    });
    await prisma.userRole.deleteMany({
      where: { role: { slug: { in: cleanupRoleSlugs } } },
    });
    await prisma.rolePermission.deleteMany({
      where: { role: { slug: { in: cleanupRoleSlugs } } },
    });
    await prisma.role.deleteMany({ where: { slug: { in: cleanupRoleSlugs } } });
    await prisma.auditLog.deleteMany({
      where: { actor: { email: { in: [admin.email, alice.email] } } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [admin.email, alice.email] } },
    });
    await app.close();
  }, 20_000);

  const auth = (user: TestUser) => `Bearer ${user.accessToken}`;

  let categoryId: string;

  it('категории: создание требует store.categories.create, публичный список отражает', async () => {
    await request(app.getHttpServer())
      .post('/admin/store/categories')
      .set('Authorization', auth(alice))
      .send({ name: 'E2E категория', slug: categorySlug })
      .expect(403);

    const created = await request(app.getHttpServer())
      .post('/admin/store/categories')
      .set('Authorization', auth(admin))
      .send({ name: 'E2E категория', slug: categorySlug })
      .expect(201);
    categoryId = created.body.id;

    const list = await request(app.getHttpServer())
      .get('/store/categories')
      .expect(200);
    expect(
      list.body.some((c: { slug: string }) => c.slug === categorySlug),
    ).toBe(true);
  });

  let productId: string;
  let variantId: string;

  it('товары: создание с вариантами, публичный список/деталь', async () => {
    const created = await request(app.getHttpServer())
      .post('/admin/store/products')
      .set('Authorization', auth(admin))
      .send({
        name: 'E2E Товар',
        slug: productSlug,
        type: 'PRIVILEGE',
        categoryId,
        variants: [
          { duration: 'MONTH_1', price: 100 },
          { duration: 'FOREVER', price: 900 },
        ],
      })
      .expect(201);
    productId = created.body.id;
    variantId = created.body.variants.find(
      (v: { duration: string }) => v.duration === 'MONTH_1',
    ).id;
    expect(created.body.variants).toHaveLength(2);

    const detail = await request(app.getHttpServer())
      .get(`/store/products/${productSlug}`)
      .expect(200);
    expect(detail.body.id).toBe(productId);
    expect(detail.body.inWishlist).toBe(false);

    const list = await request(app.getHttpServer())
      .get('/store/products')
      .expect(200);
    expect(
      list.body.items.some((p: { id: string }) => p.id === productId),
    ).toBe(true);
  });

  it('товары: доп. вариант через отдельный эндпоинт, обновление и удаление варианта', async () => {
    const variant = await request(app.getHttpServer())
      .post(`/admin/store/products/${productId}/variants`)
      .set('Authorization', auth(admin))
      .send({ duration: 'WEEK_1', price: 30 })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/admin/store/products/${productId}/variants/${variant.body.id}`)
      .set('Authorization', auth(admin))
      .send({ price: 25 })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/admin/store/products/${productId}/variants/${variant.body.id}`)
      .set('Authorization', auth(admin))
      .expect(200);
  });

  it('наборы: создание с товарами, публичный список/деталь', async () => {
    const created = await request(app.getHttpServer())
      .post('/admin/store/bundles')
      .set('Authorization', auth(admin))
      .send({
        name: 'E2E Набор',
        slug: bundleSlug,
        totalPrice: 150,
        originalPrice: 200,
        items: [{ productId, variantId, quantity: 1 }],
      })
      .expect(201);
    expect(created.body.items).toHaveLength(1);

    const detail = await request(app.getHttpServer())
      .get(`/store/bundles/${bundleSlug}`)
      .expect(200);
    expect(detail.body.slug).toBe(bundleSlug);

    const list = await request(app.getHttpServer())
      .get('/store/bundles')
      .expect(200);
    expect(list.body.some((b: { slug: string }) => b.slug === bundleSlug)).toBe(
      true,
    );
  });

  it('скидки: bulk и loyalty создаются админом, видны в публичном списке', async () => {
    await request(app.getHttpServer())
      .post('/admin/store/discounts/bulk')
      .set('Authorization', auth(admin))
      .send({
        productId,
        minQuantity: 2,
        discountType: 'PERCENT',
        discountValue: 10,
      })
      .expect(201);

    const bulkList = await request(app.getHttpServer())
      .get('/store/discounts/bulk')
      .expect(200);
    expect(
      bulkList.body.some(
        (d: { productId: string }) => d.productId === productId,
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .post('/admin/store/discounts/loyalty')
      .set('Authorization', auth(admin))
      .send({ minPurchases: 1, discountPercent: 5, name: `Loyalty ${unique}` })
      .expect(201);

    const loyaltyList = await request(app.getHttpServer())
      .get('/store/discounts/loyalty')
      .expect(200);
    expect(
      loyaltyList.body.some(
        (d: { name: string }) => d.name === `Loyalty ${unique}`,
      ),
    ).toBe(true);
  });

  it('валюты: CRUD админом, публичный список, калькулятор обмена', async () => {
    await request(app.getHttpServer())
      .post('/admin/store/currencies')
      .set('Authorization', auth(admin))
      .send({ currency: currencyCode, rate: 2, symbol: '₽', flag: '🏳' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/admin/store/currencies')
      .set('Authorization', auth(admin))
      .send({ currency: `${currencyCode}B`, rate: 1, symbol: '$', flag: '🏳' })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/store/currencies')
      .expect(200);
    expect(
      list.body.some((c: { currency: string }) => c.currency === currencyCode),
    ).toBe(true);

    await request(app.getHttpServer())
      .post('/store/exchange')
      .send({
        fromCurrency: currencyCode,
        toCurrency: `${currencyCode}B`,
        amount: 10,
      })
      .expect(401);

    const exchanged = await request(app.getHttpServer())
      .post('/store/exchange')
      .set('Authorization', auth(alice))
      .send({
        fromCurrency: currencyCode,
        toCurrency: `${currencyCode}B`,
        amount: 10,
      })
      .expect(201);
    expect(exchanged.body.result).toBe('20');
  });

  it('промокоды: создание админом, публичная валидация', async () => {
    await request(app.getHttpServer())
      .post('/admin/promocodes')
      .set('Authorization', auth(admin))
      .send({ code: promoCode, discountType: 'PERCENT', discountValue: 15 })
      .expect(201);

    const valid = await request(app.getHttpServer())
      .post('/store/promocodes/validate')
      .send({ code: promoCode })
      .expect(201);
    expect(valid.body.valid).toBe(true);

    const invalid = await request(app.getHttpServer())
      .post('/store/promocodes/validate')
      .send({ code: 'NO-SUCH-CODE' })
      .expect(201);
    expect(invalid.body.valid).toBe(false);
  });

  it('категории: нельзя удалить категорию, в которой есть товары', async () => {
    await request(app.getHttpServer())
      .delete(`/admin/store/categories/${categoryId}`)
      .set('Authorization', auth(admin))
      .expect(400);
  });
});
