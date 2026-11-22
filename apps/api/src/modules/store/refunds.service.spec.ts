import { ConflictException } from '@nestjs/common';
import { OrderRefundStatus, OrderStatus, Prisma } from '@prisma/client';
import { PERMISSIONS_KEY } from '../roles/decorators/require-permissions.decorator';
import { InMemoryPaymentLedger } from './payment/payment-ledger';
import { PaymentProviderError } from './payment/payment-provider.errors';
import { PaymentProvider } from './payment/payment-provider.interface';
import { RefundsAdminController } from './refunds-admin.controller';
import { RefundsService } from './refunds.service';
import { createFakeDb } from '../../../test/helpers/wallet-fake-db';
import { WalletLedgerService } from '../wallet/wallet-ledger.service';

const D = (v: string | number) => new Prisma.Decimal(v);

interface FakeRefund {
  id: string;
  orderId: string;
  amount: Prisma.Decimal;
  reason: string;
  kind: string;
  status: OrderRefundStatus;
  idempotencyKey: string;
  providerRefundId: string | null;
  errorCode: string | null;
  requiresManualRevoke: boolean;
  actorId: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

function setup(
  opts: {
    enabled?: boolean;
    status?: OrderStatus;
    deliveredTasks?: number;
    deliveredItems?: number;
    twoFactor?: 'totp' | null;
    paymentMethod?: string | null;
    timeoutHours?: number;
    refundFn?: PaymentProvider['refund'];
    revokeLeft?: number;
    /// 0.15: журнал кошелька (фейковая БД) и флаг WALLET_LEDGER_ENABLED.
    walletDb?: ReturnType<typeof createFakeDb>;
    walletEnabled?: boolean;
  } = {},
) {
  const order = {
    id: 'o1',
    orderNumber: 'O-1',
    status: opts.status ?? OrderStatus.COMPLETED,
    total: D('100.00'),
    paymentId: 'pay-1',
    paymentProvider: 'test',
    paymentMethod: opts.paymentMethod ?? null,
    refundedAt: null as Date | null,
    cancelReason: null as string | null,
  };
  const refunds: FakeRefund[] = [];
  let seq = 0;
  let deliveredTasks = opts.deliveredTasks ?? 0;
  const deliveredItems = opts.deliveredItems ?? 0;

  const ledger = new InMemoryPaymentLedger();
  ledger.create('pay-1', 'O-1', D('100.00'), 'RUB');
  ledger.setStatus('pay-1', 'succeeded');
  const refundSpy = jest.fn((p: string, a: Prisma.Decimal, k: string) =>
    Promise.resolve(ledger.refund(p, a, k)),
  );
  const provider = {
    name: 'test',
    currency: 'RUB',
    isConfigured: () => true,
    getPaymentStatus: jest.fn((p: string) =>
      Promise.resolve(ledger.getStatus(p)),
    ),
    refund: opts.refundFn ?? refundSpy,
  } as unknown as PaymentProvider;

  const walletTx = opts.walletDb?.tx;
  const tx = {
    ...(walletTx
      ? {
          walletLedgerEntry: walletTx.walletLedgerEntry,
          $executeRaw: walletTx.$executeRaw,
        }
      : {}),
    $queryRaw: jest.fn((strings: TemplateStringsArray, ...v: unknown[]) =>
      walletTx && strings.join('?').includes('FROM wallets')
        ? walletTx.$queryRaw(strings, ...v)
        : Promise.resolve([{ id: 'o1' }]),
    ),
    order: {
      findUniqueOrThrow: jest.fn(() =>
        Promise.resolve({ ...order, refunds: [...refunds] }),
      ),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        Object.assign(order, data);
        return Promise.resolve(order);
      }),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { status: OrderStatus };
          data: Record<string, unknown>;
        }) => {
          if (order.status !== where.status) return { count: 0 };
          Object.assign(order, data);
          return { count: 1 };
        },
      ),
    },
    orderRefund: {
      create: jest.fn(({ data }: { data: Partial<FakeRefund> }) => {
        const r = {
          id: `r${++seq}`,
          status: OrderRefundStatus.PENDING,
          providerRefundId: null,
          errorCode: null,
          requiresManualRevoke: false,
          createdAt: new Date(seq),
          updatedAt: new Date(seq),
          completedAt: null,
          ...data,
        } as FakeRefund;
        refunds.push(r);
        return Promise.resolve(r);
      }),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<FakeRefund>;
        }) => {
          const r = refunds.find((x) => x.id === where.id)!;
          Object.assign(r, data);
          return Promise.resolve(r);
        },
      ),
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(refunds.find((x) => x.id === where.id) ?? null),
      ),
      findUniqueOrThrow: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve({
          ...refunds.find((x) => x.id === where.id)!,
          order: { status: order.status },
        }),
      ),
      findMany: jest.fn(
        ({
          where,
        }: {
          where: { status?: OrderRefundStatus; id?: { not: string } };
        }) =>
          Promise.resolve(
            refunds.filter(
              (r) =>
                (!where.status || r.status === where.status) &&
                (!where.id || r.id !== where.id.not),
            ),
          ),
      ),
    },
    deliveryTask: {
      count: jest.fn(() => Promise.resolve(deliveredTasks)),
    },
    orderItem: { count: jest.fn(() => Promise.resolve(deliveredItems)) },
  };
  const prisma = {
    ...tx,
    order: {
      ...tx.order,
      findFirst: jest.fn().mockResolvedValue({ id: 'o1' }),
      findUnique: jest.fn(() =>
        Promise.resolve({
          ...order,
          refunds: refunds.filter((r) => r.status === 'PENDING').slice(0, 1),
        }),
      ),
    },
    orderRefund: {
      ...tx.orderRefund,
      updateMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const delivery = {
    assertRefundAllowed: jest.fn().mockResolvedValue(undefined),
    cancelOpenTasks: jest.fn().mockResolvedValue(0),
    revokeSiteGrants: jest.fn(() => {
      deliveredTasks = opts.revokeLeft ?? 0;
      return Promise.resolve({ revokedDecorations: 1, cancelledTasks: 1 });
    }),
  };
  const audit = { logInTx: jest.fn().mockResolvedValue(undefined) };
  const twoFactor = {
    verify: jest
      .fn()
      .mockResolvedValue(
        opts.twoFactor === undefined ? 'totp' : opts.twoFactor,
      ),
  };
  const counters = new Map<string, number>();
  const redis = {
    client: {
      get: jest.fn((k: string) =>
        Promise.resolve(counters.has(k) ? String(counters.get(k)) : null),
      ),
      incr: jest.fn((k: string) => {
        counters.set(k, (counters.get(k) ?? 0) + 1);
        return Promise.resolve(counters.get(k)!);
      }),
      expire: jest.fn().mockResolvedValue(1),
      del: jest.fn((k: string) => {
        counters.delete(k);
        return Promise.resolve(1);
      }),
    },
  };
  const registry = { get: jest.fn(() => provider) };
  const config = {
    get: jest.fn((k: string) =>
      k === 'STORE_REFUNDS_ENABLED'
        ? (opts.enabled ?? true)
        : k === 'STORE_REFUNDS_PENDING_TIMEOUT_HOURS'
          ? opts.timeoutHours
          : k === 'WALLET_LEDGER_ENABLED'
            ? (opts.walletEnabled ?? true)
            : undefined,
    ),
  };
  const service = new RefundsService(
    prisma as never,
    config as never,
    registry as never,
    delivery as never,
    audit as never,
    twoFactor as never,
    redis as never,
    opts.walletDb
      ? new WalletLedgerService(opts.walletDb.prisma as never, config as never)
      : undefined,
  );
  return {
    service,
    order,
    refunds,
    refundSpy,
    delivery,
    audit,
    twoFactor,
    provider,
    ledger,
    redis,
    counters,
  };
}

const dto = (over: Record<string, unknown> = {}) => ({
  reason: 'клиент попросил',
  twoFactorCode: '123456',
  ...over,
});

async function code(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (e) {
    return (e as { getResponse?: () => { code?: string } }).getResponse?.()
      ?.code;
  }
  return undefined;
}

describe('RefundsService (0.9)', () => {
  it('флаг выключен -> 503 refunds_disabled, провайдер не вызывается', async () => {
    const s = setup({ enabled: false });
    expect(await code(s.service.create('o1', dto(), 'a1'))).toBe(
      'refunds_disabled',
    );
    expect(await code(s.service.list({}))).toBe('refunds_disabled');
    expect(s.refundSpy).not.toHaveBeenCalled();
  });

  it('причина обязательна', async () => {
    const s = setup();
    expect(
      await code(s.service.create('o1', dto({ reason: '  ' }), 'a1')),
    ).toBe('refund_reason_required');
    expect(s.twoFactor.verify).not.toHaveBeenCalled();
  });

  it('свежая 2FA: нет кода и неверный код -> 403, резервные коды запрещены', async () => {
    const s = setup({ twoFactor: null });
    expect(
      await code(s.service.create('o1', dto({ twoFactorCode: '' }), 'a1')),
    ).toBe('refund_two_factor_required');
    expect(await code(s.service.create('o1', dto(), 'a1'))).toBe(
      'refund_two_factor_invalid',
    );
    expect(s.twoFactor.verify).toHaveBeenCalledWith('a1', '123456', {
      allowBackup: false,
    });
    expect(s.refundSpy).not.toHaveBeenCalled();
  });

  it('возврат до выдачи: провайдер, REFUNDED, аудит, отмена открытых заданий', async () => {
    const s = setup();
    const res = await s.service.create('o1', dto(), 'a1');
    expect(res.orderStatus).toBe(OrderStatus.REFUNDED);
    expect(res.refund.status).toBe('SUCCEEDED');
    expect(s.refundSpy).toHaveBeenCalledTimes(1);
    expect(s.refundSpy.mock.calls[0][2]).toBe('refund:o1:1');
    expect(s.delivery.cancelOpenTasks).toHaveBeenCalled();
    expect(s.delivery.revokeSiteGrants).not.toHaveBeenCalled();
    const actions = s.audit.logInTx.mock.calls.map(
      (c) => (c[1] as { action: string }).action,
    );
    expect(actions).toEqual([
      'orders.refund.requested',
      'orders.refund.completed',
    ]);
  });

  it('повтор после REFUNDED -> 409, второго возврата у провайдера нет', async () => {
    const s = setup();
    await s.service.create('o1', dto(), 'a1');
    expect(await code(s.service.create('o1', dto(), 'a1'))).toBe(
      'order_already_refunded',
    );
    expect(s.refundSpy).toHaveBeenCalledTimes(1);
  });

  it('REFUND_PENDING -> 409 refund_in_progress', async () => {
    const s = setup({ status: OrderStatus.REFUND_PENDING });
    expect(await code(s.service.create('o1', dto(), 'a1'))).toBe(
      'refund_in_progress',
    );
  });

  it('после выдачи обычный возврат -> 409 refund_after_delivery', async () => {
    const s = setup({ deliveredTasks: 1 });
    expect(await code(s.service.create('o1', dto(), 'a1'))).toBe(
      'refund_after_delivery',
    );
    expect(s.refundSpy).not.toHaveBeenCalled();
    expect(s.order.status).toBe(OrderStatus.COMPLETED);
  });

  it('isDelivered без заданий (старые заказы) тоже блокирует обычный возврат', async () => {
    const s = setup({ deliveredItems: 1 });
    expect(await code(s.service.create('o1', dto(), 'a1'))).toBe(
      'refund_after_delivery',
    );
  });

  it('задание выдачи в процессе блокирует возврат (код сервиса выдачи)', async () => {
    const s = setup();
    s.delivery.assertRefundAllowed.mockRejectedValueOnce(
      new ConflictException({ code: 'delivery_in_progress', message: 'x' }),
    );
    expect(await code(s.service.create('o1', dto(), 'a1'))).toBe(
      'delivery_in_progress',
    );
  });

  it('override: после выдачи, отзыв сайтового, пометка ручного отзыва, критичный аудит', async () => {
    const s = setup({ deliveredTasks: 2, revokeLeft: 1 });
    const res = await s.service.override('o1', dto(), 'owner');
    expect(res.orderStatus).toBe(OrderStatus.REFUNDED);
    expect(res.refund.kind).toBe('OVERRIDE');
    expect(res.refund.requiresManualRevoke).toBe(true);
    expect(s.delivery.revokeSiteGrants).toHaveBeenCalled();
    const audits = s.audit.logInTx.mock.calls.map(
      (c) => c[1] as { action: string; severity: string },
    );
    expect(audits.map((a) => a.action)).toEqual([
      'orders.refund.override_requested',
      'orders.refund.override_completed',
    ]);
    expect(audits.every((a) => a.severity === 'critical')).toBe(true);
  });

  it('override без пометки, если всё отозвано автоматически', async () => {
    const s = setup({ deliveredTasks: 1, revokeLeft: 0 });
    const res = await s.service.override('o1', dto(), 'owner');
    expect(res.refund.requiresManualRevoke).toBe(false);
  });

  it('override требует свежую 2FA и причину; без выданного не нужен', async () => {
    const noCode = setup({ deliveredTasks: 1, twoFactor: null });
    expect(await code(noCode.service.override('o1', dto(), 'owner'))).toBe(
      'refund_two_factor_invalid',
    );
    const notNeeded = setup();
    expect(await code(notNeeded.service.override('o1', dto(), 'owner'))).toBe(
      'refund_override_not_needed',
    );
    expect(notNeeded.refundSpy).not.toHaveBeenCalled();
  });

  it('частичный возврат: заказ остаётся COMPLETED, остаток растёт, сверх остатка -> 400', async () => {
    const s = setup();
    const first = await s.service.create('o1', dto({ amount: '30.00' }), 'a1');
    expect(first.orderStatus).toBe(OrderStatus.COMPLETED);
    expect(s.delivery.cancelOpenTasks).not.toHaveBeenCalled();
    expect(
      await code(s.service.create('o1', dto({ amount: '80.00' }), 'a1')),
    ).toBe('refund_exceeds_paid');
    expect(await code(s.service.create('o1', dto({ amount: '0' }), 'a1'))).toBe(
      'refund_amount_invalid',
    );
    const rest = await s.service.create('o1', dto(), 'a1');
    expect(rest.refund.amount.toFixed(2)).toBe('70.00');
    expect(rest.orderStatus).toBe(OrderStatus.REFUNDED);
    expect(s.refundSpy.mock.calls.map((c) => c[2])).toEqual([
      'refund:o1:1',
      'refund:o1:2',
    ]);
  });

  it('отказ провайдера -> REFUND_FAILED, повтор с той же суммой использует тот же ключ', async () => {
    let calls = 0;
    const keys: string[] = [];
    const s = setup({
      refundFn: (_p, a, k) => {
        keys.push(k);
        calls += 1;
        if (calls === 1) {
          return Promise.reject(new PaymentProviderError('rejected'));
        }
        return Promise.resolve({
          refundId: 'rf',
          paymentId: 'pay-1',
          status: 'succeeded',
          amount: a,
          currency: 'RUB',
        });
      },
    });
    const first = await s.service.create('o1', dto(), 'a1');
    expect(first.orderStatus).toBe(OrderStatus.REFUND_FAILED);
    expect(first.refund.errorCode).toBe('rejected');
    const second = await s.service.create('o1', dto(), 'a1');
    expect(second.orderStatus).toBe(OrderStatus.REFUNDED);
    expect(keys).toEqual(['refund:o1:1', 'refund:o1:1']);
    expect(s.refunds).toHaveLength(1);
  });

  it('таймаут провайдера -> остаётся REFUND_PENDING; сверка разрешает по статусу провайдера', async () => {
    const s = setup({
      refundFn: () => Promise.reject(new PaymentProviderError('timeout')),
    });
    const res = await s.service.create('o1', dto(), 'a1');
    expect(res.orderStatus).toBe(OrderStatus.REFUND_PENDING);
    expect(await s.service.syncPendingRefund('o1', new Date(1000))).toBe(
      'pending',
    );
    // провайдер на деле выполнил возврат
    s.ledger.refund('pay-1', D('100.00'), 'external');
    expect(await s.service.syncPendingRefund('o1', new Date(1000))).toBe(
      'resolved',
    );
    expect(s.order.status).toBe(OrderStatus.REFUNDED);
  });

  it('итог возврата от провайдера (вебхук/сверка) идемпотентен', async () => {
    const s = setup({
      refundFn: () => Promise.reject(new PaymentProviderError('timeout')),
    });
    const res = await s.service.create('o1', dto(), 'a1');
    await s.service.applyOutcome(res.refund.id, 'succeeded', 'rf-1');
    await s.service.applyOutcome(res.refund.id, 'succeeded', 'rf-1');
    await s.service.applyOutcome(res.refund.id, 'failed', undefined, 'late');
    expect(s.order.status).toBe(OrderStatus.REFUNDED);
    expect(s.refunds[0].status).toBe('SUCCEEDED');
    const completed = s.audit.logInTx.mock.calls.filter(
      (c) => (c[1] as { action: string }).action === 'orders.refund.completed',
    );
    expect(completed).toHaveLength(1);
  });

  it('рубины: возврат запрещён с понятным кодом', async () => {
    const s = setup({ paymentMethod: 'RUBY' });
    expect(await code(s.service.create('o1', dto(), 'a1'))).toBe(
      'refund_rubies_unsupported',
    );
    expect(s.refundSpy).not.toHaveBeenCalled();
  });

  it('незавершённый заказ нельзя вернуть', async () => {
    const s = setup({ status: OrderStatus.PENDING });
    expect(await code(s.service.create('o1', dto(), 'a1'))).toBe(
      'order_not_refundable',
    );
  });
});

describe('RefundsService: срок REFUND_PENDING и ручной выход (0.9, правки ревью)', () => {
  const HOUR = 3_600_000;
  const timeoutProvider = () =>
    Promise.reject(new PaymentProviderError('timeout'));

  it('REFUND_PENDING дольше 72 ч без ответа провайдера -> REFUND_FAILED с аудитом', async () => {
    const s = setup({ refundFn: timeoutProvider });
    await s.service.create('o1', dto(), 'a1');
    expect(s.order.status).toBe(OrderStatus.REFUND_PENDING);
    expect(await s.service.syncPendingRefund('o1', new Date(71 * HOUR))).toBe(
      'pending',
    );
    expect(await s.service.syncPendingRefund('o1', new Date(73 * HOUR))).toBe(
      'expired',
    );
    expect(s.order.status).toBe(OrderStatus.REFUND_FAILED);
    expect(s.refunds[0].status).toBe('FAILED');
    expect(s.refunds[0].errorCode).toBe('provider_timeout');
    const failed = s.audit.logInTx.mock.calls.filter(
      (c) => (c[1] as { action: string }).action === 'orders.refund.failed',
    );
    expect(failed).toHaveLength(1);
  });

  it('срок берётся из настройки', async () => {
    const s = setup({ refundFn: timeoutProvider, timeoutHours: 1 });
    await s.service.create('o1', dto(), 'a1');
    expect(await s.service.syncPendingRefund('o1', new Date(2 * HOUR))).toBe(
      'expired',
    );
  });

  it('после REFUND_FAILED повтор использует ту же попытку и ключ', async () => {
    const s = setup({ refundFn: timeoutProvider });
    await s.service.create('o1', dto(), 'a1');
    await s.service.syncPendingRefund('o1', new Date(73 * HOUR));
    const key = s.refunds[0].idempotencyKey;
    await s.service.create('o1', dto(), 'a1');
    expect(s.refunds).toHaveLength(1);
    expect(s.refunds[0].idempotencyKey).toBe(key);
  });

  it('ручной выход: причина и 2FA обязательны, итог REFUND_FAILED, критичный аудит админа', async () => {
    const s = setup({ refundFn: timeoutProvider });
    await s.service.create('o1', dto(), 'a1');
    expect(
      await code(s.service.markPendingFailed('o1', dto({ reason: ' ' }), 'a2')),
    ).toBe('refund_reason_required');
    expect(
      await code(
        s.service.markPendingFailed('o1', dto({ twoFactorCode: '' }), 'a2'),
      ),
    ).toBe('refund_two_factor_required');
    expect(s.order.status).toBe(OrderStatus.REFUND_PENDING);
    const res = await s.service.markPendingFailed('o1', dto(), 'a2');
    expect(res.orderStatus).toBe(OrderStatus.REFUND_FAILED);
    expect(res.refund.errorCode).toBe('manual_failed');
    const mark = s.audit.logInTx.mock.calls.find(
      (c) =>
        (c[1] as { action: string }).action === 'orders.refund.marked_failed',
    )![1] as { actorId: string; severity: string };
    expect(mark.actorId).toBe('a2');
    expect(mark.severity).toBe('critical');
  });

  it('ручной выход без возврата в ожидании -> 409', async () => {
    const s = setup();
    expect(await code(s.service.markPendingFailed('o1', dto(), 'a2'))).toBe(
      'refund_not_pending',
    );
  });

  it('перебор 2FA: после 5 неверных кодов -> 429, verify не вызывается', async () => {
    const s = setup({ twoFactor: null });
    for (let i = 0; i < 5; i += 1) {
      expect(await code(s.service.create('o1', dto(), 'a1'))).toBe(
        'refund_two_factor_invalid',
      );
    }
    s.twoFactor.verify.mockClear();
    expect(await code(s.service.create('o1', dto(), 'a1'))).toBe(
      'refund_two_factor_locked',
    );
    expect(s.twoFactor.verify).not.toHaveBeenCalled();
    expect(await code(s.service.create('o1', dto(), 'a9'))).toBe(
      'refund_two_factor_invalid',
    );
  });

  it('верный код сбрасывает счётчик неудач', async () => {
    const s = setup();
    s.counters.set('store:refund:2fa-fail:a1', 3);
    await s.service.create('o1', dto(), 'a1');
    expect(s.counters.has('store:refund:2fa-fail:a1')).toBe(false);
  });

  it('сумма провайдера не совпала: возврат остаётся PENDING, аудит расхождения', async () => {
    const s = setup({
      refundFn: () =>
        Promise.resolve({
          refundId: 'rf-x',
          status: 'succeeded',
          amount: D('1.00'),
        } as Awaited<ReturnType<PaymentProvider['refund']>>),
    });
    const log = jest.fn().mockResolvedValue(undefined);
    (s.audit as unknown as { log: jest.Mock }).log = log;
    const res = await s.service.create('o1', dto(), 'a1');
    expect(res.orderStatus).toBe(OrderStatus.REFUND_PENDING);
    expect(log).toHaveBeenCalledTimes(1);
    expect((log.mock.calls[0][0] as { action: string }).action).toBe(
      'orders.refund.amount_mismatch',
    );
  });
});

describe('RefundsAdminController: права (0.9)', () => {
  const perms = (method: keyof RefundsAdminController): string[] =>
    Reflect.getMetadata(
      PERMISSIONS_KEY,
      RefundsAdminController.prototype[method],
    ) as string[];

  it('создание и список — orders.refund; override — оба права', () => {
    expect(perms('list')).toEqual(['orders.refund']);
    expect(perms('create')).toEqual(['orders.refund']);
    expect(perms('markFailed')).toEqual(['orders.refund']);
    expect(perms('override')).toEqual([
      'orders.refund',
      'store.refund.override',
    ]);
  });
});

describe('RefundsService: рубины кошелька (0.15)', () => {
  async function seeded(
    credited = 100n,
    over: Parameters<typeof setup>[0] = {},
  ) {
    const walletDb = createFakeDb();
    const s = setup({ deliveredTasks: 1, walletDb, ...over });
    const seeder = new WalletLedgerService(
      walletDb.prisma as never,
      {
        get: () => true,
      } as never,
    );
    await walletDb.prisma.$transaction((tx) =>
      seeder.post(tx as never, {
        userId: 'u1',
        amount: credited,
        kind: 'PURCHASE',
        idempotencyKey: 'purchase:i1:1',
        orderId: 'o1',
        orderItemId: 'i1',
      }),
    );
    return { s, walletDb };
  }

  it('полный возврат: списывается весь непотраченный остаток (REFUND_REVERSAL)', async () => {
    const { s, walletDb } = await seeded();
    const res = await s.service.override('o1', dto(), 'a1');
    expect(res.refund.status).toBe('SUCCEEDED');
    expect(walletDb.balances.get('u1')).toBe(0n);
    const reversal = walletDb.entries.find(
      (e) => e.kind === 'REFUND_REVERSAL',
    )!;
    expect(reversal.amount).toBe(-100n);
    expect(reversal.refundId).toBe(res.refund.id);
    const requested = s.audit.logInTx.mock.calls.find(
      (c) =>
        (c[1] as { action: string }).action ===
        'orders.refund.override_requested',
    )![1] as { changes: { rubiesReversed: string } };
    expect(requested.changes.rubiesReversed).toBe('100');
  });

  it('частичный возврат 25 из 100 ₽ списывает пропорционально 25 рубинов', async () => {
    const { s, walletDb } = await seeded();
    await s.service.override('o1', dto({ amount: '25.00' }), 'a1');
    expect(walletDb.balances.get('u1')).toBe(75n);
  });

  it('рубины потрачены/списаны: отказ refund_rubies_spent, провайдер не вызван', async () => {
    const { s, walletDb } = await seeded();
    // Остаток 40 при зачисленных 100: вернуть 100 ₽ нельзя.
    walletDb.entries.push({
      id: 'adj',
      userId: 'u1',
      currency: 'RUBY',
      amount: -60n,
      balanceAfter: 40n,
      kind: 'ADMIN_ADJUST',
      idempotencyKey: 'adj',
      reason: null,
      actorId: null,
      orderId: null,
      orderItemId: null,
      refundId: null,
      createdAt: new Date(),
    });
    walletDb.balances.set('u1', 40n);
    expect(await code(s.service.override('o1', dto(), 'a1'))).toBe(
      'refund_rubies_spent',
    );
    expect(s.refundSpy).not.toHaveBeenCalled();
    expect(walletDb.balances.get('u1')).toBe(40n);
  });

  it('отказ провайдера: списанные рубины возвращаются (REFUND_RESTORE)', async () => {
    const { s, walletDb } = await seeded(100n, {
      refundFn: jest.fn(() =>
        Promise.reject(new PaymentProviderError('rejected')),
      ) as unknown as PaymentProvider['refund'],
    });
    const res = await s.service.override('o1', dto(), 'a1');
    expect(res.refund.status).toBe('FAILED');
    expect(walletDb.balances.get('u1')).toBe(100n);
    expect(walletDb.entries.map((e) => e.kind)).toEqual([
      'PURCHASE',
      'REFUND_REVERSAL',
      'REFUND_RESTORE',
    ]);
    const sum = walletDb.entries.reduce((a, e) => a + e.amount, 0n);
    expect(sum).toBe(walletDb.balances.get('u1'));
  });

  it('кошелёк выключен, а рубины по заказу есть: 503 wallet_disabled, деньги не уходят', async () => {
    const { s } = await seeded(100n, { walletEnabled: false });
    expect(await code(s.service.override('o1', dto(), 'a1'))).toBe(
      'wallet_disabled',
    );
    expect(s.refundSpy).not.toHaveBeenCalled();
  });

  it('заказ без рубинов: журнал не затрагивается', async () => {
    const walletDb = createFakeDb();
    const s = setup({ deliveredTasks: 1, walletDb });
    const res = await s.service.override('o1', dto(), 'a1');
    expect(res.refund.status).toBe('SUCCEEDED');
    expect(walletDb.entries).toHaveLength(0);
  });
});
