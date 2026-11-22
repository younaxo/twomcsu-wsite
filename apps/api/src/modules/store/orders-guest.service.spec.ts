import { createHash } from 'crypto';
import { OrdersService } from './orders.service';
import { generateGuestToken, hashGuestToken } from './guest-access-token';

function build(order: object | null) {
  const prisma = {
    order: { findUnique: jest.fn().mockResolvedValue(order) },
  };
  const service = new OrdersService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, prisma };
}

const NOW = new Date('2026-11-23T00:00:00Z');
const guestOrder = (over: object = {}) => ({
  orderNumber: 'O-20261123-ABCDEF',
  status: 'PENDING',
  userId: null,
  guestMinecraftNick: 'Steve',
  subtotal: 1,
  discountAmount: 0,
  total: 1,
  createdAt: NOW,
  paidAt: null,
  paymentId: 'pay',
  guestAccessTokenHash: 'x',
  guestAccessExpiresAt: new Date(NOW.getTime() + 1000),
  items: [],
  ...over,
});

describe('OrdersService.getByGuestToken (0.12a)', () => {
  it('ищет по SHA-256 хешу токена, токен в БД не уходит', async () => {
    const token = generateGuestToken();
    const { service, prisma } = build(guestOrder());
    const view = await service.getByGuestToken(token, NOW);
    expect(prisma.order.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          guestAccessTokenHash: createHash('sha256')
            .update(token)
            .digest('hex'),
        },
      }),
    );
    expect(JSON.stringify(prisma.order.findUnique.mock.calls)).not.toContain(
      token,
    );
    expect(JSON.stringify(view)).not.toContain('paymentId');
  });

  it('формат токена неверный (например, номер заказа): 404 без обращения к БД', async () => {
    const { service, prisma } = build(guestOrder());
    await expect(
      service.getByGuestToken('O-20261123-ABCDEF', NOW),
    ).rejects.toMatchObject({ status: 404 });
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['не найден', null],
    [
      'просрочен',
      guestOrder({ guestAccessExpiresAt: new Date(NOW.getTime() - 1) }),
    ],
    ['нет срока', guestOrder({ guestAccessExpiresAt: null })],
    ['заказ пользователя', guestOrder({ userId: 'u1' })],
  ])('%s: единый 404', async (_name, order) => {
    const { service } = build(order);
    await expect(
      service.getByGuestToken(generateGuestToken(), NOW),
    ).rejects.toMatchObject({ status: 404, message: 'Заказ не найден' });
  });

  it('хеш стабилен', () => {
    expect(hashGuestToken('a'.repeat(30))).toBe(hashGuestToken('a'.repeat(30)));
  });
});

describe('OrdersService.quickBuy: ограничения гостя (ADR-0186 Р6)', () => {
  function buildQuick(product: object) {
    const prisma = {
      productVariant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'v1',
          productId: 'p1',
          isActive: true,
          price: 1,
          product: {
            id: 'p1',
            isActive: true,
            type: 'PRIVILEGE',
            isGiftable: false,
            isSelfOnly: false,
            isUnique: false,
            maxPerPurchase: null,
            name: 'P',
            ...product,
          },
        }),
      },
    };
    const priced = {
      subtotal: 1,
      discountAmount: 0,
      total: 1,
      lines: [
        {
          productId: 'p1',
          name: 'P',
          quantity: 1,
          isUnique: false,
          maxPerPurchase: null,
        },
      ],
    };
    return new OrdersService(
      prisma as never,
      { computeTotals: jest.fn().mockResolvedValue(priced) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { assertQuickBuyEnabled: jest.fn() } as never,
      {} as never,
      {} as never,
    );
  }

  it.each([{ isSelfOnly: true }, { isUnique: true }, { type: 'CURRENCY' }])(
    '%p: 403 login_required, заказ не создаётся',
    async (product) => {
      const service = buildQuick(product);
      await expect(
        service.quickBuy({ variantId: 'v1', guestMinecraftNick: 'Steve' }),
      ).rejects.toMatchObject({
        status: 403,
        response: { code: 'login_required' },
      });
    },
  );
});
