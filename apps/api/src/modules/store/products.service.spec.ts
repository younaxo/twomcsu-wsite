import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProductsService } from './products.service';

function variantRow(price: string, isActive = true) {
  return {
    id: 'v1',
    productId: 'p1',
    duration: 'MONTH_1',
    price: new Prisma.Decimal(price),
    oldPrice: null,
    isActive,
  };
}

function setup(type = 'PRIVILEGE', isActive = false) {
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const product = {
    id: 'p1',
    slug: 'ares',
    type,
    isActive,
    variants: [],
    category: {},
  };
  const prisma = {
    product: {
      findUnique: jest.fn().mockResolvedValue(product),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'p1',
          slug: data.slug,
          type: data.type,
          variants: [variantRow('100')],
        }),
      ),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...product, ...data }),
        ),
      delete: jest.fn().mockResolvedValue({}),
    },
    category: { findUnique: jest.fn().mockResolvedValue({ id: 'c1' }) },
    productVariant: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    orderItem: { count: jest.fn().mockResolvedValue(0) },
    bundleItem: { count: jest.fn().mockResolvedValue(0) },
    cartItem: { deleteMany: jest.fn().mockReturnValue('cart') },
    wishlistItem: { deleteMany: jest.fn().mockReturnValue('wish') },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
  };
  // Интерактивная транзакция: коллбэк получает тот же мок-клиент.
  prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
    cb(prisma),
  );
  const service = new ProductsService(prisma as never, audit as never);
  return { service, prisma, audit };
}

