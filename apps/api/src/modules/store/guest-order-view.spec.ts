import { toGuestOrderView } from './guest-order-view';

const base = {
  orderNumber: 'O-20261123-ABCDEF',
  status: 'COMPLETED',
  guestMinecraftNick: 'Steve',
  subtotal: 100,
  discountAmount: 0,
  total: 100,
  createdAt: new Date('2026-11-23T00:00:00Z'),
  paidAt: new Date('2026-11-23T00:01:00Z'),
  items: [
    {
      quantity: 1,
      unitPrice: 100,
      totalPrice: 100,
      product: { name: 'Размут' },
      deliveryTasks: [{ status: 'DELIVERED' as const }],
    },
  ],
};

describe('toGuestOrderView (0.12a)', () => {
  it('только белый список: без id, userId, платёжных полей, токена', () => {
    const view = toGuestOrderView({
      ...base,
      // лишние поля источника не должны просочиться
      id: 'cuid1',
      userId: null,
      paymentId: 'pay_1',
      paymentProvider: 'test',
      guestAccessTokenHash: 'h'.repeat(64),
      paymentUrl: 'https://pay',
    } as never);
    const json = JSON.stringify(view);
    for (const k of [
      'cuid1',
      'userId',
      'paymentId',
      'paymentProvider',
      'guestAccessTokenHash',
      'paymentUrl',
      'ip',
      'email',
    ]) {
      expect(json).not.toContain(k);
    }
    expect(view.orderNumber).toBe(base.orderNumber);
    expect(view.items[0].name).toBe('Размут');
  });

  it('статус выдачи только у COMPLETED', () => {
    expect(toGuestOrderView(base).deliveryStatus).toBe('delivered');
    const pending = toGuestOrderView({ ...base, status: 'PENDING' });
    expect(pending.deliveryStatus).toBeNull();
    expect(pending.items[0].deliveryStatus).toBeNull();
  });
});
