import './helpers/payment-webhook-env';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { PermissionService } from '../src/modules/roles/permission.service';
import { markStaffTwoFactorEnabled } from './helpers/staff-two-factor';

// См. auth.e2e-spec.ts — риск конкуренции за ресурсы под полным сьютом.
jest.setTimeout(20_000);

/// Админка товаров (подэтап 0.3, API): права, gameCommands не принимается,
/// URL картинки, Decimal-цена, аудит, мягкое удаление, неактивные новые.
describe('Store admin products (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  const unique = randomUUID().slice(0, 8);
  const cleanupRoleSlugs: string[] = [];

  interface TestUser {
    id: string;
    accessToken: string;
    email: string;
  }

  async function createUser(label: string): Promise<TestUser> {
    const email = `sap-${label}-${unique}@example.com`;
    const username = `sap${label}${unique}`
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
    return { id: user.id, accessToken: loginRes.body.accessToken, email };
  }

  async function createStaff(
    user: TestUser,
    slug: string,
    priority: number,
    keys: string[],
  ) {
    cleanupRoleSlugs.push(slug);
    const role = await prisma.role.create({
      data: {
        name: slug,
        slug,
        displayName: slug,
        priority,
        isSystem: false,
        isAssignable: true,
      },
    });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });
    await markStaffTwoFactorEnabled(prisma, user.id);
    const records = await prisma.permission.findMany({
      where: { key: { in: keys } },
    });
    await prisma.rolePermission.createMany({
      data: records.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
    await permissions.invalidateRole(role.id);
    await permissions.invalidateUser(user.id);
  }

  let admin: TestUser;
  let viewer: TestUser;
  let nobody: TestUser;
  let varOnly: TestUser;
  let delOnly: TestUser;
  let categoryId: string;

  const allUserIds = () =>
    [admin, viewer, nobody, varOnly, delOnly].map((u) => u.id);
  const slug = (name: string) => `e2e-${unique}-${name}`;
  const auth = (user: TestUser) => `Bearer ${user.accessToken}`;
  const CDN = 'https://cdn-files.twomc.su/store/products/e2e.webp';

  function productBody(name: string, extra: Record<string, unknown> = {}) {
    return {
      name: `E2E ${name}`,
      slug: slug(name),
      type: 'PRIVILEGE',
      categoryId,
      variants: [{ duration: 'MONTH_1', price: '100.00' }],
      ...extra,
    };
  }

  const post = (user: TestUser, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/admin/store/products')
      .set('Authorization', auth(user))
      .send(body);

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
    viewer = await createUser('viewer');
    nobody = await createUser('nobody');
    varOnly = await createUser('varonly');
    delOnly = await createUser('delonly');
    await createStaff(admin, `sap-admin-${unique}`, 20, [
      'store.categories.view',
      'store.categories.create',
      'store.categories.edit',
      'store.categories.delete',
      'store.products.view',
      'store.products.create',
      'store.products.edit',
      'store.products.delete',
      'store.products.variants',
    ]);
    await createStaff(viewer, `sap-viewer-${unique}`, 10, [
      'store.products.view',
    ]);
    await createStaff(varOnly, `sap-varonly-${unique}`, 10, [
      'store.products.view',
      'store.products.variants',
    ]);
    await createStaff(delOnly, `sap-delonly-${unique}`, 10, [
      'store.products.view',
      'store.products.delete',
    ]);
    const category = await prisma.category.create({
      data: { name: 'E2E SAP', slug: slug('category') },
    });
    categoryId = category.id;
  }, 30_000);

  afterAll(async () => {
    await prisma.order.deleteMany({
      where: { orderNumber: { startsWith: `E2E${unique}` } },
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
      where: { actorId: { in: allUserIds() } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: allUserIds() } },
    });
    await app.close();
  }, 20_000);

  it('права: без токена 401, без права 403, view не даёт менять', async () => {
    await request(app.getHttpServer()).get('/admin/store/products').expect(401);
    await request(app.getHttpServer())
      .get('/admin/store/products')
      .set('Authorization', auth(nobody))
      .expect(403);
    await post(nobody, productBody('forbidden')).expect(403);
    await request(app.getHttpServer())
      .get('/admin/store/products')
      .set('Authorization', auth(viewer))
      .expect(200);
    await post(viewer, productBody('forbidden')).expect(403);
    await request(app.getHttpServer())
      .patch('/admin/store/products/any')
      .set('Authorization', auth(viewer))
      .send({ name: 'x' })
      .expect(403);
    await request(app.getHttpServer())
      .delete('/admin/store/products/any')
      .set('Authorization', auth(viewer))
      .expect(403);
    await request(app.getHttpServer())
      .post('/admin/store/products/any/variants')
      .set('Authorization', auth(viewer))
      .send({ duration: 'MONTH_1', price: '1.00' })
      .expect(403);
    expect(
      await prisma.product.count({ where: { slug: slug('forbidden') } }),
    ).toBe(0);
  });

  it('gameCommands и isActive в создании не принимаются (400), в правке gameCommands — 400', async () => {
    const withCommands = await post(
      admin,
      productBody('cmds', { gameCommands: ['op {player}'] }),
    ).expect(400);
    expect(JSON.stringify(withCommands.body)).toContain('gameCommands');
    await post(admin, productBody('active', { isActive: true })).expect(400);
    expect(
      await prisma.product.count({
        where: { slug: { in: [slug('cmds'), slug('active')] } },
      }),
    ).toBe(0);
  });

  it('новый товар неактивен, виден админу, не виден в публичном каталоге', async () => {
    const created = await post(admin, productBody('fresh')).expect(201);
    expect(created.body.isActive).toBe(false);
    expect(created.body.variants[0].price).toBe('100');
    await request(app.getHttpServer())
      .get(`/store/products/${slug('fresh')}`)
      .expect(404);
    const list = await request(app.getHttpServer())
      .get('/admin/store/products')
      .query({ search: 'E2E fresh' })
      .set('Authorization', auth(admin))
      .expect(200);
    expect(list.body.items.map((p: { id: string }) => p.id)).toContain(
      created.body.id,
    );
  });

  it('PATCH: gameCommands отклоняется, существующие значения в БД не меняются', async () => {
    const created = await post(admin, productBody('keepcmd')).expect(201);
    await prisma.product.update({
      where: { id: created.body.id },
      data: { gameCommands: ['lp user {player} parent add e2e'] },
    });
    await request(app.getHttpServer())
      .patch(`/admin/store/products/${created.body.id}`)
      .set('Authorization', auth(admin))
      .send({ gameCommands: ['op {player}'] })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/admin/store/products/${created.body.id}`)
      .set('Authorization', auth(admin))
      .send({ name: 'E2E keepcmd renamed', order: 7 })
      .expect(200);
    const row = await prisma.product.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(row.gameCommands).toEqual(['lp user {player} parent add e2e']);
    expect(row.order).toBe(7);
  });

  it('картинка: только https и хосты из белого списка', async () => {
    for (const bad of [
      'http://cdn-files.twomc.su/a.webp',
      'https://evil.example.com/a.webp',
      'https://cdn-files.twomc.su.evil.com/a.webp',
      'javascript:alert(1)',
    ]) {
      await post(admin, productBody('badimg', { image: bad })).expect(400);
    }
    await post(
      admin,
      productBody('badimgs', { images: [CDN, 'https://evil.example.com/b'] }),
    ).expect(400);
    const ok = await post(
      admin,
      productBody('goodimg', { image: CDN, images: [CDN] }),
    ).expect(201);
    expect(ok.body.image).toBe(CDN);
    await request(app.getHttpServer())
      .patch(`/admin/store/products/${ok.body.id}`)
      .set('Authorization', auth(admin))
      .send({ image: 'https://evil.example.com/x.png' })
      .expect(400);
  });

  it('цена: число и лишние знаки отклоняются, строка Decimal принимается', async () => {
    await post(
      admin,
      productBody('floatprice', {
        variants: [{ duration: 'MONTH_1', price: 19.99 }],
      }),
    ).expect(400);
    await post(
      admin,
      productBody('floatprice', {
        variants: [{ duration: 'MONTH_1', price: '19.999' }],
      }),
    ).expect(400);
    const ok = await post(
      admin,
      productBody('decprice', {
        variants: [{ duration: 'MONTH_1', price: '19.99', oldPrice: '29.00' }],
      }),
    ).expect(201);
    expect(ok.body.variants[0].price).toBe('19.99');
  });

  it('активация: тип вне списка — 422, тип из списка — 200 и аудит', async () => {
    const badge = await post(
      admin,
      productBody('badge', { type: 'BADGE' }),
    ).expect(201);
    const res = await request(app.getHttpServer())
      .patch(`/admin/store/products/${badge.body.id}`)
      .set('Authorization', auth(admin))
      .send({ isActive: true })
      .expect(422);
    expect(res.body.code).toBe('PRODUCT_TYPE_NOT_SELLABLE');
    const row = await prisma.product.findUniqueOrThrow({
      where: { id: badge.body.id },
    });
    expect(row.isActive).toBe(false);

    const priv = await post(admin, productBody('priv')).expect(201);
    await request(app.getHttpServer())
      .patch(`/admin/store/products/${priv.body.id}`)
      .set('Authorization', auth(admin))
      .send({ isActive: true })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/store/products/${slug('priv')}`)
      .expect(200);
    const audit = await prisma.auditLog.findFirst({
      where: {
        actorId: admin.id,
        action: 'store.product.activation_changed',
        targetId: priv.body.id,
      },
    });
    expect(audit).not.toBeNull();
    expect(audit?.severity).toBe('warning');
    expect(audit?.changes).toEqual({ from: false, to: true });
  });

  it('аудит цены варианта: было → стало, актор и критичность', async () => {
    const created = await post(admin, productBody('audprice')).expect(201);
    const variantId = created.body.variants[0].id;
    await request(app.getHttpServer())
      .patch(`/admin/store/products/${created.body.id}/variants/${variantId}`)
      .set('Authorization', auth(admin))
      .send({ price: '79.50' })
      .expect(200);
    const audit = await prisma.auditLog.findFirst({
      where: {
        actorId: admin.id,
        action: 'store.product.variant_price_changed',
        targetId: created.body.id,
      },
    });
    expect(audit).not.toBeNull();
    expect(audit?.severity).toBe('warning');
    expect(JSON.stringify(audit?.changes)).toContain('"from":"100.00"');
    expect(JSON.stringify(audit?.changes)).toContain('"to":"79.50"');

    // Повтор той же цены — нового события нет.
    await request(app.getHttpServer())
      .patch(`/admin/store/products/${created.body.id}/variants/${variantId}`)
      .set('Authorization', auth(admin))
      .send({ price: '79.5' })
      .expect(200);
    expect(
      await prisma.auditLog.count({
        where: {
          action: 'store.product.variant_price_changed',
          targetId: created.body.id,
        },
      }),
    ).toBe(1);
  });

  it('аудит надёжен: сбой записи аудита откатывает изменение цены', async () => {
    const created = await post(admin, productBody('auditfail')).expect(201);
    const variantId = created.body.variants[0].id;
    const original = AuditService.prototype.log;
    const spy = jest
      .spyOn(AuditService.prototype, 'log')
      .mockImplementation(function (this: AuditService, input) {
        if (input.action === 'store.product.variant_price_changed') {
          // Реальная запись через tx упала бы так же: ошибка из log().
          return Promise.reject(new Error('audit write failed'));
        }
        return original.call(this, input);
      });
    try {
      const res = await request(app.getHttpServer())
        .patch(`/admin/store/products/${created.body.id}/variants/${variantId}`)
        .set('Authorization', auth(admin))
        .send({ price: '1.00' });
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      spy.mockRestore();
    }
    const row = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
    });
    expect(row.price.toFixed(2)).toBe('100.00');
  });

  it('категории: image/icon — белый список; удаление с дочерними — 409', async () => {
    const parent = await request(app.getHttpServer())
      .post('/admin/store/categories')
      .set('Authorization', auth(admin))
      .send({ name: 'E2E parent', slug: slug('cat-parent') })
      .expect(201);
    await request(app.getHttpServer())
      .post('/admin/store/categories')
      .set('Authorization', auth(admin))
      .send({
        name: 'E2E bad',
        slug: slug('cat-bad'),
        image: 'https://evil.example.com/a.png',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/admin/store/categories')
      .set('Authorization', auth(admin))
      .send({
        name: 'E2E child',
        slug: slug('cat-child'),
        parentId: parent.body.id,
        icon: 'https://CDN-Files.twomc.su/i.png',
      })
      .expect(201)
      .expect((r) =>
        expect(r.body.icon).toBe('https://cdn-files.twomc.su/i.png'),
      );
    await request(app.getHttpServer())
      .delete(`/admin/store/categories/${parent.body.id}`)
      .set('Authorization', auth(admin))
      .expect(409);
  });

  it('удаление: с заказами — деактивация (товар и позиции заказа целы), без заказов — удаление', async () => {
    const withOrder = await post(admin, productBody('hasorder')).expect(201);
    await request(app.getHttpServer())
      .patch(`/admin/store/products/${withOrder.body.id}`)
      .set('Authorization', auth(admin))
      .send({ isActive: true })
      .expect(200);
    const variantId = withOrder.body.variants[0].id;
    const order = await prisma.order.create({
      data: {
        orderNumber: `E2E${unique}-1`,
        userId: nobody.id,
        status: 'COMPLETED',
        subtotal: '100.00',
        total: '100.00',
        items: {
          create: [
            {
              productId: withOrder.body.id,
              variantId,
              quantity: 1,
              unitPrice: '100.00',
              totalPrice: '100.00',
            },
          ],
        },
      },
    });

    const del = await request(app.getHttpServer())
      .delete(`/admin/store/products/${withOrder.body.id}`)
      .set('Authorization', auth(admin))
      .expect(200);
    expect(del.body).toEqual({ success: true, mode: 'deactivated' });
    const row = await prisma.product.findUniqueOrThrow({
      where: { id: withOrder.body.id },
    });
    expect(row.isActive).toBe(false);
    const item = await prisma.orderItem.findFirstOrThrow({
      where: { orderId: order.id },
    });
    expect(item.productId).toBe(withOrder.body.id);
    expect(
      await prisma.auditLog.count({
        where: {
          action: 'store.product.deactivated_instead_of_delete',
          targetId: withOrder.body.id,
        },
      }),
    ).toBe(1);

    // Вариант с заказами тоже деактивируется, а не удаляется.
    const second = await request(app.getHttpServer())
      .post(`/admin/store/products/${withOrder.body.id}/variants`)
      .set('Authorization', auth(admin))
      .send({ duration: 'FOREVER', price: '500.00' })
      .expect(201);
    const delVariant = await request(app.getHttpServer())
      .delete(
        `/admin/store/products/${withOrder.body.id}/variants/${variantId}`,
      )
      .set('Authorization', auth(admin))
      .expect(200);
    expect(delVariant.body).toEqual({ success: true, mode: 'deactivated' });
    const kept = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
    });
    expect(kept.isActive).toBe(false);
    const delFree = await request(app.getHttpServer())
      .delete(
        `/admin/store/products/${withOrder.body.id}/variants/${second.body.id}`,
      )
      .set('Authorization', auth(admin))
      .expect(200);
    expect(delFree.body.mode).toBe('deleted');

    const noOrder = await post(admin, productBody('noorder')).expect(201);
    const hard = await request(app.getHttpServer())
      .delete(`/admin/store/products/${noOrder.body.id}`)
      .set('Authorization', auth(admin))
      .expect(200);
    expect(hard.body).toEqual({ success: true, mode: 'deleted' });
    expect(await prisma.product.count({ where: { id: noOrder.body.id } })).toBe(
      0,
    );
  });

  it('удаление: товар и вариант в наборе — 409 PRODUCT_IN_BUNDLE / VARIANT_IN_BUNDLE, данные целы', async () => {
    const created = await post(admin, productBody('inbundle')).expect(201);
    const productId: string = created.body.id;
    const firstVariantId: string = created.body.variants[0].id;
    const second = await request(app.getHttpServer())
      .post(`/admin/store/products/${productId}/variants`)
      .set('Authorization', auth(admin))
      .send({ duration: 'FOREVER', price: '500.00' })
      .expect(201);
    const bundle = await prisma.bundle.create({
      data: {
        name: 'E2E bundle',
        slug: slug('bundle'),
        totalPrice: '80.00',
        originalPrice: '100.00',
        items: {
          create: [{ productId, variantId: second.body.id, quantity: 1 }],
        },
      },
    });

    const delVariant = await request(app.getHttpServer())
      .delete(`/admin/store/products/${productId}/variants/${second.body.id}`)
      .set('Authorization', auth(admin))
      .expect(409);
    expect(delVariant.body.code).toBe('VARIANT_IN_BUNDLE');
    expect(
      await prisma.productVariant.count({ where: { id: second.body.id } }),
    ).toBe(1);

    const delProduct = await request(app.getHttpServer())
      .delete(`/admin/store/products/${productId}`)
      .set('Authorization', auth(admin))
      .expect(409);
    expect(delProduct.body.code).toBe('PRODUCT_IN_BUNDLE');
    expect(await prisma.product.count({ where: { id: productId } })).toBe(1);
    expect(
      await prisma.bundleItem.count({ where: { bundleId: bundle.id } }),
    ).toBe(1);

    // Вариант, не входящий в набор, удаляется как обычно.
    await request(app.getHttpServer())
      .delete(`/admin/store/products/${productId}/variants/${firstVariantId}`)
      .set('Authorization', auth(admin))
      .expect(200);

    // После снятия из набора товар удаляется.
    await prisma.bundle.delete({ where: { id: bundle.id } });
    await request(app.getHttpServer())
      .delete(`/admin/store/products/${productId}`)
      .set('Authorization', auth(admin))
      .expect(200);
    expect(await prisma.product.count({ where: { id: productId } })).toBe(0);
  });

  it('права: variants и delete — отдельные права (403 без права, успех с правом)', async () => {
    const created = await post(admin, productBody('permsplit')).expect(201);
    const productId: string = created.body.id;

    // Только variants: варианты можно, удалять товар — нельзя.
    const variant = await request(app.getHttpServer())
      .post(`/admin/store/products/${productId}/variants`)
      .set('Authorization', auth(varOnly))
      .send({ duration: 'FOREVER', price: '300.00' })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/admin/store/products/${productId}/variants/${variant.body.id}`)
      .set('Authorization', auth(varOnly))
      .send({ order: 2 })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/admin/store/products/${productId}`)
      .set('Authorization', auth(varOnly))
      .expect(403);
    expect(await prisma.product.count({ where: { id: productId } })).toBe(1);

    // Только delete: вариантами управлять нельзя, товар удалить можно.
    await request(app.getHttpServer())
      .post(`/admin/store/products/${productId}/variants`)
      .set('Authorization', auth(delOnly))
      .send({ duration: 'MONTH_3', price: '1.00' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/admin/store/products/${productId}/variants/${variant.body.id}`)
      .set('Authorization', auth(delOnly))
      .send({ order: 3 })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/admin/store/products/${productId}/variants/${variant.body.id}`)
      .set('Authorization', auth(delOnly))
      .expect(403);
    expect(
      await prisma.productVariant.count({ where: { id: variant.body.id } }),
    ).toBe(1);

    // Вариант удаляет тот, у кого variants; товар — тот, у кого delete.
    await request(app.getHttpServer())
      .delete(`/admin/store/products/${productId}/variants/${variant.body.id}`)
      .set('Authorization', auth(varOnly))
      .expect(200);
    const del = await request(app.getHttpServer())
      .delete(`/admin/store/products/${productId}`)
      .set('Authorization', auth(delOnly))
      .expect(200);
    expect(del.body.mode).toBe('deleted');
  });
});