describe('ProductsService (админка)', () => {
  it('create: товар неактивен, даже если isActive прислан в обход DTO', async () => {
    const { service, prisma, audit } = setup();
    (prisma.product.findUnique as jest.Mock).mockResolvedValue(null);
    await service.create(
      {
        name: 'A',
        slug: 'a',
        type: 'PRIVILEGE',
        categoryId: 'c1',
        isActive: true,
        variants: [{ duration: 'MONTH_1', price: '100' }],
      } as never,
      'admin1',
    );
    const arg = (prisma.product.create as jest.Mock).mock.calls[0][0];
    expect(arg.data.isActive).toBe(false);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin1',
        action: 'store.product.created',
        severity: 'info',
      }),
    );
  });

  it('update: активация типа вне списка — 422', async () => {
    const { service, prisma } = setup('BADGE', false);
    await expect(
      service.update('p1', { isActive: true }, 'admin1'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('update: деактивация товара типа вне списка разрешена', async () => {
    const { service, prisma } = setup('BADGE', true);
    await service.update('p1', { isActive: false }, 'admin1');
    expect(prisma.product.update).toHaveBeenCalled();
  });

  it('update: смена активности пишет аудит warning с from/to', async () => {
    const { service, audit } = setup();
    await service.update('p1', { isActive: true }, 'admin1');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'store.product.activation_changed',
        severity: 'warning',
        changes: { from: false, to: true },
      }),
    );
  });

  it('update: без смены активности аудита активности нет', async () => {
    const { service, audit } = setup();
    await service.update('p1', { name: 'Новое' }, 'admin1');
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('remove: есть заказы — деактивация, не удаление', async () => {
    const { service, prisma, audit } = setup();
    (prisma.orderItem.count as jest.Mock).mockResolvedValue(3);
    await expect(service.remove('p1', 'admin1')).resolves.toEqual({
      mode: 'deactivated',
    });
    expect(prisma.product.delete).not.toHaveBeenCalled();
    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'store.product.deactivated_instead_of_delete',
      }),
    );
  });

  it('remove: без заказов — жёсткое удаление в транзакции', async () => {
    const { service, prisma } = setup();
    await expect(service.remove('p1', 'admin1')).resolves.toEqual({
      mode: 'deleted',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // Блокировка строки до проверок, удаление — внутри той же транзакции.
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.cartItem.deleteMany).toHaveBeenCalled();
    expect(prisma.wishlistItem.deleteMany).toHaveBeenCalled();
    expect(prisma.product.delete).toHaveBeenCalled();
  });

  it('remove: проверка заказов внутри транзакции (не через прямой клиент)', async () => {
    const { service, prisma } = setup();
    (prisma.$transaction as jest.Mock).mockImplementation(
      (cb: (tx: unknown) => unknown) =>
        cb({
          ...prisma,
          orderItem: { count: jest.fn().mockResolvedValue(1) },
          product: { update: jest.fn(), delete: jest.fn() },
        }),
    );
    await expect(service.remove('p1', 'admin1')).resolves.toEqual({
      mode: 'deactivated',
    });
    expect(prisma.orderItem.count).not.toHaveBeenCalled();
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('remove: товар в наборе — 409 PRODUCT_IN_BUNDLE, ничего не удалено', async () => {
    const { service, prisma } = setup();
    (prisma.bundleItem.count as jest.Mock).mockResolvedValue(1);
    await expect(service.remove('p1', 'admin1')).rejects.toMatchObject({
      response: { code: 'PRODUCT_IN_BUNDLE' },
    });
    await expect(service.remove('p1', 'admin1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.product.delete).not.toHaveBeenCalled();
    expect(prisma.cartItem.deleteMany).not.toHaveBeenCalled();
  });

  it('updateVariant: изменение цены — аудит было → стало', async () => {
    const { service, prisma, audit } = setup();
    (prisma.productVariant.findUnique as jest.Mock).mockResolvedValue(
      variantRow('100'),
    );
    (prisma.productVariant.update as jest.Mock).mockResolvedValue(
      variantRow('89.5'),
    );
    await service.updateVariant('p1', 'v1', { price: '89.5' }, 'admin1');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'store.product.variant_price_changed',
        severity: 'warning',
        changes: expect.objectContaining({
          price: { from: '100.00', to: '89.50' },
        }),
      }),
    );
  });

  it('updateVariant: цена та же ("100" и "100.00") — аудита нет', async () => {
    const { service, prisma, audit } = setup();
    (prisma.productVariant.findUnique as jest.Mock).mockResolvedValue(
      variantRow('100'),
    );
    (prisma.productVariant.update as jest.Mock).mockResolvedValue(
      variantRow('100'),
    );
    await service.updateVariant('p1', 'v1', { price: '100.00' }, 'admin1');
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('removeVariant: есть заказы — деактивация варианта', async () => {
    const { service, prisma } = setup();
    (prisma.productVariant.findUnique as jest.Mock).mockResolvedValue(
      variantRow('100'),
    );
    (prisma.orderItem.count as jest.Mock).mockResolvedValue(2);
    await expect(service.removeVariant('p1', 'v1', 'admin1')).resolves.toEqual({
      mode: 'deactivated',
    });
    expect(prisma.productVariant.delete).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('removeVariant: вариант в наборе (BundleItem.variantId без FK) — 409 VARIANT_IN_BUNDLE', async () => {
    const { service, prisma } = setup();
    (prisma.productVariant.findUnique as jest.Mock).mockResolvedValue(
      variantRow('100'),
    );
    (prisma.bundleItem.count as jest.Mock).mockResolvedValue(1);
    await expect(
      service.removeVariant('p1', 'v1', 'admin1'),
    ).rejects.toMatchObject({ response: { code: 'VARIANT_IN_BUNDLE' } });
    expect(prisma.bundleItem.count).toHaveBeenCalledWith({
      where: { variantId: 'v1' },
    });
    expect(prisma.productVariant.delete).not.toHaveBeenCalled();
    expect(prisma.cartItem.deleteMany).not.toHaveBeenCalled();
  });

  it('removeVariant: без заказов и наборов — удаление в транзакции', async () => {
    const { service, prisma } = setup();
    (prisma.productVariant.findUnique as jest.Mock).mockResolvedValue(
      variantRow('100'),
    );
    await expect(service.removeVariant('p1', 'v1', 'admin1')).resolves.toEqual({
      mode: 'deleted',
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.productVariant.delete).toHaveBeenCalled();
  });
});
