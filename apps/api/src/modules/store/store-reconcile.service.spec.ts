import { OrderStatus, Prisma } from '@prisma/client';
import { PaymentProvider } from './payment/payment-provider.interface';
import { StoreReconcileService } from './store-reconcile.service';

const D = (v: string | number) => new Prisma.Decimal(v);
const NOW = new Date('2026-11-22T12:00:00Z');

function order(over: Record<string, unknown> = {}) {
  return {
    id: 'o1',
    orderNumber: 'O-1',
    status: OrderStatus.PENDING,
    paymentId: 'pay-1',
    paymentProvider: 'test',
    ...over,
  };
}

function setup(
  orders: unknown[],
  status: Record<string, unknown> | Error,
  cfg: Record<string, unknown> = {},
) {
  const provider = {
    name: 'test',
    isConfigured: () => true,
    getPaymentStatus: jest.fn(() =>
      status instanceof Error
        ? Promise.reject(status)
        : Promise.resolve({
            paymentId: 'pay-1',
            status: 'pending',
            amount: D('100.00'),
            currency: 'RUB',
            refundedAmount: D(0),
            ...status,
          }),
    ),
  } as unknown as PaymentProvider;
  const prisma = {
    order: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce(orders)
        .mockResolvedValueOnce([{ id: 'ro1' }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const config = {
    get: jest.fn((k: string) =>
      k === 'STORE_REFUNDS_ENABLED' ? true : cfg[k],
    ),
  };
  const orders$ = {
    handleWebhook: jest.fn().mockResolvedValue({ accepted: true }),
  };
  const refunds = {
    syncPendingRefund: jest.fn().mockResolvedValue('resolved'),
  };
  const service = new StoreReconcileService(
    prisma as never,
    config as never,
    { get: () => provider } as never,
    orders$ as never,
    refunds as never,
  );
  return { service, prisma, orders$, refunds, provider, config };
}

describe('StoreReconcileService (0.9)', () => {
  it('выключенный флаг: ничего не делает', async () => {
    const s = setup([order()], {});
    s.config.get.mockReturnValue(undefined);
    const r = await s.service.runOnce(NOW);
    expect(r.checked).toBe(0);
    expect(s.prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('окно и порог: запрос ограничен по createdAt, размер пачки из настройки', async () => {
    const s = setup(
      [],
      {},
      {
        STORE_REFUNDS_RECONCILE_MIN_AGE_MINUTES: 30,
        STORE_REFUNDS_RECONCILE_WINDOW_HOURS: 24,
        STORE_REFUNDS_RECONCILE_BATCH: 7,
      },
    );
    await s.service.runOnce(NOW);
    const args = s.prisma.order.findMany.mock.calls[0][0] as {
      where: { createdAt: { lt: Date; gt: Date } };
      take: number;
    };
    expect(args.take).toBe(7);
    expect(args.where.createdAt.lt.toISOString()).toBe(
      '2026-11-22T11:30:00.000Z',
    );
    expect(args.where.createdAt.gt.toISOString()).toBe(
      '2026-11-21T12:00:00.000Z',
    );
  });

  it('по умолчанию окно 72 часа', async () => {
    const s = setup([], {});
    await s.service.runOnce(NOW);
    const args = s.prisma.order.findMany.mock.calls[0][0] as {
      where: { createdAt: { gt: Date } };
    };
    expect(args.where.createdAt.gt.toISOString()).toBe(
      '2026-11-19T12:00:00.000Z',
    );
  });

  it('PENDING + succeeded у провайдера -> путь вебхука (идемпотентный)', async () => {
    const s = setup([order()], { status: 'succeeded' });
    const r = await s.service.runOnce(NOW);
    expect(s.orders$.handleWebhook).toHaveBeenCalledWith(
      s.provider,
      expect.objectContaining({ status: 'succeeded', orderNumber: 'O-1' }),
    );
    expect(r.completed).toBe(1);
    expect(s.prisma.order.updateMany).toHaveBeenCalled();
  });

  it('ложный FAILED + succeeded -> восстановление через handleWebhook', async () => {
    const s = setup([order({ status: OrderStatus.FAILED })], {
      status: 'succeeded',
    });
    await s.service.runOnce(NOW);
    expect(s.orders$.handleWebhook).toHaveBeenCalledTimes(1);
  });

  it('PENDING + failed -> FAILED; FAILED + failed не трогается', async () => {
    const a = setup([order()], { status: 'failed' });
    expect((await a.service.runOnce(NOW)).failed).toBe(1);
    const b = setup([order({ status: OrderStatus.FAILED })], {
      status: 'failed',
    });
    await b.service.runOnce(NOW);
    expect(b.orders$.handleWebhook).not.toHaveBeenCalled();
  });

  it('у провайдера всё ещё pending: остаётся, отметка сверки ставится', async () => {
    const s = setup([order()], { status: 'pending' });
    const r = await s.service.runOnce(NOW);
    expect(r.stillPending).toBe(1);
    expect(s.orders$.handleWebhook).not.toHaveBeenCalled();
  });

  it('платёж уже возвращён у провайдера вне сайта: заказ не завершается', async () => {
    const s = setup([order()], {
      status: 'succeeded',
      refundedAmount: D('10.00'),
    });
    await s.service.runOnce(NOW);
    expect(s.orders$.handleWebhook).not.toHaveBeenCalled();
  });

  it('ошибка провайдера по одному заказу не роняет проход; REFUND_PENDING сверяется', async () => {
    const s = setup([order()], new Error('boom'));
    const r = await s.service.runOnce(NOW);
    expect(r.errors).toBe(1);
    expect(r.refundsResolved).toBe(1);
    expect(s.refunds.syncPendingRefund).toHaveBeenCalledWith('ro1');
  });
});
