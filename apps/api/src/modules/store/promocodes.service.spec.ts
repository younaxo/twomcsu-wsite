import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma } from '@prisma/client';
import { CreateLoyaltyDiscountDto } from './dto/create-loyalty-discount.dto';
import { CreatePromoCodeDto } from './dto/create-promo-code.dto';
import { assertDiscountValue } from './discount-validation';
import { DiscountsService } from './discounts.service';
import { PromocodesService } from './promocodes.service';

async function errorsOf<T extends object>(
  cls: new () => T,
  plain: Record<string, unknown>,
) {
  const errors = await validate(plainToInstance(cls, plain));
  return errors.map((e) => e.property);
}

const promoRow = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  code: 'SALE',
  discountType: 'PERCENT',
  discountValue: new Prisma.Decimal('10'),
  maxUses: null,
  usedCount: 3,
  validFrom: null,
  validUntil: null,
  isActive: true,
  applicableToTypes: [],
  minOrderAmount: null,
  firstPurchaseOnly: false,
  ...over,
});

function setupPromo(row: unknown, orders = 0) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'p1' }]),
    promoCode: {
      findUnique: jest.fn().mockResolvedValue(row),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...(row as object), ...data }),
        ),
      delete: jest.fn().mockResolvedValue({}),
      create: jest.fn(),
    },
    order: { count: jest.fn().mockResolvedValue(orders) },
    cart: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    promoCode: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new PromocodesService(prisma as never, audit as never);
  return { service, tx, audit };
}

describe('DTO скидок и промокодов (0.4)', () => {
  it('промокод: число приводится к Decimal-строке, мусор и отрицательные — ошибка', async () => {
    const base = { code: 'SALE10', discountType: 'PERCENT' };
    expect(
      await errorsOf(CreatePromoCodeDto, { ...base, discountValue: '10.50' }),
    ).toEqual([]);
    expect(
      await errorsOf(CreatePromoCodeDto, { ...base, discountValue: 10 }),
    ).toEqual([]);
    for (const bad of ['-1', 'abc', '1e3', '10.999', '', null, -5]) {
      expect(
        await errorsOf(CreatePromoCodeDto, { ...base, discountValue: bad }),
      ).toContain('discountValue');
    }
  });

  it('лояльность: discountPercent — Decimal-строка', async () => {
    const base = { minPurchases: 1, name: 'n' };
    expect(
      await errorsOf(CreateLoyaltyDiscountDto, {
        ...base,
        discountPercent: '5',
      }),
    ).toEqual([]);
    expect(
      await errorsOf(CreateLoyaltyDiscountDto, {
        ...base,
        discountPercent: 'x',
      }),
    ).toContain('discountPercent');
  });

  it('assertDiscountValue: PERCENT 0 < v <= 100, FIXED > 0', () => {
    expect(() => assertDiscountValue('PERCENT', '100', 'v')).not.toThrow();
    expect(() => assertDiscountValue('PERCENT', '100.01', 'v')).toThrow();
    expect(() => assertDiscountValue('PERCENT', '0', 'v')).toThrow();
    expect(() => assertDiscountValue('FIXED', '500', 'v')).not.toThrow();
    expect(() => assertDiscountValue('FIXED', '0.00', 'v')).toThrow();
  });
});

