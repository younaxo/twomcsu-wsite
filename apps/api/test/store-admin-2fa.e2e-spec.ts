import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';
import * as permissionsGuard from '../src/modules/roles/guards/permissions.guard';

jest.setTimeout(30_000);

/// 2FA персонала для админки магазина (ADR-0109, ADR-0156, ADR-0169): товары,
/// категории, заказы, экспорт, промокоды, скидки. Персонал без включённой 2FA
/// получает 403 `admin_2fa_required` на каждом эндпоинте, с 2FA — 200.
/// После Q22 2FA персонала обязательна всегда (флага нет), поэтому тест не
/// зависит от переключателя. Набор требует заданного
/// TWO_FACTOR_ENCRYPTION_KEY (как two-factor.e2e-spec.ts).
///
/// Совместимость: на ветках, где поле SiteSettings.requireAdmin2fa ещё
/// действует (кэш guard 15 с), тест включает флаг и сбрасывает кэш через
/// namespace-импорт с необязательным вызовом — на main поле безвредно
/// игнорируется, а удалённая функция не импортируется по имени.
/// Флаг включается только на время набора и возвращается в false при любом
/// исходе.
describe('Админка магазина: 2FA персонала (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const unique = randomUUID().slice(0, 8);
  const email = `s2fa-${unique}@example.com`;
  const username = `s2f${unique}`.slice(0, 16);
  const password = 'Sup3rSecretPassw0rd!';
  const roleSlug = `e2e-s2fa-${unique}`;
  let userId: string;
  let token: string;

  const http = () => request(app.getHttpServer());

  const resetCache = () =>
    (
      permissionsGuard as unknown as { resetAdmin2faCache?: () => void }
    ).resetAdmin2faCache?.();
  const setRequireFlag = async (value: boolean) => {
    await prisma.siteSettings.updateMany({ data: { requireAdmin2fa: value } });
    resetCache();
  };
  const setUser2fa = (enabled: boolean) =>
    prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: enabled },
    });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    await app.listen(0);
    prisma = app.get(PrismaService);
    // Поле флага живёт в SiteSettings: при одиночном запуске строки ещё нет.
    if (!(await prisma.siteSettings.findFirst())) {
      await prisma.siteSettings.create({ data: {} });
    }
    await http()
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);
    const login = await http()
      .post('/auth/login')
      .send({ emailOrUsername: username, password })
      .expect(200);
    token = login.body.accessToken;
    userId = (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  });

  afterEach(async () => {
    await setRequireFlag(false);
  });

  afterAll(async () => {
    await setRequireFlag(false);
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.role.deleteMany({ where: { slug: roleSlug } });
    await app.close();
  });

  async function grant(keys: string[]) {
    const role = await prisma.role.create({
      data: {
        name: roleSlug,
        slug: roleSlug,
        displayName: roleSlug,
        priority: 10,
        isSystem: false,
        isAssignable: true,
      },
    });
    const perms = await prisma.permission.findMany({
      where: { key: { in: keys } },
    });
    // Права обязаны существовать, иначе 403 был бы по другой причине.
    expect(perms).toHaveLength(keys.length);
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
    await prisma.userRole.create({ data: { userId, roleId: role.id } });
    await app.get(PermissionService).invalidateUser(userId);
  }

  it('товары, категории, заказы, экспорт, промокоды и скидки: без 2FA — 403 admin_2fa_required, с 2FA — доступ', async () => {
    await grant([
      'store.products.view',
      'store.products.create',
      'store.products.edit',
      'store.products.delete',
      'store.products.variants',
      'store.categories.view',
      'store.categories.create',
      'store.categories.edit',
      'store.categories.delete',
      'orders.view',
      'orders.cancel',
      'orders.export',
      'promocodes.view',
      'promocodes.create',
      'promocodes.edit',
      'promocodes.delete',
      'store.discounts.view',
      'store.discounts.bulk.create',
      'store.discounts.bulk.edit',
      'store.discounts.bulk.delete',
      'store.discounts.loyalty.create',
      'store.discounts.loyalty.edit',
      'store.discounts.loyalty.delete',
    ]);
    const auth = `Bearer ${token}`;
    await setUser2fa(false);
    await setRequireFlag(true);

    const productBody = {
      name: 'E2E 2FA',
      slug: `e2e-2fa-${randomUUID().slice(0, 8)}`,
      type: 'PRIVILEGE',
      categoryId: 'any',
      variants: [{ duration: 'MONTH_1', price: '1.00' }],
    };
    const categorySlug = `e2e-2fa-cat-${unique}`;
    const promoCode = `E2E-2FA-${unique.toUpperCase()}`;
    const loyaltyName = `E2E 2FA ${unique}`;
    const denials = [
      // Товары и категории.
      http().get('/admin/store/products'),
      http().post('/admin/store/products').send(productBody),
      http().patch('/admin/store/products/any').send({ name: 'x' }),
      http().delete('/admin/store/products/any'),
      http()
        .post('/admin/store/products/any/variants')
        .send({ duration: 'MONTH_1', price: '1.00' }),
      http().delete('/admin/store/products/any/variants/any'),
      http()
        .patch('/admin/store/products/any/variants/any')
        .send({ price: '2.00' }),
      http().get('/admin/store/categories'),
      http()
        .post('/admin/store/categories')
        .send({ name: 'E2E 2FA cat', slug: categorySlug }),
      http().patch('/admin/store/categories/any').send({ name: 'x' }),
      http().delete('/admin/store/categories/any'),
      // Заказы и экспорт.
      http().get('/admin/orders'),
      http().get('/admin/orders/any'),
      http().patch('/admin/orders/any/cancel').send({ reason: 'x' }),
      http().post('/admin/orders/export').send({}),
      // Промокоды.
      http().get('/admin/promocodes'),
      http().post('/admin/promocodes').send({
        code: promoCode,
        discountType: 'PERCENT',
        discountValue: '10',
      }),
      http().patch('/admin/promocodes/any').send({ isActive: false }),
      http().delete('/admin/promocodes/any'),
      // Скидки.
      http().get('/admin/store/discounts/bulk'),
      http().get('/admin/store/discounts/loyalty'),
      http()
        .post('/admin/store/discounts/bulk')
        .send({ discountType: 'PERCENT', discountValue: '5', minQuantity: 2 }),
      http().patch('/admin/store/discounts/bulk/any').send({ minQuantity: 3 }),
      http().delete('/admin/store/discounts/bulk/any'),
      http()
        .post('/admin/store/discounts/loyalty')
        .send({ minPurchases: 1, discountPercent: '5', name: loyaltyName }),
      http().patch('/admin/store/discounts/loyalty/any').send({ name: 'x' }),
      http().delete('/admin/store/discounts/loyalty/any'),
    ];
    for (const req of denials) {
      const denied = await req.set('Authorization', auth).expect(403);
      expect(denied.body.code).toBe('admin_2fa_required');
    }
    // Отказ до обработчика: ничего не создано.
    expect(
      await prisma.product.count({ where: { slug: productBody.slug } }),
    ).toBe(0);
    expect(await prisma.category.count({ where: { slug: categorySlug } })).toBe(
      0,
    );
    expect(await prisma.promoCode.count({ where: { code: promoCode } })).toBe(
      0,
    );
    expect(
      await prisma.loyaltyDiscount.count({ where: { name: loyaltyName } }),
    ).toBe(0);

    // С включённой 2FA guard пропускает.
    await setUser2fa(true);
    for (const url of [
      '/admin/store/products',
      '/admin/store/categories',
      '/admin/orders',
      '/admin/promocodes',
      '/admin/store/discounts/bulk',
      '/admin/store/discounts/loyalty',
    ]) {
      await http().get(url).set('Authorization', auth).expect(200);
    }
  });
});
