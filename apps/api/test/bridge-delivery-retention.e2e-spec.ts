import { INestApplication, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { AppModule } from './../src/app.module';
import { APP_CREATE_OPTIONS, configureApp } from './../src/configure-app';
import {
  BRIDGE_CONFIG,
  readBridgeConfig,
} from '../src/modules/bridge/bridge.config';
import { BridgeDeliveryRetentionScheduler } from '../src/modules/bridge/bridge-delivery-retention.scheduler';
import { readBridgeDeliveryRetention } from '../src/modules/bridge/bridge-delivery-retention';
import { PrismaService } from '../src/modules/prisma/prisma.service';

jest.setTimeout(60_000);

/// Очистка `bridge_delivery_jobs` (0.13 срез 2, ревью M-1, ADR-0194): реальный
/// планировщик и PostgreSQL. Строки создаются с явным `updatedAt` (старше срока
/// хранения или свежим), затем вызывается `runOnce(now)`. Проверяется: UNKNOWN
/// при NEEDS_ATTENTION остаётся; DONE/FAILED/CANCELLED и UNKNOWN без ручной
/// проверки старше срока удаляются; QUEUED и CLAIMED остаются, в том числе
/// старые; свежие закрытые остаются.
///
/// Только для ОДНОРАЗОВОЙ БД с применёнными миграциями и локального Redis.
/// Очистка строго по созданным id/slug: заказ (каскадом позиции, задания и
/// очередь), сервер. Ники <= 16 символов.
const DAY_MS = 24 * 60 * 60 * 1000;

describe('Bridge delivery: очистка заданий (0.13 срез 2, e2e)', () => {
  let app: INestApplication | undefined;
  let prisma: PrismaService;
  let scheduler: BridgeDeliveryRetentionScheduler;
  const unique = randomUUID().replace(/-/g, '').slice(0, 6);
  const slug = `e2e-${unique}-r`;
  const orderNumber = `BRR-${unique}`;
  const nick = `r${unique}`;
  const retentionDays = readBridgeDeliveryRetention({
    get: (k: string) => process.env[k] as never,
  }).retentionDays;
  const spies: jest.SpyInstance[] = [];
  let orderId: string;
  let seq = 0;

  /// Позиция + задание выдачи + строка очереди с заданным updatedAt.
  async function make(
    jobStatus:
      'QUEUED' | 'CLAIMED' | 'DONE' | 'FAILED' | 'CANCELLED' | 'UNKNOWN',
    taskStatus: 'IN_PROGRESS' | 'NEEDS_ATTENTION' | 'DELIVERED' | 'FAILED',
    updatedAt: Date,
  ): Promise<string> {
    seq += 1;
    const item = await prisma.orderItem.create({
      data: { orderId, quantity: 1, unitPrice: 1, totalPrice: 1 },
    });
    const task = await prisma.deliveryTask.create({
      data: {
        orderItemId: item.id,
        executor: 'bridge',
        status: taskStatus,
        attempts: 1,
        nick,
        renderedCommand: 'lp user Steve parent addtemp vip 30d',
      },
    });
    const job = await prisma.bridgeDeliveryJob.create({
      data: {
        idempotencyKey: `${unique}:${seq}`,
        taskId: task.id,
        attempt: 1,
        serverSlug: slug,
        command: 'lp user Steve parent addtemp vip 30d',
        status: jobStatus,
        claimToken: jobStatus === 'CLAIMED' ? randomUUID() : null,
        expiresAt: new Date(updatedAt.getTime() + 10 * 60_000),
        updatedAt,
      },
    });
    return job.id;
  }

  const exists = async (id: string) =>
    (await prisma.bridgeDeliveryJob.findUnique({ where: { id } })) !== null;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    const dbName = url.split('?')[0].split('/').pop() ?? '';
    // Защита M-1: набор удаляет строки, поэтому только на одноразовой БД.
    // Разрешено, если имя содержит test/e2e/scratch ИЛИ CI === 'true'.
    // Это безопасно: GitHub Actions выставляет CI=true и поднимает одноразовый
    // service-контейнер Postgres (БД называется `twomc`), а раннер VDS передаёт
    // -e CI=true в контейнер с одноразовой БД. На машине разработчика CI не
    // задан, поэтому общая dev-БД и production остаются защищены по имени.
    const isCi = process.env.CI === 'true';
    if (!isCi && !/test|e2e|scratch/i.test(dbName)) {
      throw new Error(
        `Имя БД "${dbName}" не похоже на одноразовую (нужно test, e2e или scratch, либо CI=true): набор остановлен.`,
      );
    }
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
    scheduler = app.get(BridgeDeliveryRetentionScheduler);
    await prisma.bridgeServer.create({
      data: {
        slug,
        displayName: 'E2E retention',
        capabilities: { delivery: true },
      },
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
  });

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.bridgeDeliveryJob.deleteMany({
          where: { serverSlug: slug },
        });
        // Каскадом: позиции, задания.
        await prisma.order.deleteMany({ where: { orderNumber } });
        await prisma.bridgeServer.deleteMany({ where: { slug } });
      }
    } finally {
      spies.forEach((s) => s.mockRestore());
      await app?.close();
    }
  });

  it('удаляет старые закрытые, оставляет UNKNOWN+NEEDS_ATTENTION, QUEUED, CLAIMED и свежие', async () => {
    const now = new Date();
    const old = new Date(now.getTime() - (retentionDays + 1) * DAY_MS);
    const fresh = new Date(now.getTime() - DAY_MS);

    const doneOld = await make('DONE', 'DELIVERED', old);
    const failedOld = await make('FAILED', 'FAILED', old);
    const cancelledOld = await make('CANCELLED', 'FAILED', old);
    const unknownResolved = await make('UNKNOWN', 'DELIVERED', old);
    const unknownAttention = await make('UNKNOWN', 'NEEDS_ATTENTION', old);
    const queuedOld = await make('QUEUED', 'IN_PROGRESS', old);
    const claimedOld = await make('CLAIMED', 'IN_PROGRESS', old);
    const doneFresh = await make('DONE', 'DELIVERED', fresh);

    const res = await scheduler.runOnce(now);
    expect(res.deleted).toBeGreaterThanOrEqual(4);

    expect(await exists(doneOld)).toBe(false);
    expect(await exists(failedOld)).toBe(false);
    expect(await exists(cancelledOld)).toBe(false);
    expect(await exists(unknownResolved)).toBe(false);

    expect(await exists(unknownAttention)).toBe(true);
    expect(await exists(queuedOld)).toBe(true);
    expect(await exists(claimedOld)).toBe(true);
    expect(await exists(doneFresh)).toBe(true);

    // Удаление строки очереди не трогает задание выдачи.
    const task = await prisma.deliveryTask.count({
      where: { orderItem: { orderId } },
    });
    expect(task).toBe(8);
  });

  it('подмена «сейчас»: свежие закрытые удаляются, QUEUED и CLAIMED остаются', async () => {
    const future = new Date(Date.now() + (retentionDays + 2) * DAY_MS);
    const res = await scheduler.runOnce(future);
    expect(res.deleted).toBeGreaterThanOrEqual(1);

    const rows = await prisma.bridgeDeliveryJob.findMany({
      where: { serverSlug: slug },
      select: { status: true, task: { select: { status: true } } },
    });
    const statuses = rows.map((r) => r.status).sort();
    expect(statuses).toEqual(['CLAIMED', 'QUEUED', 'UNKNOWN']);
    const unknown = rows.find((r) => r.status === 'UNKNOWN');
    expect(unknown?.task.status).toBe('NEEDS_ATTENTION');
  });
});
