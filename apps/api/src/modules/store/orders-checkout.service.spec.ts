import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';

/// Оформление без платёжного провайдера (production без PAYMENT_PROVIDER, 0.5):
/// 503 `payment_unavailable` до любой записи — заказ не создаётся.
describe('OrdersService: оформление без провайдера и сбой провайдера (0.5)', () => {
  const lines = [] as never;
  const totals = { subtotal: 1, discountAmount: 0, total: 1 } as never;

  function build(provider: unknown, checkoutOverrides: object = {}) {
    const prisma = {
      order: {
        create: jest.fn().mockResolvedValue({ id: 'o1' }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      orderItem: { findFirst: jest.fn() },
    };
    const checkout = {
      assertOfferAccepted: jest.fn().mockResolvedValue({
        offerVersion: '1',
        offerAcceptedAt: new Date(),
      }),
      resolveRecipientNick: jest.fn().mockResolvedValue('Steve'),
      ...checkoutOverrides,
    };
    const service = new OrdersService(
      prisma as never,
      {} as never,
      { getConfigured: () => provider } as never,
      {} as never,
      {} as never,
      {} as never,
      checkout as never,
      {} as never,
    );
    return { service, prisma, checkout };
  }

  const create = (service: OrdersService) =>
    (
      service as unknown as {
        createOrderFromLines: (...a: unknown[]) => Promise<unknown>;
      }
    ).createOrderFromLines('u1', null, lines, totals, null, '1');

  it('нет провайдера: 503 payment_unavailable, заказ не создаётся, оферта/ник не проверяются', async () => {
    const { service, prisma, checkout } = build(undefined);
    await expect(create(service)).rejects.toMatchObject({
      status: 503,
      response: { code: 'payment_unavailable' },
    });
    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(checkout.assertOfferAccepted).not.toHaveBeenCalled();
  });

  it('оферта не принята: заказ не создаётся', async () => {
    const provider = { name: 'test', createPayment: jest.fn() };
    const { service, prisma } = build(provider, {
      assertOfferAccepted: jest.fn().mockRejectedValue(new Error('offer')),
    });
    await expect(create(service)).rejects.toThrow('offer');
    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(provider.createPayment).not.toHaveBeenCalled();
  });

  it('сбой createPayment: заказ переводится в FAILED, ответ 503 payment_unavailable', async () => {
    const provider = {
      name: 'test',
      createPayment: jest.fn().mockRejectedValue(new Error('boom')),
    };
    const { service, prisma } = build(provider);
    await expect(create(service)).rejects.toMatchObject({
      status: 503,
      response: { code: 'payment_unavailable' },
    });
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', status: OrderStatus.PENDING },
      data: { status: OrderStatus.FAILED },
    });
  });
});