describe('PromocodesService (0.4)', () => {
  it('update: аудит «было → стало» только по изменённым полям, строгий, в tx', async () => {
    const { service, tx, audit } = setupPromo(promoRow());
    await service.update('p1', { discountValue: '15' }, 'admin1');
    expect(audit.log).toHaveBeenCalledTimes(1);
    const call = audit.log.mock.calls[0][0];
    expect(call).toMatchObject({
      actorId: 'admin1',
      action: 'store.promocode.updated',
      tx,
      strict: true,
    });
    expect(call.changes.from).toEqual({ discountValue: '10.00' });
    expect(call.changes.to).toEqual({ discountValue: '15.00' });
  });

  it('update: PERCENT > 100 — 400, ничего не записано', async () => {
    const { service, tx, audit } = setupPromo(promoRow());
    await expect(
      service.update('p1', { discountValue: '150' }, 'admin1'),
    ).rejects.toMatchObject({ status: 400 });
    expect(tx.promoCode.update).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('update: смена типа на PERCENT проверяет уже сохранённое значение', async () => {
    const { service } = setupPromo(
      promoRow({
        discountType: 'FIXED',
        discountValue: new Prisma.Decimal('500'),
      }),
    );
    await expect(
      service.update('p1', { discountType: 'PERCENT' }, 'admin1'),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('update: validUntil раньше validFrom и maxUses ниже usedCount — 400', async () => {
    const { service } = setupPromo(
      promoRow({ validFrom: new Date('2026-12-01T00:00:00Z') }),
    );
    await expect(
      service.update('p1', { validUntil: '2026-11-01T00:00:00Z' }, 'admin1'),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.update('p1', { maxUses: 2 }, 'admin1'),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('update: без реальных изменений аудит не пишется', async () => {
    const { service, audit } = setupPromo(promoRow());
    await service.update('p1', { isActive: true }, 'admin1');
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('remove: есть заказы — 409, удаление и аудит не выполняются', async () => {
    const { service, tx, audit } = setupPromo(promoRow(), 1);
    await expect(service.remove('p1', 'admin1')).rejects.toMatchObject({
      status: 409,
    });
    expect(tx.promoCode.delete).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('remove: без заказов — корзины очищаются, аудит warning', async () => {
    const { service, tx, audit } = setupPromo(promoRow(), 0);
    await service.remove('p1', 'admin1');
    expect(tx.cart.updateMany).toHaveBeenCalled();
    expect(tx.promoCode.delete).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'store.promocode.deleted',
        severity: 'warning',
        strict: true,
      }),
    );
  });

  it('remove: нет промокода — 404', async () => {
    const { service } = setupPromo(null);
    await expect(service.remove('p1', 'admin1')).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('DiscountsService (0.4)', () => {
  function setup(row: unknown) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'd1' }]),
      bulkDiscount: {
        findUnique: jest.fn().mockResolvedValue(row),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ ...(row as object), ...data }),
          ),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'd1', isActive: true, ...data }),
          ),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      product: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    return {
      service: new DiscountsService(prisma as never, audit as never),
      tx,
      audit,
    };
  }
  const bulkRow = {
    id: 'd1',
    productId: null,
    productType: null,
    minQuantity: 3,
    minAmount: null,
    discountType: 'PERCENT',
    discountValue: new Prisma.Decimal('10'),
    isActive: true,
  };

  it('createBulk: неизвестный товар — 400; PERCENT > 100 — 400', async () => {
    const { service, tx } = setup(bulkRow);
    await expect(
      service.createBulk(
        { productId: 'nope', discountType: 'PERCENT', discountValue: '10' },
        'a',
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.createBulk(
        { discountType: 'PERCENT', discountValue: '101' },
        'a',
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(tx.bulkDiscount.create).not.toHaveBeenCalled();
  });

  it('updateBulk: аудит с было/стало, строгий в tx', async () => {
    const { service, tx, audit } = setup(bulkRow);
    await service.updateBulk('d1', { discountValue: '20' }, 'admin1');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'store.discount.bulk_updated',
        tx,
        strict: true,
        changes: {
          from: { discountValue: '10.00' },
          to: { discountValue: '20.00' },
        },
      }),
    );
  });

  it('removeBulk: нет скидки — 404; есть — аудит удаления', async () => {
    const missing = setup(null);
    await expect(missing.service.removeBulk('d1', 'a')).rejects.toMatchObject({
      status: 404,
    });
    const ok = setup(bulkRow);
    await ok.service.removeBulk('d1', 'a');
    expect(ok.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'store.discount.bulk_deleted' }),
    );
  });
});

describe('скидка 100%: отдельное событие аудита (Q83)', () => {
  const fullEvents = (audit: { log: jest.Mock }) =>
    audit.log.mock.calls
      .map((c) => c[0])
      .filter((c) => String(c.action).endsWith('.full_percent'));

  it('промокод: update до 100% PERCENT — событие warning с «скидка 100%», строгое, в tx', async () => {
    const { service, tx, audit } = setupPromo(promoRow());
    await service.update('p1', { discountValue: '100' }, 'admin1');
    const events = fullEvents(audit);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorId: 'admin1',
      action: 'store.promocode.full_percent',
      targetId: 'p1',
      severity: 'warning',
      tx,
      strict: true,
      changes: expect.objectContaining({ note: 'скидка 100%' }),
    });
  });

  it('промокод: 99.99% и FIXED 100 — события нет', async () => {
    const a = setupPromo(promoRow());
    await a.service.update('p1', { discountValue: '99.99' }, 'admin1');
    const b = setupPromo(promoRow());
    await b.service.update(
      'p1',
      { discountType: 'FIXED', discountValue: '100' } as never,
      'admin1',
    );
    expect(fullEvents(a.audit)).toHaveLength(0);
    expect(fullEvents(b.audit)).toHaveLength(0);
  });

  it('скидка за объём: create 100% PERCENT — событие; FIXED 100 — нет', async () => {
    const make = () => {
      const tx = {
        bulkDiscount: {
          create: jest
            .fn()
            .mockImplementation(({ data }) =>
              Promise.resolve({ id: 'd1', isActive: true, ...data }),
            ),
        },
      };
      const prisma = {
        $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      };
      const audit = { log: jest.fn().mockResolvedValue(undefined) };
      return {
        service: new DiscountsService(prisma as never, audit as never),
        audit,
      };
    };
    const full = make();
    await full.service.createBulk(
      {
        discountType: 'PERCENT',
        discountValue: '100',
        minQuantity: 1,
      } as never,
      'admin1',
    );
    const events = fullEvents(full.audit);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'store.discount.full_percent',
      severity: 'warning',
      changes: expect.objectContaining({ note: 'скидка 100%', kind: 'bulk' }),
    });
    const fixed = make();
    await fixed.service.createBulk(
      { discountType: 'FIXED', discountValue: '100', minQuantity: 1 } as never,
      'admin1',
    );
    expect(fullEvents(fixed.audit)).toHaveLength(0);
  });

  it('лояльность: create 100% — событие', async () => {
    const tx = {
      loyaltyDiscount: {
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'l1', isActive: true, ...data }),
          ),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new DiscountsService(prisma as never, audit as never);
    await service.createLoyalty(
      { minPurchases: 5, discountPercent: '100' } as never,
      'admin1',
    );
    expect(fullEvents(audit)).toHaveLength(1);
  });
});
