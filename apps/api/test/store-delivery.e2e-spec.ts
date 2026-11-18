import { E2E_PAYMENT_WEBHOOK_SECRET } from './helpers/payment-webhook-env';
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
import { DeliveryService } from '../src/modules/delivery/delivery.service';
import { OrdersService } from '../src/modules/store/orders.service';

jest.setTimeout(30_000);

/// Выдача купленного (подэтап 0.7, ADR-0184): вебхук создаёт задания в той же
/// транзакции, двойной вебхук без дублей, подарок получателю, флаг
/// `store.delivery.enabled`, захват с арендой (SKIP LOCKED), поздний результат,
/// ручная отметка и повтор в админке (права, 2FA, аудит), статус выдачи у
/// покупателя без внутренних деталей, отзыв сайтовой выдачи, сервисная
/// проверка возврата. Команд на сервер нет: исполнитель `command` не включён.
describe('Выдача купленного (0.7, e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  let delivery: DeliveryService;
  let orders: OrdersService;
  const unique = randomUUID().slice(0, 8);
  const password = 'Sup3rSecretPassw0rd!';
  const cleanupRoleSlugs: string[] = [];
  const orderNumbers: string[] = [];
  const FLAG_KEY = 'store.delivery.enabled';

  interface TestUser {
    id: string;
    accessToken: string;
    email: string;
  }

  async function createUser(label: string): Promise<TestUser> {
    const email = `dlv-${label}-${unique}@example.com`;
    const username = `dlv${label}${unique}`
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 16);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ emailOrUsername: email, password })
      .expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { id: user.id, accessToken: login.body.accessToken, email };
  }

  async function makeStaff(
    user: TestUser,
    slug: string,
    keys: string[],
    twoFactor = true,
  ) {
    cleanupRoleSlugs.push(slug);
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
    if (twoFactor) await markStaffTwoFactorEnabled(prisma, user.id);
    const records = await prisma.permission.findMany({
      where: { key: { in: keys } },
    });
    await prisma.rolePermission.createMany({
      data: records.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
    await permissions.invalidateRole(role.id);
    await permissions.invalidateUser(user.id);
  }

  const auth = (u: TestUser) => `Bearer ${u.accessToken}`;
  const http = () => request(app.getHttpServer());

  async function setFlag(value: 'true' | 'false' | null) {
    if (value === null) {
      await prisma.siteSetting.deleteMany({ where: { key: FLAG_KEY } });
    } else {
      await prisma.siteSetting.upsert({
        where: { key: FLAG_KEY },
        create: { key: FLAG_KEY, value },
        update: { value },
      });
    }
    delivery.resetSettingsCache();
  }

  let alice: TestUser;
  let bob: TestUser;
  let admin: TestUser;
  let viewer: TestUser;
  let noTwoFactor: TestUser;
  const aliceNick = `Al${unique}`;
  const bobNick = `Bo${unique}`;
  let categoryId: string;
  let gameProductId: string;
  let decoProductId: string;
  let decorationId: string;
  let orderSeq = 0;

  interface ItemSpec {
    productId: string;
    giftToUserId?: string;
  }

  async function makeOrder(
    buyer: TestUser,
    items: ItemSpec[],
    nick = aliceNick,
  ): Promise<string> {
    orderSeq += 1;
    const orderNumber = `DLV-${unique}-${orderSeq}`;
    orderNumbers.push(orderNumber);
    await prisma.order.create({
      data: {
        orderNumber,
        userId: buyer.id,
        guestMinecraftNick: nick,
        subtotal: 100,
        total: 100,
        paymentId: `pay-${unique}-${orderSeq}`,
        paymentProvider: 'test',
        items: {
          create: items.map((i) => ({
            productId: i.productId,
            quantity: 1,
            unitPrice: 100,
            totalPrice: 100,
            giftToUserId: i.giftToUserId,
          })),
        },
      },
    });
    return orderNumber;
  }

  async function payment(orderNumber: string) {
    const order = await prisma.order.findUniqueOrThrow({
      where: { orderNumber },
    });
    const signed = signPaymentWebhook(E2E_PAYMENT_WEBHOOK_SECRET, {
      orderNumber,
      paymentId: order.paymentId,
      status: 'succeeded',
      amount: order.total.toString(),
      currency: 'RUB',
    });
    // Вебхук проверенного события всегда отвечает 200 (ADR-0157).
    return http()
      .post('/webhooks/payments/test')
      .set('Content-Type', 'application/json')
      .set(signed.headers)
      .send(signed.rawBody)
      .expect(200);
  }

  const tasksOf = (orderNumber: string) =>
    prisma.deliveryTask.findMany({
      where: { orderItem: { order: { orderNumber } } },
      orderBy: { createdAt: 'asc' },
    });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication(APP_CREATE_OPTIONS);
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    permissions = app.get(PermissionService);
    delivery = app.get(DeliveryService);
    orders = app.get(OrdersService);
    await setFlag(null);

    alice = await createUser('alice');
    bob = await createUser('bob');
    admin = await createUser('admin');
    viewer = await createUser('viewer');
    noTwoFactor = await createUser('no2fa');
    for (const [user, name] of [
      [alice, aliceNick],
      [bob, bobNick],
    ] as const) {
      await prisma.minecraftAccount.create({
        data: { userId: user.id, uuid: randomUUID(), name },
      });
    }
    await makeStaff(admin, `dlv-admin-${unique}`, [
      'store.delivery.view',
      'store.delivery.manage',
    ]);
    await makeStaff(viewer, `dlv-viewer-${unique}`, ['store.delivery.view']);
    await makeStaff(
      noTwoFactor,
      `dlv-no2fa-${unique}`,
      ['store.delivery.view', 'store.delivery.manage'],
      false,
    );

    categoryId = (
      await prisma.category.create({
        data: { name: 'E2E', slug: `e2e-dlv-${unique}-cat` },
      })
    ).id;
    // Игровой товар с «ядовитыми» gameCommands: выдача их не читает (Р1).
    gameProductId = (
      await prisma.product.create({
        data: {
          name: 'E2E Delivery Game',
          slug: `e2e-dlv-${unique}-game`,
          type: 'PRIVILEGE',
          categoryId,
          gameCommands: ['say SENTINEL_MUST_NEVER_BE_USED'],
          variants: { create: [{ duration: 'MONTH_1', price: 100 }] },
        },
      })
    ).id;
    decorationId = (
      await prisma.profileDecoration.create({
        data: {
          slug: `e2e-dlv-${unique}-deco`,
          name: 'E2E Deco',
          imageUrl: 'decorations/e2e.png',
          availability: 'STORE',
        },
      })
    ).id;
    decoProductId = (
      await prisma.product.create({
        data: {
          name: 'E2E Delivery Decoration',
          slug: `e2e-dlv-${unique}-decoration`,
          type: 'DECORATION',
          categoryId,
          decorationId,
          variants: { create: [{ duration: 'ONE_TIME', price: 100 }] },
        },
      })
    ).id;
  }, 60_000);

  afterAll(async () => {
    await setFlag(null);
    await prisma.order.deleteMany({
      where: { orderNumber: { in: orderNumbers } },
    });
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `e2e-dlv-${unique}` } },
    });
    await prisma.profileDecoration.deleteMany({
      where: { slug: { startsWith: `e2e-dlv-${unique}` } },
    });
    await prisma.category.deleteMany({
      where: { slug: { startsWith: `e2e-dlv-${unique}` } },
    });
    const users = [alice, bob, admin, viewer, noTwoFactor].filter(Boolean);
    const ids = users.map((u) => u.id);
    await prisma.userRole.deleteMany({
      where: { role: { slug: { in: cleanupRoleSlugs } } },
    });
    await prisma.rolePermission.deleteMany({
      where: { role: { slug: { in: cleanupRoleSlugs } } },
    });
    await prisma.role.deleteMany({ where: { slug: { in: cleanupRoleSlugs } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  // ------------------------------------------------ вебхук -> задания

  describe('вебхук создаёт задания', () => {
    let orderNo: string;

    it('оплата: по заданию на позицию в статусе «ожидает», шаблонов нет, ник и получатель из заказа', async () => {
      orderNo = await makeOrder(alice, [
        { productId: gameProductId },
        { productId: decoProductId },
      ]);
      await payment(orderNo);
      const order = await prisma.order.findUniqueOrThrow({
        where: { orderNumber: orderNo },
      });
      expect(order.status).toBe('COMPLETED');
      const tasks = await tasksOf(orderNo);
      expect(tasks).toHaveLength(2);
      const game = tasks.find((t) => t.executor === 'manual')!;
      const site = tasks.find((t) => t.executor === 'site')!;
      expect(game).toMatchObject({
        status: 'AWAITING_MANUAL',
        step: 1,
        renderedCommand: null,
        templateVersion: null,
        nick: aliceNick,
        recipientUserId: alice.id,
        attempts: 0,
      });
      expect(site).toMatchObject({ status: 'PENDING', step: 1 });
    });

    it('повторный вебхук: 200 без новых заданий', async () => {
      const res = await payment(orderNo);
      expect(res.body).toMatchObject({
        accepted: true,
        reason: 'already_processed',
      });
      expect(await tasksOf(orderNo)).toHaveLength(2);
    });

    it('гонка из 5 одновременных вебхуков: ровно по одному заданию на позицию', async () => {
      const raced = await makeOrder(alice, [
        { productId: gameProductId },
        { productId: decoProductId },
      ]);
      await Promise.all(Array.from({ length: 5 }, () => payment(raced)));
      expect(await tasksOf(raced)).toHaveLength(2);
    });

    it('UNIQUE (orderItemId, step): второй вставки быть не может', async () => {
      const [task] = await tasksOf(orderNo);
      await expect(
        prisma.deliveryTask.create({
          data: {
            orderItemId: task.orderItemId,
            step: task.step,
            executor: 'manual',
          },
        }),
      ).rejects.toThrow();
    });

    it('подарок выдаётся получателю: recipientUserId и ник получателя', async () => {
      const gift = await makeOrder(alice, [
        { productId: decoProductId, giftToUserId: bob.id },
        { productId: gameProductId, giftToUserId: bob.id },
      ]);
      await payment(gift);
      const tasks = await tasksOf(gift);
      expect(tasks).toHaveLength(2);
      for (const t of tasks) {
        expect(t.recipientUserId).toBe(bob.id);
        expect(t.nick).toBe(bobNick);
      }
    });

    it('отказ платежа заданий не создаёт', async () => {
      const failedNo = await makeOrder(alice, [{ productId: gameProductId }]);
      const order = await prisma.order.findUniqueOrThrow({
        where: { orderNumber: failedNo },
      });
      const signed = signPaymentWebhook(E2E_PAYMENT_WEBHOOK_SECRET, {
        orderNumber: failedNo,
        paymentId: order.paymentId,
        status: 'failed',
        amount: order.total.toString(),
        currency: 'RUB',
      });
      await http()
        .post('/webhooks/payments/test')
        .set('Content-Type', 'application/json')
        .set(signed.headers)
        .send(signed.rawBody)
        .expect(200);
      expect(await tasksOf(failedNo)).toHaveLength(0);
    });
  });

  // ----------------------------------------------------- флаг и воркер

  describe('флаг store.delivery.enabled и воркер', () => {
    it('по умолчанию выключен: заказ завершён, сайтовое задание ждёт, украшения нет', async () => {
      await setFlag(null);
      const no = await makeOrder(alice, [{ productId: decoProductId }]);
      await payment(no);
      await expect(delivery.processBatch()).resolves.toBe(0);
      const [task] = await tasksOf(no);
      expect(task.status).toBe('PENDING');
      expect(
        await prisma.userDecoration.count({
          where: { userId: alice.id, decorationId },
        }),
      ).toBe(0);
    });

    it('явное false в настройке: то же', async () => {
      await setFlag('false');
      await expect(delivery.processBatch()).resolves.toBe(0);
    });

    it('включение настройкой действует без перезапуска (после сброса кэша): украшение выдано с источником PURCHASE', async () => {
      await setFlag('true');
      const processed = await delivery.processBatch();
      expect(processed).toBeGreaterThanOrEqual(1);
      const grant = await prisma.userDecoration.findUnique({
        where: {
          userId_decorationId: { userId: alice.id, decorationId },
        },
      });
      expect(grant).toMatchObject({ source: 'PURCHASE' });
      expect(grant?.orderId).toBeTruthy();
      const delivered = await prisma.deliveryTask.findMany({
        where: {
          executor: 'site',
          status: 'DELIVERED',
          orderItem: { order: { orderNumber: { in: orderNumbers } } },
        },
        include: { orderItem: true },
      });
      expect(delivered.length).toBeGreaterThanOrEqual(1);
      for (const t of delivered) {
        expect(t.deliveredAt).toBeTruthy();
        expect(t.attempts).toBe(1);
        expect(t.leaseToken).toBeTruthy();
        expect(t.orderItem.isDelivered).toBe(true);
        expect(t.orderItem.deliveredAt).toBeTruthy();
      }
    });

    it('подарочное украшение выдано получателю, а не покупателю', async () => {
      const bobGrant = await prisma.userDecoration.findUnique({
        where: {
          userId_decorationId: { userId: bob.id, decorationId },
        },
      });
      expect(bobGrant).toMatchObject({ source: 'PURCHASE' });
    });

    it('игровой товар (manual) воркер не трогает; команд нет, gameCommands не использован', async () => {
      const manual = await prisma.deliveryTask.findMany({
        where: {
          executor: 'manual',
          orderItem: { order: { orderNumber: { in: orderNumbers } } },
        },
      });
      expect(manual.length).toBeGreaterThanOrEqual(1);
      for (const t of manual) {
        expect(t.status).toBe('AWAITING_MANUAL');
        expect(t.attempts).toBe(0);
        expect(t.renderedCommand).toBeNull();
      }
    });

    it('env STORE_DELIVERY_ENABLED=false — жёсткий запрет при включённой настройке', async () => {
      const no = await makeOrder(alice, [{ productId: decoProductId }]);
      await payment(no);
      const previous = process.env.STORE_DELIVERY_ENABLED;
      process.env.STORE_DELIVERY_ENABLED = 'false';
      try {
        // ConfigService читает process.env при каждом get (после валидации).
        expect(delivery.envHardDisabled()).toBe(true);
        await expect(delivery.isEnabled()).resolves.toBe(false);
        await expect(delivery.processBatch()).resolves.toBe(0);
        const [blocked] = await tasksOf(no);
        expect(blocked.status).toBe('PENDING');
      } finally {
        if (previous === undefined) delete process.env.STORE_DELIVERY_ENABLED;
        else process.env.STORE_DELIVERY_ENABLED = previous;
      }
      await delivery.processBatch();
      const [task] = await tasksOf(no);
      expect(task.status).toBe('DELIVERED');
    });

    it('сбой выдачи: украшение исчезло до выдачи — задание FAILED с причиной, заказ остаётся оплаченным', async () => {
      const extraDeco = await prisma.profileDecoration.create({
        data: {
          slug: `e2e-dlv-${unique}-deco2`,
          name: 'E2E Deco 2',
          imageUrl: 'decorations/e2e2.png',
          availability: 'STORE',
        },
      });
      const extraProduct = await prisma.product.create({
        data: {
          name: 'E2E Delivery Decoration 2',
          slug: `e2e-dlv-${unique}-decoration2`,
          type: 'DECORATION',
          categoryId,
          decorationId: extraDeco.id,
          variants: { create: [{ duration: 'ONE_TIME', price: 100 }] },
        },
      });
      await setFlag('false');
      const no = await makeOrder(alice, [{ productId: extraProduct.id }]);
      await payment(no);
      await prisma.profileDecoration.delete({ where: { id: extraDeco.id } });
      await setFlag('true');
      await delivery.processBatch();
      const [task] = await tasksOf(no);
      expect(task).toMatchObject({
        status: 'FAILED',
        lastError: 'decoration_missing',
        attempts: 1,
      });
      const order = await prisma.order.findUniqueOrThrow({
        where: { orderNumber: no },
      });
      expect(order.status).toBe('COMPLETED');
      const buyer = await http()
        .get(`/store/orders/${no}`)
        .set('Authorization', auth(alice))
        .expect(200);
      expect(buyer.body.deliveryStatus).toBe('failed');
    });
  });

  // ------------------------------------ захват, аренда, поздний результат

  describe('аренда с токеном (Р6)', () => {
    let orderNo: string;
    let taskId: string;

    it('два воркера одновременно: задание получает ровно один (SKIP LOCKED), попытка 1', async () => {
      await setFlag('false');
      orderNo = await makeOrder(alice, [{ productId: decoProductId }]);
      await payment(orderNo);
      taskId = (await tasksOf(orderNo))[0].id;
      await setFlag('true');
      // Прочие ожидающие сайтовые задания этого файла не должны мешать.
      await delivery.processBatch();
      await prisma.deliveryTask.update({
        where: { id: taskId },
        data: {
          status: 'PENDING',
          attempts: 0,
          leaseToken: null,
          deliveredAt: null,
        },
      });
      const results = await Promise.all([
        delivery.claimNext(),
        delivery.claimNext(),
        delivery.claimNext(),
      ]);
      const claimed = results.filter((r) => r !== null);
      expect(claimed).toHaveLength(1);
      expect(claimed[0]).toMatchObject({ id: taskId, attempts: 1 });
      expect(claimed[0]!.leaseToken).toBeTruthy();
      const row = await prisma.deliveryTask.findUniqueOrThrow({
        where: { id: taskId },
      });
      expect(row.status).toBe('IN_PROGRESS');
      expect(row.leaseUntil!.getTime()).toBeGreaterThan(Date.now());
    });

    it('запрет повторного захвата: задание в работе не берётся снова', async () => {
      await expect(delivery.claimNext()).resolves.toBeNull();
      await expect(delivery.processBatch()).resolves.toBe(0);
    });

    it('просроченная аренда идемпотентного (site) исполнителя возвращает задание в PENDING; новый захват — попытка 2 и новый токен', async () => {
      const before = await prisma.deliveryTask.findUniqueOrThrow({
        where: { id: taskId },
      });
      await prisma.deliveryTask.update({
        where: { id: taskId },
        data: { leaseUntil: new Date(Date.now() - 1000) },
      });
      await expect(
        delivery.recoverExpiredLeases(),
      ).resolves.toBeGreaterThanOrEqual(1);
      const back = await prisma.deliveryTask.findUniqueOrThrow({
        where: { id: taskId },
      });
      expect(back.status).toBe('PENDING');
      const again = await delivery.claimNext();
      expect(again).toMatchObject({ id: taskId, attempts: 2 });
      expect(again!.leaseToken).not.toBe(before.leaseToken);
      // Результат первой (потерянной) попытки отклоняется: токен не совпадает.
      await expect(
        delivery.applyResult(taskId, before.leaseToken!, { kind: 'delivered' }),
      ).resolves.toBe(false);
      // Текущий токен принимается.
      await expect(
        delivery.applyResult(taskId, again!.leaseToken, { kind: 'delivered' }),
      ).resolves.toBe(true);
      const done = await prisma.deliveryTask.findUniqueOrThrow({
        where: { id: taskId },
      });
      expect(done.status).toBe('DELIVERED');
    });

    it('просроченная аренда неидемпотентного исполнителя: NEEDS_ATTENTION без автоповтора; поздний delivered по токену принимается, чужой — нет', async () => {
      const [item] = await prisma.orderItem.findMany({
        where: { order: { orderNumber: orderNo } },
      });
      const task = await prisma.deliveryTask.create({
        data: {
          orderItemId: item.id,
          step: 7,
          executor: 'command',
          status: 'IN_PROGRESS',
          attempts: 1,
          leaseToken: 'token-last-attempt',
          leaseUntil: new Date(Date.now() - 1000),
        },
      });
      await delivery.recoverExpiredLeases();
      const stuck = await prisma.deliveryTask.findUniqueOrThrow({
        where: { id: task.id },
      });
      expect(stuck.status).toBe('NEEDS_ATTENTION');
      // command выключен настройкой: воркер его не берёт, автоповтора нет.
      await expect(delivery.claimNext()).resolves.toBeNull();
      await expect(
        delivery.applyResult(task.id, 'чужой-токен', { kind: 'delivered' }),
      ).resolves.toBe(false);
      await expect(
        delivery.applyResult(task.id, 'token-last-attempt', {
          kind: 'retry',
          reason: 'late',
        }),
      ).resolves.toBe(false);
      await expect(
        delivery.applyResult(task.id, 'token-last-attempt', {
          kind: 'delivered',
        }),
      ).resolves.toBe(true);
      expect(
        (
          await prisma.deliveryTask.findUniqueOrThrow({
            where: { id: task.id },
          })
        ).status,
      ).toBe('DELIVERED');
    });

    it('шаг N+1 не стартует, пока шаг N не выдан', async () => {
      const [item] = await prisma.orderItem.findMany({
        where: { order: { orderNumber: orderNo } },
      });
      await prisma.deliveryTask.deleteMany({
        where: { orderItemId: item.id },
      });
      const first = await prisma.deliveryTask.create({
        data: {
          orderItemId: item.id,
          step: 1,
          executor: 'site',
          status: 'NEEDS_ATTENTION',
        },
      });
      const second = await prisma.deliveryTask.create({
        data: { orderItemId: item.id, step: 2, executor: 'site' },
      });
      await expect(delivery.claimNext()).resolves.toBeNull();
      await prisma.deliveryTask.update({
        where: { id: first.id },
        data: { status: 'MANUAL_DONE' },
      });
      await expect(delivery.claimNext()).resolves.toMatchObject({
        id: second.id,
      });
    });
  });

  // ------------------------------------------------------- админ-API

  describe('админ-API: права, 2FA, ручная отметка, повтор, аудит', () => {
    let orderNo: string;
    let manualTaskId: string;
    let siteTaskId: string;

    beforeAll(async () => {
      await setFlag('false');
      orderNo = await makeOrder(alice, [
        { productId: gameProductId },
        { productId: decoProductId },
      ]);
      await payment(orderNo);
      const tasks = await tasksOf(orderNo);
      manualTaskId = tasks.find((t) => t.executor === 'manual')!.id;
      siteTaskId = tasks.find((t) => t.executor === 'site')!.id;
    });

    it('без токена — 401; обычный пользователь — 403', async () => {
      await http().get('/admin/delivery/tasks').expect(401);
      await http()
        .get('/admin/delivery/tasks')
        .set('Authorization', auth(alice))
        .expect(403);
    });

    it('персонал без 2FA — 403 admin_2fa_required (список и действия)', async () => {
      const list = await http()
        .get('/admin/delivery/tasks')
        .set('Authorization', auth(noTwoFactor))
        .expect(403);
      expect(JSON.stringify(list.body)).toContain('admin_2fa_required');
      const act = await http()
        .post(`/admin/delivery/tasks/${manualTaskId}/manual-done`)
        .set('Authorization', auth(noTwoFactor))
        .send({ reason: 'выдал' })
        .expect(403);
      expect(JSON.stringify(act.body)).toContain('admin_2fa_required');
      expect(
        (
          await prisma.deliveryTask.findUniqueOrThrow({
            where: { id: manualTaskId },
          })
        ).status,
      ).toBe('AWAITING_MANUAL');
    });

    it('только store.delivery.view: список и карточка — да, действия — 403', async () => {
      await http()
        .get('/admin/delivery/tasks')
        .set('Authorization', auth(viewer))
        .expect(200);
      await http()
        .get(`/admin/delivery/tasks/${manualTaskId}`)
        .set('Authorization', auth(viewer))
        .expect(200);
      await http()
        .post(`/admin/delivery/tasks/${manualTaskId}/manual-done`)
        .set('Authorization', auth(viewer))
        .send({ reason: 'выдал' })
        .expect(403);
      await http()
        .post(`/admin/delivery/tasks/${siteTaskId}/retry`)
        .set('Authorization', auth(viewer))
        .send({ confirmed: true })
        .expect(403);
    });

    it('список: фильтры по статусу, исполнителю, номеру заказа и нику; без секретов аренды', async () => {
      const res = await http()
        .get(
          `/admin/delivery/tasks?orderNumber=${orderNo}&status=AWAITING_MANUAL&executor=manual`,
        )
        .set('Authorization', auth(admin))
        .expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0]).toMatchObject({
        id: manualTaskId,
        executor: 'manual',
        status: 'AWAITING_MANUAL',
        orderItem: { order: { orderNumber: orderNo } },
      });
      expect(JSON.stringify(res.body)).not.toContain('leaseToken');
      const byNick = await http()
        .get(`/admin/delivery/tasks?nick=${aliceNick.toLowerCase()}`)
        .set('Authorization', auth(admin))
        .expect(200);
      expect(byNick.body.total).toBeGreaterThanOrEqual(2);
      await http()
        .get('/admin/delivery/tasks?status=NOPE')
        .set('Authorization', auth(admin))
        .expect(400);
      await http()
        .get('/admin/delivery/tasks?limit=1000')
        .set('Authorization', auth(admin))
        .expect(400);
    });

    it('карточка: состав без платёжных полей; несуществующий id — 404', async () => {
      const res = await http()
        .get(`/admin/delivery/tasks/${siteTaskId}`)
        .set('Authorization', auth(admin))
        .expect(200);
      expect(res.body).toMatchObject({ id: siteTaskId, executor: 'site' });
      const text = JSON.stringify(res.body);
      for (const forbidden of [
        'leaseToken',
        'paymentId',
        'paymentProvider',
        'gameCommands',
        'SENTINEL_MUST_NEVER_BE_USED',
      ]) {
        expect(text).not.toContain(forbidden);
      }
      await http()
        .get('/admin/delivery/tasks/nonexistent')
        .set('Authorization', auth(admin))
        .expect(404);
    });

    it('ручная отметка: причина обязательна (400)', async () => {
      await http()
        .post(`/admin/delivery/tasks/${manualTaskId}/manual-done`)
        .set('Authorization', auth(admin))
        .send({})
        .expect(400);
      await http()
        .post(`/admin/delivery/tasks/${manualTaskId}/manual-done`)
        .set('Authorization', auth(admin))
        .send({ reason: '   ' })
        .expect(400);
    });

    it('ручная отметка: MANUAL_DONE, позиция выдана, аудит с причиной; повтор — 409', async () => {
      const res = await http()
        .post(`/admin/delivery/tasks/${manualTaskId}/manual-done`)
        .set('Authorization', auth(admin))
        .send({ reason: 'выдал привилегию в игре' })
        .expect(200);
      expect(res.body).toMatchObject({
        id: manualTaskId,
        status: 'MANUAL_DONE',
      });
      const task = await prisma.deliveryTask.findUniqueOrThrow({
        where: { id: manualTaskId },
        include: { orderItem: true },
      });
      expect(task.orderItem.isDelivered).toBe(true);
      expect(task.leaseToken).toBeNull();
      const audit = await prisma.auditLog.findMany({
        where: { action: 'delivery.task.manual_done', targetId: manualTaskId },
      });
      expect(audit).toHaveLength(1);
      expect(audit[0].actorId).toBe(admin.id);
      expect(audit[0].changes).toMatchObject({
        reason: 'выдал привилегию в игре',
        from: 'AWAITING_MANUAL',
        to: 'MANUAL_DONE',
      });
      await http()
        .post(`/admin/delivery/tasks/${manualTaskId}/manual-done`)
        .set('Authorization', auth(admin))
        .send({ reason: 'ещё раз' })
        .expect(409);
    });

    it('статус выдачи у покупателя: часть выдана — pending; без внутренних деталей', async () => {
      const res = await http()
        .get(`/store/orders/${orderNo}`)
        .set('Authorization', auth(alice))
        .expect(200);
      expect(res.body.deliveryStatus).toBe('pending');
      expect(
        res.body.items
          .map((i: { deliveryStatus: string }) => i.deliveryStatus)
          .sort(),
      ).toEqual(['delivered', 'pending']);
      const text = JSON.stringify(res.body);
      for (const internal of [
        'deliveryTasks',
        'executor',
        'attempts',
        'lastError',
        'leaseToken',
        'renderedCommand',
        'AWAITING_MANUAL',
        'MANUAL_DONE',
      ]) {
        expect(text).not.toContain(internal);
      }
    });

    it('повтор: нужно подтверждение (400); из неподходящего статуса — 409', async () => {
      await http()
        .post(`/admin/delivery/tasks/${siteTaskId}/retry`)
        .set('Authorization', auth(admin))
        .send({ confirmed: false })
        .expect(400);
      await http()
        .post(`/admin/delivery/tasks/${siteTaskId}/retry`)
        .set('Authorization', auth(admin))
        .send({})
        .expect(400);
      // Задание PENDING повторять нельзя.
      await http()
        .post(`/admin/delivery/tasks/${siteTaskId}/retry`)
        .set('Authorization', auth(admin))
        .send({ confirmed: true })
        .expect(409);
    });

    it('повтор из FAILED и NEEDS_ATTENTION с подтверждением: возврат в очередь, аудит warning с confirmed', async () => {
      await prisma.deliveryTask.update({
        where: { id: siteTaskId },
        data: { status: 'FAILED', lastError: 'boom', attempts: 3 },
      });
      const res = await http()
        .post(`/admin/delivery/tasks/${siteTaskId}/retry`)
        .set('Authorization', auth(admin))
        .send({ confirmed: true, reason: 'починили украшение' })
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'PENDING',
        lastError: null,
        attempts: 3,
      });
      const audit = await prisma.auditLog.findMany({
        where: { action: 'delivery.task.retried', targetId: siteTaskId },
      });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        actorId: admin.id,
        severity: 'warning',
      });
      expect(audit[0].changes).toMatchObject({
        confirmed: true,
        from: 'FAILED',
        to: 'PENDING',
        reason: 'починили украшение',
      });
      await prisma.deliveryTask.update({
        where: { id: siteTaskId },
        data: { status: 'NEEDS_ATTENTION' },
      });
      await http()
        .post(`/admin/delivery/tasks/${siteTaskId}/retry`)
        .set('Authorization', auth(admin))
        .send({ confirmed: true })
        .expect(200);
    });

    it('после выдачи всех позиций заказ у покупателя — delivered', async () => {
      await setFlag('true');
      await delivery.processBatch();
      const res = await http()
        .get(`/store/orders/${orderNo}`)
        .set('Authorization', auth(alice))
        .expect(200);
      expect(res.body.deliveryStatus).toBe('delivered');
      const list = await http()
        .get('/store/orders')
        .set('Authorization', auth(alice))
        .expect(200);
      const mine = list.body.items.find(
        (o: { orderNumber: string }) => o.orderNumber === orderNo,
      );
      expect(mine.deliveryStatus).toBe('delivered');
    });
  });

  // ------------------------------------------------- возврат и отзыв

  describe('возврат: проверка и отзыв сайтовой выдачи (вызов из 0.9)', () => {
    it('проверка возврата запрещает при выданном задании (409 refund_after_delivery) и разрешает до выдачи', async () => {
      await setFlag('false');
      const no = await makeOrder(alice, [{ productId: gameProductId }]);
      await payment(no);
      const order = await prisma.order.findUniqueOrThrow({
        where: { orderNumber: no },
      });
      // До выдачи (AWAITING_MANUAL): можно.
      await expect(
        prisma.$transaction((tx) => delivery.assertRefundAllowed(tx, order.id)),
      ).resolves.toBeUndefined();
      const [task] = await tasksOf(no);
      for (const [status, code] of [
        ['IN_PROGRESS', 'delivery_in_progress'],
        ['NEEDS_ATTENTION', 'delivery_in_progress'],
        ['DELIVERED', 'refund_after_delivery'],
        ['MANUAL_DONE', 'refund_after_delivery'],
      ] as const) {
        await prisma.deliveryTask.update({
          where: { id: task.id },
          data: { status },
        });
        await expect(
          prisma.$transaction((tx) =>
            delivery.assertRefundAllowed(tx, order.id),
          ),
        ).rejects.toMatchObject({
          response: expect.objectContaining({ code }),
        });
      }
      await prisma.deliveryTask.update({
        where: { id: task.id },
        data: { status: 'FAILED' },
      });
      await expect(
        prisma.$transaction((tx) => delivery.assertRefundAllowed(tx, order.id)),
      ).resolves.toBeUndefined();
    });

    it('отзыв сайтовой выдачи: украшение удалено, выбор снят, задание CANCELLED, isDelivered сброшен; админская выдача цела', async () => {
      const carol = await createUser('carol');
      try {
        const no = await makeOrder(
          carol,
          [{ productId: decoProductId }],
          aliceNick,
        );
        await setFlag('false');
        await payment(no);
        await setFlag('true');
        await delivery.processBatch();
        await prisma.user.update({
          where: { id: carol.id },
          data: { selectedDecorationId: decorationId },
        });
        const order = await prisma.order.findUniqueOrThrow({
          where: { orderNumber: no },
        });
        // Украшение от админа у другого пользователя (bob) не затрагивается.
        const adminGrantBefore = await prisma.userDecoration.count({
          where: { userId: bob.id, decorationId },
        });

        const res = await prisma.$transaction((tx) =>
          delivery.revokeSiteGrants(tx, order.id, admin.id),
        );
        expect(res).toEqual({ revokedDecorations: 1, cancelledTasks: 1 });
        expect(
          await prisma.userDecoration.count({
            where: { userId: carol.id, decorationId },
          }),
        ).toBe(0);
        expect(
          (await prisma.user.findUniqueOrThrow({ where: { id: carol.id } }))
            .selectedDecorationId,
        ).toBeNull();
        const [task] = await tasksOf(no);
        expect(task.status).toBe('CANCELLED');
        const [item] = await prisma.orderItem.findMany({
          where: { orderId: order.id },
        });
        expect(item.isDelivered).toBe(false);
        expect(
          await prisma.userDecoration.count({
            where: { userId: bob.id, decorationId },
          }),
        ).toBe(adminGrantBefore);
        expect(
          await prisma.auditLog.count({
            where: { action: 'delivery.site.revoked', targetId: order.id },
          }),
        ).toBe(1);
        // Отозванное задание воркер повторно не выдаёт.
        await expect(delivery.processBatch()).resolves.toBe(0);
      } finally {
        await prisma.order.deleteMany({
          where: { userId: carol.id },
        });
        await prisma.refreshToken.deleteMany({ where: { userId: carol.id } });
        await prisma.auditLog.deleteMany({ where: { actorId: carol.id } });
        await prisma.user.deleteMany({ where: { id: carol.id } });
      }
    });
  });

  describe('возврат заказа через OrdersService.refund (M1, Р4/Р5)', () => {
    it('выданное задание: 409 refund_after_delivery, статус заказа не меняется', async () => {
      await setFlag('false');
      const no = await makeOrder(alice, [{ productId: gameProductId }]);
      await payment(no);
      const [task] = await tasksOf(no);
      await prisma.deliveryTask.update({
        where: { id: task.id },
        data: { status: 'DELIVERED' },
      });
      const order = await prisma.order.findUniqueOrThrow({
        where: { orderNumber: no },
      });
      await expect(
        orders.refund(order.id, { reason: 'тест' }, admin.id),
      ).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({ code: 'refund_after_delivery' }),
      });
      const after = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(after.status).toBe('COMPLETED');
      expect((await tasksOf(no))[0].status).toBe('DELIVERED');
    });

    it('невыданное: задания CANCELLED, сайтовая выдача отозвана, заказ REFUNDED', async () => {
      const dave = await createUser('dave');
      try {
        await setFlag('false');
        const no = await makeOrder(
          dave,
          [{ productId: decoProductId }],
          aliceNick,
        );
        await payment(no);
        const order = await prisma.order.findUniqueOrThrow({
          where: { orderNumber: no },
        });
        expect(order.status).toBe('COMPLETED');
        await prisma.userDecoration.create({
          data: {
            userId: dave.id,
            decorationId,
            source: 'PURCHASE',
            orderId: order.id,
          },
        });
        await prisma.user.update({
          where: { id: dave.id },
          data: { selectedDecorationId: decorationId },
        });

        const refunded = await orders.refund(
          order.id,
          { reason: 'тест' },
          admin.id,
        );
        expect(refunded.status).toBe('REFUNDED');
        const tasks = await tasksOf(no);
        expect(tasks.length).toBeGreaterThan(0);
        expect(tasks.every((t) => t.status === 'CANCELLED')).toBe(true);
        expect(
          await prisma.userDecoration.count({
            where: { userId: dave.id, orderId: order.id },
          }),
        ).toBe(0);
        expect(
          (await prisma.user.findUniqueOrThrow({ where: { id: dave.id } }))
            .selectedDecorationId,
        ).toBeNull();
      } finally {
        await prisma.order.deleteMany({ where: { userId: dave.id } });
        await prisma.refreshToken.deleteMany({ where: { userId: dave.id } });
        await prisma.auditLog.deleteMany({ where: { actorId: dave.id } });
        await prisma.user.deleteMany({ where: { id: dave.id } });
      }
    });
  });
});
