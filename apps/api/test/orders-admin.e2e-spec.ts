import { E2E_PAYMENT_WEBHOOK_SECRET } from './helpers/payment-webhook-env';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { APP_CREATE_OPTIONS, configureApp } from './../src/configure-app';
import { signPaymentWebhook } from './helpers/sign-payment-webhook';
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
  const cleanupBulkIds: string[] = [];

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
    app = moduleFixture.createNestApplication(APP_CREATE_OPTIONS);
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
      'store.discounts.view',
      'store.discounts.bulk.create',
      'store.discounts.bulk.edit',
      'store.discounts.bulk.delete',
      'store.discounts.loyalty.create',
      'store.discounts.loyalty.edit',
      'store.discounts.loyalty.delete',
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
    await prisma.bulkDiscount.deleteMany({
      where: { id: { in: cleanupBulkIds } },
    });
    await prisma.loyaltyDiscount.deleteMany({
      where: { name: { startsWith: `E2E ${unique}` } },
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
    expect(
      byNick.body.items.map((o: { orderNumber: string }) => o.orderNumber),
    ).toEqual([orderNo('F1')]);

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

  const EXPORT_HEADER =
    'id,orderNumber,userId,guestMinecraftNick,status,subtotal,discountAmount,total,paymentProvider,paidAt,createdAt';

  const exportOrders = (body: Record<string, unknown>) =>
    http()
      .post('/admin/orders/export')
      .set('Authorization', auth(admin))
      .send(body);

  it('экспорт заказов: заголовки, содержимое строки, без лишних ПДн', async () => {
    const order = await makeOrder('X1', 'COMPLETED', {
      guestMinecraftNick: 'Plain_Nick',
      paymentProvider: 'test',
    });
    const res = await exportOrders({}).expect(201);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="orders-\d+\.csv"$/,
    );
    const lines = res.text.split('\r\n');
    expect(lines[0]).toBe(EXPORT_HEADER);
    const row = lines.find((l) => l.includes(orderNo('X1')));
    expect(row).toBeDefined();
    const cells = row!.split(',');
    expect(cells).toHaveLength(EXPORT_HEADER.split(',').length);
    expect(cells[0]).toBe(order.id);
    expect(cells[1]).toBe(orderNo('X1'));
    expect(cells[3]).toBe('Plain_Nick');
    expect(cells[4]).toBe('COMPLETED');
    expect(cells[5]).toBe('100');
    expect(cells[7]).toBe('100');
    expect(cells[8]).toBe('test');
    expect(cells[9]).toBe(order.paidAt?.toISOString());
    expect(cells[10]).toBe(order.createdAt.toISOString());
    // Ни e-mail, ни логина, ни IP в выгрузке нет (только перечисленные колонки).
    expect(lines[0]).not.toMatch(/email|ip|username/i);
  });

  it('экспорт заказов: значения на = + - @ экранируются от CSV-инъекции', async () => {
    const evil: [string, string][] = [
      ['E1', '=A1,"x"'],
      ['E2', '+SUM(1;1)'],
      ['E3', '-2+3'],
      ['E4', '@SUM(A1)'],
    ];
    for (const [n, nick] of evil) {
      await makeOrder(n, 'PENDING', { guestMinecraftNick: nick });
    }
    const res = await exportOrders({}).expect(201);
    const lines = res.text.split('\r\n');
    // Ни одна ячейка с ником не начинается с опасного символа.
    expect(res.text).toContain(`,"'=A1,""x""",`);
    expect(res.text).toContain(",'+SUM(1;1),");
    expect(res.text).toContain(",'-2+3,");
    expect(res.text).toContain(",'@SUM(A1),");
    for (const [n] of evil) {
      const row = lines.find((l) => l.includes(orderNo(n)))!;
      expect(row.split(',')[3]).toMatch(/^"?'/);
    }
    // Числовые суммы не искажаются префиксом.
    expect(res.text).not.toContain(",'100");
  });

  it('экспорт заказов: dateTo=YYYY-MM-DD включает заказ последнего дня, как и список', async () => {
    const lastDay = await makeOrder('D1', 'PENDING', {
      createdAt: new Date('2031-03-05T23:30:00.000Z'),
    });
    const inRange = await exportOrders({
      dateFrom: '2031-03-05',
      dateTo: '2031-03-05',
    }).expect(201);
    expect(inRange.text).toContain(orderNo('D1'));
    const before = await exportOrders({ dateTo: '2031-03-04' }).expect(201);
    expect(before.text).not.toContain(orderNo('D1'));
    const list = await http()
      .get('/admin/orders')
      .query({ dateFrom: '2031-03-05', dateTo: '2031-03-05' })
      .set('Authorization', auth(viewer))
      .expect(200);
    expect(list.body.items.map((o: { id: string }) => o.id)).toContain(
      lastDay.id,
    );
    await exportOrders({ dateFrom: '2031-03-06', dateTo: '2031-03-05' }).expect(
      400,
    );
  });

  it('экспорт заказов: аудит — кто, фильтр, число строк, без ПДн', async () => {
    await makeOrder('A1', 'PENDING', {
      guestMinecraftNick: 'AuditSecretNick',
      createdAt: new Date('2032-06-10T12:00:00.000Z'),
    });
    await exportOrders({
      status: 'PENDING',
      dateFrom: '2032-06-10',
      dateTo: '2032-06-10',
    }).expect(201);
    const audit = await prisma.auditLog.findFirst({
      where: { actorId: admin.id, action: 'orders.export.completed' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
    const changes = audit?.changes as {
      filter: Record<string, unknown>;
      rowCount: number;
    };
    expect(changes.filter).toEqual({
      status: 'PENDING',
      userId: null,
      dateFrom: '2032-06-10',
      dateTo: '2032-06-10',
    });
    expect(changes.rowCount).toBe(1);
    const text = JSON.stringify(audit);
    expect(text).not.toContain('AuditSecretNick');
    expect(text).not.toContain(orderNo('A1'));
  });

  it('гонка: отмена PENDING против вебхука оплаты — ровно один исход', async () => {
    const webhook = (orderNumber: string, paymentId: string) => {
      const signed = signPaymentWebhook(E2E_PAYMENT_WEBHOOK_SECRET, {
        orderNumber,
        paymentId,
        status: 'succeeded',
        amount: '100.00',
        currency: 'RUB',
      });
      return http()
        .post('/webhooks/payments/test')
        .set('Content-Type', 'application/json')
        .set(signed.headers)
        .send(signed.rawBody);
    };
    for (let i = 0; i < 6; i += 1) {
      const order = await makeOrder(`R${i}`, 'PENDING', {
        paymentProvider: 'test',
        paymentId: `race-${unique}-${i}`,
      });
      const [cancelRes, hookRes] = await Promise.all([
        http()
          .patch(`/admin/orders/${order.id}/cancel`)
          .set('Authorization', auth(admin))
          .send({ reason: 'гонка' }),
        webhook(orderNo(`R${i}`), `race-${unique}-${i}`),
      ]);
      expect(hookRes.status).toBe(200);
      const final = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      const cancelAudits = await prisma.auditLog.count({
        where: { action: 'orders.order.cancelled', targetId: order.id },
      });
      if (final.status === 'COMPLETED') {
        // Оплата победила: оплаченный заказ не отменён.
        expect(cancelRes.status).toBe(409);
        expect(final.paidAt).not.toBeNull();
        expect(final.cancelledAt).toBeNull();
        expect(cancelAudits).toBe(0);
      } else {
        // Отмена победила: вебхук принят как already_processed, оплаты нет.
        expect(final.status).toBe('CANCELLED');
        expect(cancelRes.status).toBe(200);
        expect(final.paidAt).toBeNull();
        expect(cancelAudits).toBe(1);
      }
    }
  });

  it('скидки: CRUD bulk и loyalty, валидация, 404, аудит, права', async () => {
    const adminHeader = { Authorization: auth(admin) };
    const loyaltyName = `E2E ${unique} loyalty`;

    // Права: viewer не создаёт и не видит админский список.
    await http()
      .post('/admin/store/discounts/bulk')
      .set('Authorization', auth(viewer))
      .send({ discountType: 'PERCENT', discountValue: '5', minQuantity: 2 })
      .expect(403);
    await http()
      .get('/admin/store/discounts/bulk')
      .set('Authorization', auth(viewer))
      .expect(403);

    // bulk: валидация
    const createBulk = (body: Record<string, unknown>) =>
      http()
        .post('/admin/store/discounts/bulk')
        .set(adminHeader)
        .send({
          discountType: 'PERCENT',
          discountValue: '10',
          minQuantity: 5,
          ...body,
        });
    await createBulk({ discountValue: '101' }).expect(400);
    await createBulk({ discountValue: '0' }).expect(400);
    await createBulk({ discountValue: 'abc' }).expect(400);
    await createBulk({ productId: 'no-such-product' }).expect(400);

    const bulk = await createBulk({ discountValue: '12.50' }).expect(201);
    cleanupBulkIds.push(bulk.body.id);
    expect(bulk.body.minQuantity).toBe(5);

    const bulkList = await http()
      .get('/admin/store/discounts/bulk')
      .set(adminHeader)
      .expect(200);
    expect(bulkList.body.map((d: { id: string }) => d.id)).toContain(
      bulk.body.id,
    );

    await http()
      .patch(`/admin/store/discounts/bulk/${bulk.body.id}`)
      .set(adminHeader)
      .send({ discountValue: '150' })
      .expect(400);
    const bulkUpd = await http()
      .patch(`/admin/store/discounts/bulk/${bulk.body.id}`)
      .set(adminHeader)
      .send({ minQuantity: 7, isActive: false })
      .expect(200);
    expect(bulkUpd.body.minQuantity).toBe(7);
    expect(bulkUpd.body.isActive).toBe(false);
    await http()
      .patch('/admin/store/discounts/bulk/no-such-id')
      .set(adminHeader)
      .send({ minQuantity: 1 })
      .expect(404);

    // loyalty
    const createLoyalty = (body: Record<string, unknown>) =>
      http()
        .post('/admin/store/discounts/loyalty')
        .set(adminHeader)
        .send({
          minPurchases: 3,
          discountPercent: '4',
          name: loyaltyName,
          ...body,
        });
    await createLoyalty({ discountPercent: '101' }).expect(400);
    await createLoyalty({ minPurchases: 0 }).expect(400);
    await createLoyalty({ name: '' }).expect(400);
    const loyalty = await createLoyalty({}).expect(201);
    const loyaltyUpd = await http()
      .patch(`/admin/store/discounts/loyalty/${loyalty.body.id}`)
      .set(adminHeader)
      .send({ discountPercent: '6' })
      .expect(200);
    expect(String(loyaltyUpd.body.discountPercent)).toBe('6');
    await http()
      .patch(`/admin/store/discounts/loyalty/${loyalty.body.id}`)
      .set(adminHeader)
      .send({ discountPercent: '0' })
      .expect(400);
    const loyaltyList = await http()
      .get('/admin/store/discounts/loyalty')
      .set(adminHeader)
      .expect(200);
    expect(loyaltyList.body.map((d: { id: string }) => d.id)).toContain(
      loyalty.body.id,
    );

    // Аудит создания/изменения
    for (const [action, id] of [
      ['store.discount.bulk_created', bulk.body.id],
      ['store.discount.bulk_updated', bulk.body.id],
      ['store.discount.loyalty_created', loyalty.body.id],
      ['store.discount.loyalty_updated', loyalty.body.id],
    ]) {
      expect(
        await prisma.auditLog.count({
          where: { actorId: admin.id, action, targetId: id },
        }),
      ).toBe(1);
    }

    // Удаление и повторное удаление
    await http()
      .delete(`/admin/store/discounts/bulk/${bulk.body.id}`)
      .set(adminHeader)
      .expect(200);
    await http()
      .delete(`/admin/store/discounts/bulk/${bulk.body.id}`)
      .set(adminHeader)
      .expect(404);
    await http()
      .delete(`/admin/store/discounts/loyalty/${loyalty.body.id}`)
      .set(adminHeader)
      .expect(200);
    await http()
      .delete(`/admin/store/discounts/loyalty/${loyalty.body.id}`)
      .set(adminHeader)
      .expect(404);
    expect(
      await prisma.bulkDiscount.count({ where: { id: bulk.body.id } }),
    ).toBe(0);
    for (const [action, id] of [
      ['store.discount.bulk_deleted', bulk.body.id],
      ['store.discount.loyalty_deleted', loyalty.body.id],
    ]) {
      expect(
        await prisma.auditLog.count({
          where: { actorId: admin.id, action, targetId: id },
        }),
      ).toBe(1);
    }
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
