import './helpers/payment-webhook-env';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';

jest.setTimeout(20_000);

/// Админка заказов и промокодов (подэтап 0.4, API): права и 403, отмена
/// только PENDING (409 иначе), фильтры списка, карточка без секретов,
/// CRUD промокодов с валидацией, аудит. 2FA персонала (ADR-0169) проверяет
/// two-factor.e2e-spec.ts (общий PermissionsGuard) — здесь не дублируется,
/// чтобы не включать глобальный флаг requireAdmin2fa.
describe('Orders admin (e2e)', () => {
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
    const email = `oad-${label}-${unique}@example.com`;
    const username = `oad${label}${unique}`
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
  const allUserIds = () => [admin, viewer, nobody].map((u) => u.id);
  const auth = (u: TestUser) => `Bearer ${u.accessToken}`;
  const http = () => request(app.getHttpServer());
  const orderNo = (n: string) => `E2E${unique}${n}`;

  async function makeOrder(
    n: string,
    status: 'PENDING' | 'COMPLETED',
    extra: Record<string, unknown> = {},
  ) {
    return prisma.order.create({
      data: {
        orderNumber: orderNo(n),
        status,
        subtotal: '100.00',
        total: '100.00',
        ...(status === 'COMPLETED' ? { paidAt: new Date() } : {}),
        ...extra,
      },
    });
  }

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
    await createStaff(admin, `oad-admin-${unique}`, 20, [
      'orders.view',
      'orders.cancel',
      'orders.export',
      'promocodes.view',
      'promocodes.create',
      'promocodes.edit',
      'promocodes.delete',
    ]);
    await createStaff(viewer, `oad-viewer-${unique}`, 10, [
      'orders.view',
      'promocodes.view',
    ]);
  }, 30_000);

  afterAll(async () => {
    await prisma.order.deleteMany({
      where: { orderNumber: { startsWith: `E2E${unique}` } },
    });
    await prisma.promoCode.deleteMany({
      where: { code: { startsWith: `E2E-${unique.toUpperCase()}` } },
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
    await prisma.user.deleteMany({ where: { id: { in: allUserIds() } } });
    await app.close();
  }, 20_000);

  it('права: 401 без токена, 403 без права, view не даёт отменять/экспортировать/менять', async () => {
    await http().get('/admin/orders').expect(401);
    await http()
      .get('/admin/orders')
      .set('Authorization', auth(nobody))
      .expect(403);
    await http()
      .get('/admin/promocodes')
      .set('Authorization', auth(nobody))
      .expect(403);
    await http()
      .get('/admin/orders')
      .set('Authorization', auth(viewer))
      .expect(200);
    await http()
      .patch('/admin/orders/any/cancel')
      .set('Authorization', auth(viewer))
      .send({ reason: 'x' })
      .expect(403);
    await http()
      .post('/admin/orders/export')
      .set('Authorization', auth(viewer))
      .send({})
      .expect(403);
    await http()
      .post('/admin/promocodes')
      .set('Authorization', auth(viewer))
      .send({
        code: `E2E-${unique.toUpperCase()}-X`,
        discountType: 'PERCENT',
        discountValue: '10',
      })
      .expect(403);
    await http()
      .delete('/admin/promocodes/any')
      .set('Authorization', auth(viewer))
      .expect(403);
  });

  it('отмена PENDING: статус, причина, аудит; повтор и оплаченный — 409', async () => {
    const pending = await makeOrder('P1', 'PENDING');
    await http()
      .patch(`/admin/orders/${pending.id}/cancel`)
      .set('Authorization', auth(admin))
      .send({})
      .expect(400);
    await http()
      .patch(`/admin/orders/${pending.id}/cancel`)
      .set('Authorization', auth(admin))
      .send({ reason: '   ' })
      .expect(400);
    const res = await http()
      .patch(`/admin/orders/${pending.id}/cancel`)
      .set('Authorization', auth(admin))
      .send({ reason: '  Дубль заказа  ' })
      .expect(200);
    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.cancelReason).toBe('Дубль заказа');

    const audit = await prisma.auditLog.findFirst({
      where: {
        actorId: admin.id,
        action: 'orders.order.cancelled',
        targetId: pending.id,
      },
    });
    expect(audit).not.toBeNull();
    expect(audit?.severity).toBe('warning');
    expect(JSON.stringify(audit?.changes)).toContain('Дубль заказа');

    const again = await http()
      .patch(`/admin/orders/${pending.id}/cancel`)
      .set('Authorization', auth(admin))
      .send({ reason: 'ещё раз' })
      .expect(409);
    expect(again.body.code).toBe('ORDER_NOT_CANCELLABLE');

    const paid = await makeOrder('C1', 'COMPLETED');
    await http()
      .patch(`/admin/orders/${paid.id}/cancel`)
      .set('Authorization', auth(admin))
      .send({ reason: 'оплачен' })
      .expect(409);
    const still = await prisma.order.findUniqueOrThrow({
      where: { id: paid.id },
    });
    expect(still.status).toBe('COMPLETED');
    expect(
      await prisma.auditLog.count({
        where: { action: 'orders.order.cancelled', targetId: paid.id },
      }),
    ).toBe(0);

    await http()
      .patch('/admin/orders/no-such-order/cancel')
      .set('Authorization', auth(admin))
      .send({ reason: 'нет' })
      .expect(404);
  });

  it('фильтры списка: статус, номер, ник, даты, пагинация; карточка без секретов', async () => {
    await makeOrder('F1', 'PENDING', { guestMinecraftNick: 'Zed_Nick' });
    await makeOrder('F2', 'COMPLETED', {
      guestMinecraftNick: 'Other',
      paymentProvider: 'test',
      paymentId: 'pay-1',
    });

    const byNumber = await http()
      .get('/admin/orders')
      .query({ orderNumber: orderNo('F') })
      .set('Authorization', auth(viewer))
      .expect(200);
    expect(byNumber.body.total).toBe(2);

    const byStatus = await http()
      .get('/admin/orders')
      .query({ orderNumber: orderNo('F'), status: 'COMPLETED' })
      .set('Authorization', auth(viewer))
      .expect(200);
    expect(byStatus.body.total).toBe(1);
    expect(byStatus.body.items[0].orderNumber).toBe(orderNo('F2'));

    const byNick = await http()
      .get('/admin/orders')
      .query({ nickname: 'zed_' })
      .set('Authorization', auth(viewer))
      .expect(200);
    expect(byNick.body.items.map((o: { orderNumber: string }) => o.orderNumber))
      .toEqual([orderNo('F1')]);

    const today = new Date().toISOString().slice(0, 10);
    const byDate = await http()
      .get('/admin/orders')
      .query({ orderNumber: orderNo('F'), dateFrom: today, dateTo: today })
      .set('Authorization', auth(viewer))
      .expect(200);
    expect(byDate.body.total).toBe(2);
    await http()
      .get('/admin/orders')
      .query({ dateFrom: '2030-01-02', dateTo: '2030-01-01' })
      .set('Authorization', auth(viewer))
      .expect(400);

    const paged = await http()
      .get('/admin/orders')
      .query({ orderNumber: orderNo('F'), limit: 1, page: 2 })
      .set('Authorization', auth(viewer))
      .expect(200);
    expect(paged.body.items).toHaveLength(1);
    expect(paged.body.total).toBe(2);

    const card = await http()
      .get(`/admin/orders/${orderNo('F2')}`)
      .set('Authorization', auth(viewer))
      .expect(200);
    expect(card.body.orderNumber).toBe(orderNo('F2'));
    expect(card.body.payment.provider).toBe('test');
    expect(card.body.payment.isPaid).toBe(true);
    const text = JSON.stringify(card.body);
    expect(text).not.toContain('gameCommands');
    expect(text).not.toContain('signature');
    await http()
      .get('/admin/orders/no-such-order')
      .set('Authorization', auth(viewer))
      .expect(404);
  });

  it('экспорт заказов: право orders.export, CSV без лишних ПДн', async () => {
    await makeOrder('X1', 'PENDING');
    const res = await http()
      .post('/admin/orders/export')
      .set('Authorization', auth(admin))
      .send({})
      .expect(201);
    const csv: string = res.text || JSON.stringify(res.body);
    expect(csv).toContain(orderNo('X1'));
    expect(csv).not.toContain('email');
  });

  it('промокод: CRUD, валидация Decimal/процентов/дат, дубль 409, аудит', async () => {
    const code = `E2E-${unique.toUpperCase()}-A`;
    const create = (body: Record<string, unknown>) =>
      http()
        .post('/admin/promocodes')
        .set('Authorization', auth(admin))
        .send({ code, discountType: 'PERCENT', discountValue: '10', ...body });

    await create({ discountValue: '101' }).expect(400);
    await create({ discountValue: '0' }).expect(400);
    await create({ discountValue: '-5' }).expect(400);
    await create({ discountValue: 'abc' }).expect(400);
    await create({ discountValue: '1e-7' }).expect(400);
    await create({
      validFrom: '2030-02-01T00:00:00Z',
      validUntil: '2030-01-01T00:00:00Z',
    }).expect(400);
    await create({ maxUses: 0 }).expect(400);

    const created = await create({ discountValue: '15.50' }).expect(201);
    expect(created.body.code).toBe(code);
    await create({}).expect(409);

    const createdAudit = await prisma.auditLog.findFirst({
      where: {
        actorId: admin.id,
        action: 'store.promocode.created',
        targetId: created.body.id,
      },
    });
    expect(createdAudit).not.toBeNull();

    const list = await http()
      .get('/admin/promocodes')
      .query({ search: code })
      .set('Authorization', auth(viewer))
      .expect(200);
    expect(JSON.stringify(list.body)).toContain(code);

    await http()
      .patch(`/admin/promocodes/${created.body.id}`)
      .set('Authorization', auth(admin))
      .send({ discountValue: '150' })
      .expect(400);
    await http()
      .patch(`/admin/promocodes/${created.body.id}`)
      .set('Authorization', auth(admin))
      .send({ isActive: false })
      .expect(200);
    expect(
      await prisma.auditLog.count({
        where: {
          action: 'store.promocode.updated',
          targetId: created.body.id,
        },
      }),
    ).toBe(1);

    await http()
      .delete(`/admin/promocodes/${created.body.id}`)
      .set('Authorization', auth(admin))
      .expect(200);
    expect(
      await prisma.auditLog.count({
        where: {
          action: 'store.promocode.deleted',
          targetId: created.body.id,
        },
      }),
    ).toBe(1);
  });
});
