import { INestApplication, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { APP_CREATE_OPTIONS, configureApp } from './../src/configure-app';
import {
  BRIDGE_CONFIG,
  readBridgeConfig,
} from '../src/modules/bridge/bridge.config';
import { BridgeDeliveryService } from '../src/modules/bridge/bridge-delivery.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';
import { markStaffTwoFactorEnabled } from './helpers/staff-two-factor';
import { signedHeaders } from './support/bridge-support';

jest.setTimeout(60_000);

/// Выдача через Bridge, срез 2 (0.13, ADR-0194, ревью M1): полный цикл на
/// реальной БД и реальном SQL claim. DeliveryTask + BridgeDeliveryJob создаются
/// минимальными записями (заказ без товара), подпись Bridge настоящая,
/// мастер-секрет синтетический.
///
/// Только для ОДНОРАЗОВОЙ БД с применёнными миграциями и локального Redis.
/// Очистка строго по созданным id/slug: заказ (каскадом позиции, задания и
/// очередь), серверы, пользователь, роль. Ники <= 16 символов.
const MASTER_SECRET = 'e2e-bridge-synthetic-master-secret-0123456789-abcdef';
const MASTER = Buffer.from(MASTER_SECRET, 'utf8');
const COMMAND = 'lp user Steve parent addtemp vip 30d';
const CLAIM = '/bridge/v1/delivery/claim';
const ACK = '/bridge/v1/delivery/ack';

describe('Bridge delivery: полный цикл (0.13 срез 2, e2e)', () => {
  let app: INestApplication | undefined;
  let prisma: PrismaService;
  let bridge: BridgeDeliveryService;
  let permissions: PermissionService;
  const unique = randomUUID().replace(/-/g, '').slice(0, 6);
  const slugA = `e2e-${unique}-a`;
  const slugB = `e2e-${unique}-b`;
  const slugPar = `e2e-${unique}-p`;
  const slugGate = `e2e-${unique}-g`;
  const slugs = [slugA, slugB, slugPar, slugGate];
  const orderNumber = `BRG-${unique}`;
  const nick = `u${unique}`;
  const roleSlug = `brg-admin-${unique}`;
  const password = 'Sup3rSecretPassw0rd!';
  let orderId: string;
  let adminId: string | undefined;
  let adminToken: string;
  const prev = {
    enabled: process.env.BRIDGE_ENABLED,
    secret: process.env.BRIDGE_MASTER_SECRET,
    delivery: process.env.BRIDGE_DELIVERY_ENABLED,
  };
  const spies: jest.SpyInstance[] = [];

  function post(slug: string, path: string, payload: unknown) {
    const body = Buffer.from(JSON.stringify(payload), 'utf8');
    const headers = signedHeaders({ slug, body, master: MASTER, path });
    return request(app!.getHttpServer())
      .post(path)
      .set(headers)
      .set('Content-Type', 'application/json')
      .send(body.toString('utf8'));
  }

  const claim = (slug: string, max = 10) => post(slug, CLAIM, { max });
  const ack = (
    slug: string,
    jobId: string,
    claimToken: string,
    status: string,
    code?: string,
  ) =>
    post(slug, ACK, {
      results: [{ jobId, claimToken, status, ...(code ? { code } : {}) }],
    });

  interface Made {
    itemId: string;
    taskId: string;
    jobId: string;
  }

  /// Позиция + задание выдачи (IN_PROGRESS, аренда) + строка очереди Bridge.
  async function makeJob(
    slug: string,
    opts: {
      taskStatus?: 'IN_PROGRESS' | 'MANUAL_DONE' | 'NEEDS_ATTENTION';
      taskAttempts?: number;
      jobAttempt?: number;
    } = {},
  ): Promise<Made> {
    const item = await prisma.orderItem.create({
      data: { orderId, quantity: 1, unitPrice: 1, totalPrice: 1 },
    });
    const task = await prisma.deliveryTask.create({
      data: {
        orderItemId: item.id,
        executor: 'bridge',
        status: opts.taskStatus ?? 'IN_PROGRESS',
        attempts: opts.taskAttempts ?? 1,
        leaseToken: randomUUID(),
        nick,
        renderedCommand: COMMAND,
      },
    });
    const job = await bridge.enqueue({
      idempotencyKey: `${item.id}:1`,
      taskId: task.id,
      attempt: opts.jobAttempt ?? 1,
      serverSlug: slug,
      command: COMMAND,
      ttlMs: 10 * 60_000,
    });
    return { itemId: item.id, taskId: task.id, jobId: job.id };
  }

  const jobRow = (id: string) =>
    prisma.bridgeDeliveryJob.findUniqueOrThrow({ where: { id } });
  const taskRow = (id: string) =>
    prisma.deliveryTask.findUniqueOrThrow({ where: { id } });

  /// Захват своим сервером; возвращает выданное задание с токеном.
  async function claimOne(slug: string, jobId: string) {
    const res = await claim(slug);
    expect(res.status).toBe(200);
    const got = (res.body.jobs as { jobId: string; claimToken: string }[]).find(
      (j) => j.jobId === jobId,
    );
    expect(got).toBeDefined();
    return got!;
  }

  beforeAll(async () => {
    process.env.BRIDGE_ENABLED = 'true';
    process.env.BRIDGE_MASTER_SECRET = MASTER_SECRET;
    process.env.BRIDGE_DELIVERY_ENABLED = 'true';
    for (const m of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
      spies.push(jest.spyOn(Logger.prototype, m).mockImplementation());
    }
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BRIDGE_CONFIG)
      .useValue(
        readBridgeConfig({ get: (k: string) => process.env[k] as never }),
      )
      .compile();
    app = moduleFixture.createNestApplication(APP_CREATE_OPTIONS);
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    bridge = app.get(BridgeDeliveryService);
    permissions = app.get(PermissionService);
    await prisma.bridgeServer.createMany({
      data: slugs.map((slug) => ({
        slug,
        displayName: 'E2E cycle',
        capabilities: { delivery: true },
      })),
    });
    const order = await prisma.order.create({
      data: {
        orderNumber,
        status: 'COMPLETED',
        guestMinecraftNick: nick,
        subtotal: 1,
        total: 1,
      },
    });
    orderId = order.id;

    // Администратор с правами выдачи и 2FA (по образцу store-delivery).
    const email = `brg-${unique}@example.com`;
    const username = `brg${unique}`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ emailOrUsername: email, password })
      .expect(200);
    adminToken = login.body.accessToken;
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    adminId = user.id;
    const role = await prisma.role.create({
      data: {
        name: roleSlug,
        slug: roleSlug,
        displayName: roleSlug,
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
      where: { key: { in: ['store.delivery.view', 'store.delivery.manage'] } },
    });
    await prisma.rolePermission.createMany({
      data: records.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
    await permissions.invalidateRole(role.id);
    await permissions.invalidateUser(user.id);
  }, 60_000);

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.bridgeDeliveryJob.deleteMany({
          where: { serverSlug: { in: slugs } },
        });
        // Каскадом: позиции, задания.
        await prisma.order.deleteMany({ where: { orderNumber } });
        await prisma.bridgeServer.deleteMany({
          where: { slug: { in: slugs } },
        });
        await prisma.userRole.deleteMany({
          where: { role: { slug: roleSlug } },
        });
        await prisma.rolePermission.deleteMany({
          where: { role: { slug: roleSlug } },
        });
        await prisma.role.deleteMany({ where: { slug: roleSlug } });
        if (adminId) {
          await prisma.refreshToken.deleteMany({ where: { userId: adminId } });
          await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
          await prisma.user.deleteMany({ where: { id: adminId } });
        }
      }
    } finally {
      spies.forEach((s) => s.mockRestore());
      restore('BRIDGE_ENABLED', prev.enabled);
      restore('BRIDGE_MASTER_SECRET', prev.secret);
      restore('BRIDGE_DELIVERY_ENABLED', prev.delivery);
      await app?.close();
    }
  });

  it('цикл: claim своим -> ack чужим (unknown_job) -> ack своим (accepted, DELIVERED) -> повтор (duplicate)', async () => {
    const m = await makeJob(slugA);
    // Чужой сервер задание не видит.
    const foreign = await claim(slugB);
    expect(foreign.body.jobs).toEqual([]);

    const got = await claimOne(slugA, m.jobId);
    expect((await jobRow(m.jobId)).status).toBe('CLAIMED');
    // Задание отдаётся ровно один раз.
    const again = await claim(slugA);
    expect(
      (again.body.jobs as { jobId: string }[]).some((j) => j.jobId === m.jobId),
    ).toBe(false);

    // Чужой сервер с верным токеном: неотличимо от несуществующего.
    const stolen = await ack(slugB, m.jobId, got.claimToken, 'done');
    expect(stolen.status).toBe(200);
    expect(stolen.body.results).toEqual([
      { jobId: m.jobId, status: 'rejected', code: 'unknown_job' },
    ]);
    expect((await jobRow(m.jobId)).status).toBe('CLAIMED');
    expect((await taskRow(m.taskId)).status).toBe('IN_PROGRESS');

    // Неверный токен своего сервера.
    const wrong = await ack(slugA, m.jobId, randomUUID(), 'done');
    expect(wrong.body.results[0]).toEqual({
      jobId: m.jobId,
      status: 'rejected',
      code: 'token_mismatch',
    });

    const okRes = await ack(slugA, m.jobId, got.claimToken, 'done');
    expect(okRes.body.results).toEqual([
      { jobId: m.jobId, status: 'accepted' },
    ]);
    expect((await jobRow(m.jobId)).status).toBe('DONE');
    const task = await taskRow(m.taskId);
    expect(task.status).toBe('DELIVERED');
    expect(task.deliveredAt).not.toBeNull();
    const item = await prisma.orderItem.findUniqueOrThrow({
      where: { id: m.itemId },
    });
    expect(item.isDelivered).toBe(true);

    const dup = await ack(slugA, m.jobId, got.claimToken, 'done');
    expect(dup.body.results).toEqual([{ jobId: m.jobId, status: 'duplicate' }]);
    // Иной исход по закрытому заданию: conflict, задание не меняется.
    const conflict = await ack(slugA, m.jobId, got.claimToken, 'failed', 'x');
    expect(conflict.body.results[0].code).toBe('conflict');
    expect((await taskRow(m.taskId)).status).toBe('DELIVERED');
  });

  it('токен в верхнем регистре принимается (L5)', async () => {
    const m = await makeJob(slugA);
    const got = await claimOne(slugA, m.jobId);
    const res = await ack(slugA, m.jobId, got.claimToken.toUpperCase(), 'done');
    expect(res.body.results).toEqual([{ jobId: m.jobId, status: 'accepted' }]);
    expect((await taskRow(m.taskId)).status).toBe('DELIVERED');
  });

  it('failed -> задание FAILED с причиной bridge_<code>', async () => {
    const m = await makeJob(slugA);
    const got = await claimOne(slugA, m.jobId);
    const res = await ack(
      slugA,
      m.jobId,
      got.claimToken,
      'failed',
      'no_player',
    );
    expect(res.body.results[0].status).toBe('accepted');
    expect((await jobRow(m.jobId)).status).toBe('FAILED');
    const task = await taskRow(m.taskId);
    expect(task.status).toBe('FAILED');
    expect(task.lastError).toBe('bridge_no_player');
  });

  it('retry -> строка CANCELLED, задание RETRY_WAIT (команда не выполнялась)', async () => {
    const m = await makeJob(slugA);
    const got = await claimOne(slugA, m.jobId);
    const res = await ack(slugA, m.jobId, got.claimToken, 'retry', 'busy');
    expect(res.body.results[0].status).toBe('accepted');
    expect((await jobRow(m.jobId)).status).toBe('CANCELLED');
    const task = await taskRow(m.taskId);
    expect(task.status).toBe('RETRY_WAIT');
    expect(task.nextAttemptAt).not.toBeNull();
  });

  it('unknown -> строка UNKNOWN, задание NEEDS_ATTENTION, без автоповтора', async () => {
    const m = await makeJob(slugA);
    const got = await claimOne(slugA, m.jobId);
    const res = await ack(slugA, m.jobId, got.claimToken, 'unknown', 'restart');
    expect(res.body.results[0].status).toBe('accepted');
    expect((await jobRow(m.jobId)).status).toBe('UNKNOWN');
    expect((await taskRow(m.taskId)).status).toBe('NEEDS_ATTENTION');
    // Закрытую строку повторный claim не выдаёт.
    const again = await claim(slugA);
    expect(
      (again.body.jobs as { jobId: string }[]).some((j) => j.jobId === m.jobId),
    ).toBe(false);
  });

  it('поздний ack: задание уже NEEDS_ATTENTION по тайм-ауту, done переносится в DELIVERED', async () => {
    const m = await makeJob(slugA);
    const got = await claimOne(slugA, m.jobId);
    // Исполнитель не дождался ack: задание ушло в NEEDS_ATTENTION.
    await prisma.deliveryTask.update({
      where: { id: m.taskId },
      data: { status: 'NEEDS_ATTENTION', leaseUntil: null },
    });
    const res = await ack(slugA, m.jobId, got.claimToken, 'done');
    expect(res.body.results[0].status).toBe('accepted');
    expect((await taskRow(m.taskId)).status).toBe('DELIVERED');
  });

  it('claim пуст, пока попытка задания не совпадает или задание не IN_PROGRESS', async () => {
    const mismatch = await makeJob(slugGate, {
      taskAttempts: 2,
      jobAttempt: 1,
    });
    const closed = await makeJob(slugGate, { taskStatus: 'MANUAL_DONE' });
    const empty = await claim(slugGate);
    expect(empty.body.jobs).toEqual([]);
    expect((await jobRow(mismatch.jobId)).status).toBe('QUEUED');
    expect((await jobRow(closed.jobId)).status).toBe('QUEUED');

    // Попытки сошлись: задание выдаётся; закрытое вручную - по-прежнему нет.
    await prisma.deliveryTask.update({
      where: { id: mismatch.taskId },
      data: { attempts: 1 },
    });
    const res = await claim(slugGate);
    const ids = (res.body.jobs as { jobId: string }[]).map((j) => j.jobId);
    expect(ids).toEqual([mismatch.jobId]);
  });

  it('два параллельных claim не выдают одно задание дважды', async () => {
    const made: Made[] = [];
    for (let i = 0; i < 6; i++) made.push(await makeJob(slugPar));
    const [r1, r2] = await Promise.all([claim(slugPar, 4), claim(slugPar, 4)]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const a = (r1.body.jobs as { jobId: string }[]).map((j) => j.jobId);
    const b = (r2.body.jobs as { jobId: string }[]).map((j) => j.jobId);
    expect(a.filter((id) => b.includes(id))).toEqual([]);
    // Каждое задание захвачено не более одного раза.
    const rows = await prisma.bridgeDeliveryJob.findMany({
      where: { id: { in: made.map((x) => x.jobId) } },
    });
    expect(rows.filter((r) => r.status === 'CLAIMED').length).toBe(
      a.length + b.length,
    );
    expect(rows.every((r) => r.claimCount <= 1)).toBe(true);
    // Остаток добирает следующий опрос, без повторов выданного.
    const rest = await claim(slugPar, 10);
    const c = (rest.body.jobs as { jobId: string }[]).map((j) => j.jobId);
    expect([...a, ...b, ...c].sort()).toEqual(made.map((x) => x.jobId).sort());
  });

  describe('админка: UNKNOWN, повтор и ручная отметка', () => {
    const http = () => request(app!.getHttpServer());
    const bearer = () => `Bearer ${adminToken}`;

    async function makeUnknown() {
      const m = await makeJob(slugA);
      const got = await claimOne(slugA, m.jobId);
      await ack(slugA, m.jobId, got.claimToken, 'unknown', 'restart');
      return m;
    }

    it('список и карточка показывают состояние Bridge без токена', async () => {
      const m = await makeUnknown();
      const list = await http()
        .get('/admin/delivery/tasks')
        .query({ status: 'NEEDS_ATTENTION', orderNumber, executor: 'bridge' })
        .set('Authorization', bearer())
        .expect(200);
      const row = (list.body.items as { id: string; bridgeJob: object }[]).find(
        (t) => t.id === m.taskId,
      );
      expect(row?.bridgeJob).toMatchObject({
        status: 'UNKNOWN',
        serverSlug: slugA,
        ackCode: 'restart',
        claimCount: 1,
      });
      expect(JSON.stringify(list.body)).not.toContain('claimToken');
      const card = await http()
        .get(`/admin/delivery/tasks/${m.taskId}`)
        .set('Authorization', bearer())
        .expect(200);
      expect(card.body.bridgeJob.status).toBe('UNKNOWN');
      expect(JSON.stringify(card.body)).not.toContain('claimToken');
    });

    it('повтор: без подтверждения 400; с подтверждением PENDING, аудит с состоянием Bridge, тот же ключ', async () => {
      const m = await makeUnknown();
      await http()
        .post(`/admin/delivery/tasks/${m.taskId}/retry`)
        .set('Authorization', bearer())
        .send({ confirmed: false })
        .expect(400);
      expect((await taskRow(m.taskId)).status).toBe('NEEDS_ATTENTION');
      await http()
        .post(`/admin/delivery/tasks/${m.taskId}/retry`)
        .set('Authorization', bearer())
        .send({
          confirmed: true,
          serverChecked: true,
          reason: 'проверил игрока',
        })
        .expect(200);
      expect((await taskRow(m.taskId)).status).toBe('PENDING');
      const audit = await prisma.auditLog.findFirst({
        where: {
          actorId: adminId,
          action: 'delivery.task.retried',
          targetId: m.taskId,
        },
      });
      expect(audit?.changes).toMatchObject({
        bridgeJobStatus: 'UNKNOWN',
        bridgeClaimCount: 1,
        bridgeIdempotencyKey: `${m.itemId}:1`,
        serverChecked: true,
        unsettledRetry: true,
        confirmed: true,
      });
      // Повторная постановка переиспользует строку и ключ идемпотентности.
      await prisma.deliveryTask.update({
        where: { id: m.taskId },
        data: { status: 'IN_PROGRESS', attempts: 2 },
      });
      const requeued = await bridge.enqueue({
        idempotencyKey: `${m.itemId}:1`,
        taskId: m.taskId,
        attempt: 2,
        serverSlug: slugA,
        command: COMMAND,
        ttlMs: 60_000,
      });
      expect(requeued.id).toBe(m.jobId);
      expect(requeued.status).toBe('QUEUED');
      const got = await claimOne(slugA, m.jobId);
      const res = await ack(slugA, m.jobId, got.claimToken, 'done');
      expect(res.body.results[0].status).toBe('accepted');
      expect((await taskRow(m.taskId)).status).toBe('DELIVERED');
    });

    it('повтор UNKNOWN без serverChecked или без причины отклонён, аудита нет (R167)', async () => {
      const m = await makeUnknown();
      const url = `/admin/delivery/tasks/${m.taskId}/retry`;
      const r1 = await http()
        .post(url)
        .set('Authorization', bearer())
        .send({ confirmed: true, reason: 'без проверки' })
        .expect(400);
      expect(r1.body.code ?? r1.body.message?.code).toBe(
        'delivery_retry_server_check_required',
      );
      const r2 = await http()
        .post(url)
        .set('Authorization', bearer())
        .send({ confirmed: true, serverChecked: true })
        .expect(400);
      expect(r2.body.code ?? r2.body.message?.code).toBe(
        'delivery_retry_reason_required',
      );
      expect((await taskRow(m.taskId)).status).toBe('NEEDS_ATTENTION');
      expect(
        await prisma.auditLog.count({
          where: { action: 'delivery.task.retried', targetId: m.taskId },
        }),
      ).toBe(0);
    });

    it('двойной ack: второй — duplicate, задание не меняется повторно (R167)', async () => {
      const m = await makeJob(slugA);
      const got = await claimOne(slugA, m.jobId);
      const first = await ack(slugA, m.jobId, got.claimToken, 'done');
      expect(first.body.results[0].status).toBe('accepted');
      const delivered = await taskRow(m.taskId);
      expect(delivered.status).toBe('DELIVERED');
      const second = await ack(slugA, m.jobId, got.claimToken, 'done');
      expect(second.body.results[0].status).toBe('duplicate');
      const conflict = await ack(slugA, m.jobId, got.claimToken, 'failed', 'x');
      expect(conflict.body.results[0].status).toBe('rejected');
      const after = await taskRow(m.taskId);
      expect(after.status).toBe('DELIVERED');
      expect(after.deliveredAt?.getTime()).toBe(
        delivered.deliveredAt?.getTime(),
      );
      expect((await jobRow(m.jobId)).status).toBe('DONE');
    });

    it('«выдано вручную»: MANUAL_DONE, поздний ack плагина задание не меняет', async () => {
      const m = await makeJob(slugA);
      const got = await claimOne(slugA, m.jobId);
      await prisma.deliveryTask.update({
        where: { id: m.taskId },
        data: { status: 'NEEDS_ATTENTION', leaseUntil: null },
      });
      await http()
        .post(`/admin/delivery/tasks/${m.taskId}/manual-done`)
        .set('Authorization', bearer())
        .send({ reason: 'выдал вручную' })
        .expect(200);
      expect((await taskRow(m.taskId)).status).toBe('MANUAL_DONE');
      const audit = await prisma.auditLog.findFirst({
        where: {
          actorId: adminId,
          action: 'delivery.task.manual_done',
          targetId: m.taskId,
        },
      });
      expect(audit?.changes).toMatchObject({ bridgeJobStatus: 'CLAIMED' });
      // Плагин всё же подтвердил: строка закрывается, задание остаётся MANUAL_DONE.
      const res = await ack(slugA, m.jobId, got.claimToken, 'done');
      expect(res.body.results[0].status).toBe('accepted');
      expect((await taskRow(m.taskId)).status).toBe('MANUAL_DONE');
    });

    it('без токена админа - 401', async () => {
      await http().get('/admin/delivery/tasks').expect(401);
    });
  });
});

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
