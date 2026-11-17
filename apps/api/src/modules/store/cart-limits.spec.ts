import { HttpException } from '@nestjs/common';
import { assertCartLimits, CartLimitLine } from './cart-limits';
import { toPromoError } from './store-errors';

function line(over: Partial<CartLimitLine> = {}): CartLimitLine {
  return {
    productId: 'p1',
    productName: 'Товар',
    quantity: 1,
    isUnique: false,
    maxPerPurchase: null,
    ...over,
  };
}

function codeOf(fn: () => void): { status: number; code: string } {
  try {
    fn();
  } catch (error) {
    const e = error as HttpException;
    return {
      status: e.getStatus(),
      code: (e.getResponse() as { code: string }).code,
    };
  }
  throw new Error('ожидалась ошибка');
}

describe('assertCartLimits (S1)', () => {
  it('без лимитов любое количество и дубли строк допустимы', () => {
    expect(() =>
      assertCartLimits([line({ quantity: 50 }), line({ quantity: 50 })]),
    ).not.toThrow();
  });

  it('maxPerPurchase суммируется по всем строкам одного товара', () => {
    const ok = [line({ quantity: 2, maxPerPurchase: 3 })];
    expect(() => assertCartLimits(ok)).not.toThrow();
    const over = [
      line({ quantity: 2, maxPerPurchase: 3 }),
      line({ quantity: 2, maxPerPurchase: 3 }),
    ];
    expect(codeOf(() => assertCartLimits(over))).toEqual({
      status: 400,
      code: 'CART_MAX_PER_PURCHASE',
    });
  });

  it('лимит одного товара не затрагивает другой товар', () => {
    expect(() =>
      assertCartLimits([
        line({ quantity: 3, maxPerPurchase: 3 }),
        line({ productId: 'p2', quantity: 9 }),
      ]),
    ).not.toThrow();
  });

  it('уникальный товар: одна штука и одна строка, иначе 409', () => {
    expect(() =>
      assertCartLimits([line({ isUnique: true, quantity: 1 })]),
    ).not.toThrow();
    const expected = { status: 409, code: 'CART_UNIQUE_DUPLICATE' };
    expect(
      codeOf(() => assertCartLimits([line({ isUnique: true, quantity: 2 })])),
    ).toEqual(expected);
    expect(
      codeOf(() =>
        assertCartLimits([line({ isUnique: true }), line({ isUnique: true })]),
      ),
    ).toEqual(expected);
  });

  it('наборы (без productId) лимитами не ограничиваются', () => {
    expect(() =>
      assertCartLimits([
        line({ productId: null, quantity: 9, isUnique: true }),
      ]),
    ).not.toThrow();
  });
});

describe('toPromoError', () => {
  it('распознаёт только отказы с кодом PROMO_*', () => {
    expect(
      toPromoError(
        new HttpException({ code: 'PROMO_EXPIRED', message: 'истёк' }, 400),
      ),
    ).toEqual({ code: 'PROMO_EXPIRED', message: 'истёк' });
    expect(
      toPromoError(new HttpException({ code: 'CART_X', message: 'x' }, 400)),
    ).toBeNull();
    expect(toPromoError(new Error('boom'))).toBeNull();
  });
});
