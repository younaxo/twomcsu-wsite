import { E2E_PAYMENT_WEBHOOK_SECRET } from './helpers/payment-webhook-env';
import './helpers/refunds-env';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { APP_CREATE_OPTIONS, configureApp } from './../src/configure-app';
import { signPaymentWebhook } from './helpers/sign-payment-webhook';
import { markStaffTwoFactorEnabled } from './helpers/staff-two-factor';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';
import { TwoFactorService } from '../src/modules/auth/two-factor/two-factor.service';
import { StoreReconcileService } from '../src/modules/store/store-reconcile.service';

jest.setTimeout(30_000);

/// Возвраты и сверка платежей (0.9, ADR-0188) на TestPaymentProvider. Свежий код
/// 2FA подменён заглушкой TwoFactorService (принимает только код 123456):
/// настоящий TOTP проверяет two-factor.e2e-spec. Спека НЕ запускалась при
/// написании (нет БД в сеансе) — прогнать при «ресурсы свободны».
/// Требует в БД права `orders.refund` и `store.refund.override` (синхронизация
/// реестра прав при старте/seed).
describe('Возвраты магазина (0.9, e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  const unique = randomUUID().slice(0, 8);
  const password = 'Sup3rSecretPassw0rd!';
  const GOOD_CODE = '123456';
  const roleSlugs: string[] = [];
  const orderNumbers: string[] = [];
  let seq = 0;

  interface TestUser {
    id: string;
    accessToken: string;
  }
  let staff: TestUser;
  let owner: TestUser;
  let plain: TestUser;

  const http = () => request(app.getHttpServer());
  const auth = (u: TestUser) => `Bearer ${u.accessToken}`;

  async function createUser(label: string): Promise<TestUser> {
    const email = `rf-${label}-${unique}@example.com`;
    const username = `rf${label}${unique}`
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 16);
    await http()
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);
    const login = await http()
      .post('/auth/login')
      .send({ emailOrUsername: email, password })
      .expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { id: user.id, accessToken: login.body.accessToken };
  }

  async function makeStaff(user: TestUser, slug: string, keys: string[]) {
    roleSlugs.push(slug);
    const role = await prisma.role.create({
      data: {
        name: slug,
        slug,
        displayName: slug,
        priority: 20,
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

  async function sendPaymentWebhook(
    orderNumber: string,
    paymentId: string,
    amount: number,
  ) {
    const signed = signPaymentWebhook(E2E_PAYMENT_WEBHOOK_SECRET, {
      orderNumber,
      paymentId,
      status: 'succeeded',
      amount: String(amount),
      currency: 'RUB',
    });
    await http()
      .post('/webhooks/payments/test')
      .set('Content-Type', 'application/json')
      .set(signed.headers)
      .send(signed.rawBody)
      .expect(200);
  }

  /// Оплаченный заказ: создаём PENDING и подаём подписанный вебхук (так платёж
  /// попадает в учёт провайдера и заказ становится COMPLETED).
  async function paidOrder(total = 100, delivered = false): Promise<string> {
    seq += 1;
    const orderNumber = `RF-${unique}-${seq}`;
    orderNumbers.push(orderNumber);
    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: plain.id,
        subtotal: total,
        total,
        paymentId: `pay-${unique}-${seq}`,
        paymentProvider: 'test',
        items: {
          create: [
            {
              quantity: 1,
              unitPrice: total,
              totalPrice: total,
              isDelivered: delivered,
            },
          ],
        },
      },
    });
    await sendPaymentWebhook(orderNumber, order.paymentId as string, total);
    return order.id;
  }

  const refund = (
    u: TestUser,
    orderId: string,
    body: Record<string, unknown>,
  ) =>
    http()
      .post(`/admin/store/refunds/orders/${orderId}`)
      .set('Authorization', auth(u))
      .send({ reason: 'тест', twoFactorCode: GOOD_CODE, ...body });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TwoFactorService)
      .useValue({
        available: true,
        verify: (_id: string, code: string) =>
          Promise.resolve(code === GOOD_CODE ? 'totp' : null),
      })
      .compile();
    app = moduleFixture.createNestApplication(APP_CREATE_OPTIONS);
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    permissions = app.get(PermissionService);
    staff = await createUser('staff');
    owner = await createUser('owner');
    plain = await createUser('plain');
    await makeStaff(staff, `e2e-rf-staff-${unique}`, ['orders.refund']);
    await makeStaff(owner, `e2e-rf-owner-${unique}`, [
      'orders.refund',
      'store.refund.override',
    ]);
  });

  afterAll(async () => {
    const orders = await prisma.order.findMany({
      where: { orderNumber: { in: orderNumbers } },
      select: { id: true },
    });
    const ids = orders.map((o) => o.id);
    await prisma.orderRefund.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    const users = [staff, owner, plain].filter(Boolean).map((u) => u.id);
    await prisma.userRole.deleteMany({
      where: { role: { slug: { in: roleSlugs } } },
    });
    await prisma.rolePermission.deleteMany({
      where: { role: { slug: { in: roleSlugs } } },
    });
    await prisma.role.deleteMany({ where: { slug: { in: roleSlugs } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: users } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  });

  it('без права orders.refund — 403; без токена — 401', async () => {
    const id = await paidOrder();
    await refund(plain, id, {}).expect(403);
    await http().post(`/admin/store/refunds/orders/${id}`).send({}).expect(401);
  });

  it('причина и свежий код 2FA обязательны', async () => {
    const id = await paidOrder();
    await refund(staff, id, { reason: ' ' }).expect(400);
    const bad = await refund(staff, id, { twoFactorCode: '000000' }).expect(
      403,
    );
    expect(bad.body.code).toBe('refund_two_factor_invalid');
  });

  it('возврат до выдачи: REFUNDED, второй возврат — 409', async () => {
    const id = await paidOrder();
    const ok = await refund(staff, id, {}).expect(201);
    expect(ok.body.orderStatus).toBe('REFUNDED');
    expect(ok.body.refund.status).toBe('SUCCEEDED');
    const again = await refund(staff, id, {}).expect(409);
    expect(again.body.code).toBe('order_already_refunded');
    expect(await prisma.orderRefund.count({ where: { orderId: id } })).toBe(1);
  });

  it('частичный возврат, затем остаток; сверх остатка — 400', async () => {
    const id = await paidOrder(100);
    const first = await refund(staff, id, { amount: '30.00' }).expect(201);
    expect(first.body.orderStatus).toBe('COMPLETED');
    const over = await refund(staff, id, { amount: '80.00' }).expect(400);
    expect(over.body.code).toBe('refund_exceeds_paid');
    const rest = await refund(staff, id, {}).expect(201);
    expect(Number(rest.body.refund.amount)).toBe(70);
    expect(rest.body.orderStatus).toBe('REFUNDED');
  });

  it('после выдачи обычный возврат — 409, override только с правом store.refund.override', async () => {
    const id = await paidOrder(100, true);
    const blocked = await refund(staff, id, {}).expect(409);
    expect(blocked.body.code).toBe('refund_after_delivery');
    await http()
      .post(`/admin/store/refunds/orders/${id}/override`)
      .set('Authorization', auth(staff))
      .send({ reason: 'ошибка выдачи', twoFactorCode: GOOD_CODE })
      .expect(403);
    const ok = await http()
      .post(`/admin/store/refunds/orders/${id}/override`)
      .set('Authorization', auth(owner))
      .send({ reason: 'ошибка выдачи', twoFactorCode: GOOD_CODE })
      .expect(201);
    expect(ok.body.refund.kind).toBe('OVERRIDE');
    expect(ok.body.refund.requiresManualRevoke).toBe(true);
    const audit = await prisma.auditLog.findMany({
      where: { targetId: id, action: { startsWith: 'orders.refund.override' } },
    });
    expect(audit.length).toBeGreaterThanOrEqual(2);
  });

  it('список возвратов фильтруется по статусу', async () => {
    const res = await http()
      .get('/admin/store/refunds?status=SUCCEEDED&limit=5')
      .set('Authorization', auth(staff))
      .expect(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('сверка: PENDING-заказ, оплаченный у провайдера, завершается', async () => {
    seq += 1;
    const orderNumber = `RF-${unique}-${seq}`;
    orderNumbers.push(orderNumber);
    const paymentId = `pay-${unique}-${seq}`;
    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: plain.id,
        subtotal: 50,
        total: 50,
        paymentId,
        paymentProvider: 'test',
        createdAt: new Date(Date.now() - 2 * 3_600_000),
      },
    });
    // Платёж становится известен провайдеру событием по «чужому» номеру заказа:
    // наш заказ вебхук не получает и остаётся PENDING до сверки.
    await sendPaymentWebhook(`GHOST-${unique}`, paymentId, 50);
    const report = await app.get(StoreReconcileService).runOnce();
    expect(report.errors).toBe(0);
    const after = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(after.status).toBe('COMPLETED');
  });
});
