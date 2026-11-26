import { CartService } from './cart.service';
import { OrdersService } from './orders.service';

/// Машиночитаемые коды ошибок корзины и оформления (слой 0): веб ветвится по
/// `code`, а текст `message` пользователю не показывает.
describe('Коды ошибок корзины и оформления', () => {
  const emptyCart = {
    id: 'c1',
    userId: 'u1',
    items: [],
    promoCode: null,
  };

  function cartService(prisma: object) {
    return new CartService(prisma as never, {} as never);
  }

  const withCart = (extra: object = {}) => ({
    cart: { upsert: jest.fn().mockResolvedValue(emptyCart) },
    ...extra,
  });

  it('addItem без variantId и bundleId: 400 CART_TARGET_REQUIRED', async () => {
    await expect(
      cartService(withCart()).addItem('u1', {} as never),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'CART_TARGET_REQUIRED' },
    });
  });

  it('addItem с обоими: 400 CART_TARGET_AMBIGUOUS', async () => {
    await expect(
      cartService(withCart()).addItem('u1', {
        variantId: 'v',
        bundleId: 'b',
      } as never),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'CART_TARGET_AMBIGUOUS' },
    });
  });

  it('addItem: нет варианта, выключенный вариант или товар — 404 VARIANT_NOT_FOUND', async () => {
    const find = jest.fn();
    const service = cartService(
      withCart({ productVariant: { findUnique: find } }),
    );
    const dto = { variantId: 'v' } as never;
    for (const row of [
      null,
      { isActive: false, product: { isActive: true } },
      { isActive: true, product: { isActive: false } },
    ]) {
      find.mockResolvedValueOnce(row);
      await expect(service.addItem('u1', dto)).rejects.toMatchObject({
        status: 404,
        response: { code: 'VARIANT_NOT_FOUND' },
      });
    }
  });

  it('addItem: набор не найден или выключен — 404 BUNDLE_NOT_FOUND', async () => {
    const find = jest.fn().mockResolvedValue({ isActive: false });
    const service = cartService(withCart({ bundle: { findUnique: find } }));
    await expect(
      service.addItem('u1', { bundleId: 'b' } as never),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'BUNDLE_NOT_FOUND' },
    });
  });

  it('updateItem чужой или несуществующей позиции: 404 CART_ITEM_NOT_FOUND', async () => {
    const service = cartService({
      cartItem: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'i', cart: { userId: 'other' } }),
      },
    });
    for (let i = 0; i < 2; i++) {
      await expect(
        service.updateItem('u1', 'i', { quantity: 1 } as never),
      ).rejects.toMatchObject({
        status: 404,
        response: { code: 'CART_ITEM_NOT_FOUND' },
      });
    }
  });

  it('applyPromo на пустой корзине: 400 CART_EMPTY', async () => {
    await expect(
      cartService(withCart()).applyPromo('u1', 'CODE'),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'CART_EMPTY' },
    });
  });

  function ordersService(prisma: object) {
    return new OrdersService(
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
  }

  it('createFromCart без корзины и с пустой корзиной: 400 CART_EMPTY', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(emptyCart);
    const service = ordersService({ cart: { findUnique } });
    for (let i = 0; i < 2; i++) {
      await expect(
        service.createFromCart('u1', {} as never),
      ).rejects.toMatchObject({
        status: 400,
        response: { code: 'CART_EMPTY' },
      });
    }
  });

  it('quickBuy: нет варианта — 404 VARIANT_NOT_FOUND', async () => {
    const service = new OrdersService(
      {
        productVariant: { findUnique: jest.fn().mockResolvedValue(null) },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { assertQuickBuyEnabled: jest.fn() } as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.quickBuy({ variantId: 'v' } as never),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'VARIANT_NOT_FOUND' },
    });
  });
});
