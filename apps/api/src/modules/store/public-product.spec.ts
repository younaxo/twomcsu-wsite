import { NotFoundException } from '@nestjs/common';
import { BundlesService } from './bundles.service';
import { ProductsService } from './products.service';
import {
  PUBLIC_CATEGORY_SELECT,
  PUBLIC_PRODUCT_BRIEF_SELECT,
  PUBLIC_PRODUCT_SELECT,
  PUBLIC_VARIANT_SELECT,
} from './public-product';
import { WishlistService } from './wishlist.service';

/// Служебные поля товара и варианта: выдача, валюта, привязки, метаданные.
const FORBIDDEN = [
  'gameCommands',
  'server',
  'currencyType',
  'currencyAmount',
  'positionId',
  'decorationId',
  'position',
  'decoration',
  'createdAt',
  'updatedAt',
  'order',
  'productId',
  'bulkDiscounts',
  'orderItems',
  'cartItems',
  'wishlistItems',
  'bundleItems',
];

/// Собирает все ключи объекта `select` рекурсивно (в том числе во вложенных).
function collectSelectKeys(select: unknown, out = new Set<string>()) {
  if (select && typeof select === 'object') {
    for (const [key, value] of Object.entries(select)) {
      if (key === 'select') {
        for (const inner of Object.keys(value as object)) out.add(inner);
      }
      collectSelectKeys(value, out);
    }
  }
  return out;
}

function expectNoForbidden(keys: Iterable<string>) {
  const present = [...keys].filter((key) => FORBIDDEN.includes(key));
  expect(present).toEqual([]);
}

describe('публичный белый список полей товара', () => {
  it('select товара, варианта и категории не содержит служебных полей', () => {
    expectNoForbidden(Object.keys(PUBLIC_PRODUCT_BRIEF_SELECT));
    expectNoForbidden(Object.keys(PUBLIC_VARIANT_SELECT));
    expectNoForbidden(Object.keys(PUBLIC_CATEGORY_SELECT));
    expectNoForbidden(collectSelectKeys({ select: PUBLIC_PRODUCT_SELECT }));
    expect(Object.keys(PUBLIC_PRODUCT_SELECT)).toEqual(
      expect.arrayContaining(['id', 'slug', 'name', 'category', 'variants']),
    );
  });
});

describe('ProductsService: публичный ответ', () => {
  const product = {
    id: 'p1',
    slug: 'ares',
    name: 'Ares',
    isActive: true,
    variants: [],
  };

  it('getBySlug и list запрашивают товар только через белый список', async () => {
    const findUnique = jest.fn().mockResolvedValue(product);
    const findMany = jest.fn().mockResolvedValue([product]);
    const prisma = {
      product: { findUnique, findMany, count: jest.fn().mockResolvedValue(1) },
      wishlistItem: { findFirst: jest.fn() },
    };
    const service = new ProductsService(
      prisma as never,
      { log: jest.fn() } as never,
    );

    const detail = await service.getBySlug('ares', null);
    expect(detail).not.toHaveProperty('isActive');
    expect(detail.inWishlist).toBe(false);
    const detailArgs = findUnique.mock.calls[0][0];
    expect(detailArgs.include).toBeUndefined();
    expectNoForbidden(Object.keys(detailArgs.select));

    await service.list({} as never);
    const listArgs = findMany.mock.calls[0][0];
    expect(listArgs.include).toBeUndefined();
    expect(listArgs.select).toBe(PUBLIC_PRODUCT_SELECT);
  });

  it('getBySlug: неактивный товар даёт 404', async () => {
    const prisma = {
      product: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...product, isActive: false }),
      },
    };
    const service = new ProductsService(
      prisma as never,
      { log: jest.fn() } as never,
    );
    await expect(service.getBySlug('ares', null)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  describe('getBoughtTogether', () => {
    it('несуществующий и неактивный исходный товар — одинаковый 404', async () => {
      const findUnique = jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'p1', isActive: false });
      const service = new ProductsService(
        { product: { findUnique } } as never,
        { log: jest.fn() } as never,
      );
      const missing = await service.getBoughtTogether('x').catch((e) => e);
      const hidden = await service.getBoughtTogether('y').catch((e) => e);
      expect(missing).toBeInstanceOf(NotFoundException);
      expect(hidden).toBeInstanceOf(NotFoundException);
      expect(hidden.getResponse()).toEqual(missing.getResponse());
    });

    it('связанные товары запрашиваются по белому списку', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = {
        product: {
          findUnique: jest.fn().mockResolvedValue({ id: 'p1', isActive: true }),
          findMany,
        },
        orderItem: {
          findMany: jest.fn().mockResolvedValue([{ productId: 'p2' }]),
        },
      };
      await new ProductsService(
        prisma as never,
        { log: jest.fn() } as never,
      ).getBoughtTogether('ares');
      const args = findMany.mock.calls[0][0];
      expect(args.include).toBeUndefined();
      expect(args.select).toBe(PUBLIC_PRODUCT_SELECT);
    });
  });
});

describe('наборы и список желаний: без служебных полей товара', () => {
  it('BundlesService.list/getBySlug', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const findUnique = jest.fn().mockResolvedValue({ isActive: true });
    const service = new BundlesService({
      bundle: { findMany, findUnique },
    } as never);
    await service.list();
    await service.getBySlug('b');
    for (const args of [
      findMany.mock.calls[0][0],
      findUnique.mock.calls[0][0],
    ]) {
      const productArg = args.include.items.select.product;
      expect(productArg.select).toBe(PUBLIC_PRODUCT_BRIEF_SELECT);
      expect(args.include.items.include).toBeUndefined();
    }
  });

  it('WishlistService.getWishlist', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 'w', items: [] });
    const service = new WishlistService(
      { wishlist: { upsert } } as never,
      {} as never,
    );
    await service.getWishlist('u1');
    const productArg = upsert.mock.calls[0][0].include.items.include.product;
    expect(productArg.select).toBe(PUBLIC_PRODUCT_SELECT);
    expect(productArg.include).toBeUndefined();
  });
});

describe('заказ покупателя: без служебных полей', () => {
  it('ORDER_INCLUDE ограничивает товар, вариант и получателя подарка', async () => {
    const { OrdersService } = await import('./orders.service');
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new OrdersService(
      { order: { findMany } } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await service.listMine('u1');
    const item = findMany.mock.calls[0][0].include.items.include;
    expect(item.product.select).toBe(PUBLIC_PRODUCT_BRIEF_SELECT);
    expect(item.variant.select).toBe(PUBLIC_VARIANT_SELECT);
    expect(Object.keys(item.giftToUser.select).sort()).toEqual([
      'avatar',
      'id',
      'tag',
      'username',
    ]);
  });
});
