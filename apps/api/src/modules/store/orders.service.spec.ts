import { OrderStatus, Prisma } from '@prisma/client';
import { OrdersService } from './orders.service';
import {
  PaymentProvider,
  PaymentWebhookEvent,
} from './payment/payment-provider.interface';

const provider = { name: 'test', currency: 'RUB' } as PaymentProvider;

function baseOrder(over: Record<string, unknown> = {}) {
  return {
    id: 'o1',
    orderNumber: 'O-1',
    status: OrderStatus.PENDING,
    total: new Prisma.Decimal('270.00'),
    paymentId: 'pay-1',
    paymentProvider: 'test',
    promoCodeId: 'promo1',
    userId: 'u1',
    ...over,
  };
}

function ev(over: Partial<PaymentWebhookEvent> = {}): PaymentWebhookEvent {
  return {
    orderNumber: 'O-1',
    paymentId: 'pay-1',
    status: 'succeeded',
    amount: new Prisma.Decimal('270'),
    currency: 'RUB',
    ...over,
  };
}

function setup(order: unknown, movedCount = 1) {
  const tx = {
    order: { updateMany: jest.fn().mockResolvedValue({ count: movedCount }) },
    promoCode: { update: jest.fn().mockResolvedValue({}) },
    promoCodeUsage: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    order: {
      findUnique: jest.fn().mockResolvedValue(order),
      updateMany: jest.fn().mockResolvedValue({ count: movedCount }),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const service = new OrdersService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, prisma, tx };
}

describe('OrdersService.handleWebhook (ADR-0157)', () => {
  it('успех: один переход, usedCount +1, usage для пользователя', async () => {
    const { service, tx } = setup(baseOrder());
    await expect(service.handleWebhook(provider, ev())).resolves.toEqual({
      accepted: true,
    });
    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'o1', status: OrderStatus.PENDING },
      }),
    );
    expect(tx.promoCode.update).toHaveBeenCalledTimes(1);
    expect(tx.promoCodeUsage.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it('гость: usedCount +1, записи usage нет', async () => {
    const { service, tx } = setup(baseOrder({ userId: null }));
    await service.handleWebhook(provider, ev());
    expect(tx.promoCode.update).toHaveBeenCalledTimes(1);
    expect(tx.promoCodeUsage.createMany).not.toHaveBeenCalled();
  });

  it('проигравший гонку (count=0): already_processed, usedCount не меняется', async () => {
    const { service, tx } = setup(baseOrder(), 0);
    await expect(service.handleWebhook(provider, ev())).resolves.toEqual({
      accepted: true,
      reason: 'already_processed',
    });
    expect(tx.promoCode.update).not.toHaveBeenCalled();
  });

  it('повтор по уже обработанному заказу: already_processed без записи', async () => {
    const { service, prisma } = setup(
      baseOrder({ status: OrderStatus.COMPLETED }),
    );
    await expect(service.handleWebhook(provider, ev())).resolves.toEqual({
      accepted: true,
      reason: 'already_processed',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('failed после COMPLETED не меняет статус', async () => {
    const { service, prisma } = setup(
      baseOrder({ status: OrderStatus.COMPLETED }),
    );
    await service.handleWebhook(provider, ev({ status: 'failed' }));
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['переплата', { amount: new Prisma.Decimal('270.01') }, 'amount_mismatch'],
    ['недоплата', { amount: new Prisma.Decimal('269.99') }, 'amount_mismatch'],
    ['валюта', { currency: 'USD' }, 'currency_mismatch'],
    ['paymentId', { paymentId: 'other' }, 'payment_id_mismatch'],
  ])('%s: отказ без перехода', async (_n, over, reason) => {
    const { service, prisma, tx } = setup(baseOrder());
    await expect(service.handleWebhook(provider, ev(over))).resolves.toEqual({
      accepted: false,
      reason,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('провайдер заказа не совпадает с :provider', async () => {
    const { service } = setup(baseOrder({ paymentProvider: 'other' }));
    await expect(service.handleWebhook(provider, ev())).resolves.toEqual({
      accepted: false,
      reason: 'provider_mismatch',
    });
  });

  it('заказ не найден', async () => {
    const { service } = setup(null);
    await expect(service.handleWebhook(provider, ev())).resolves.toEqual({
      accepted: false,
      reason: 'order_not_found',
    });
  });

  it('failed в PENDING: атомарный переход в FAILED', async () => {
    const { service, prisma } = setup(baseOrder());
    await expect(
      service.handleWebhook(provider, ev({ status: 'failed' })),
    ).resolves.toEqual({ accepted: true });
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', status: OrderStatus.PENDING },
      data: { status: OrderStatus.FAILED },
    });
  });
});
