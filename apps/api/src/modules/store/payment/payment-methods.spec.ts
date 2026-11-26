import {
  PAYMENT_METHODS_PATTERN,
  parsePaymentMethodRoutes,
} from './payment-methods';

describe('parsePaymentMethodRoutes (0.8b)', () => {
  it('пусто и undefined — нет способов', () => {
    expect(parsePaymentMethodRoutes('')).toEqual([]);
    expect(parsePaymentMethodRoutes(undefined)).toEqual([]);
    expect(parsePaymentMethodRoutes(null)).toEqual([]);
  });

  it('разбирает пары способ:провайдер в порядке записи', () => {
    expect(
      parsePaymentMethodRoutes(' SBP:mock-ru , CRYPTO:mock-crypto '),
    ).toEqual([
      { method: 'SBP', provider: 'mock-ru' },
      { method: 'CRYPTO', provider: 'mock-crypto' },
    ]);
  });

  it('отбрасывает неизвестные, пустые, битые и повторные записи', () => {
    expect(
      parsePaymentMethodRoutes(
        'BITCOIN:mock-crypto,SBP,:mock-ru,SBP:,SBP:a:b,SBP:mock-ru,SBP:other,CARD_RU:BAD_NAME',
      ),
    ).toEqual([{ method: 'SBP', provider: 'mock-ru' }]);
  });

  it('PAYMENT_METHODS_PATTERN для Joi', () => {
    expect(PAYMENT_METHODS_PATTERN.test('')).toBe(true);
    expect(PAYMENT_METHODS_PATTERN.test('SBP:mock-ru,CRYPTO:mock-crypto')).toBe(
      true,
    );
    expect(PAYMENT_METHODS_PATTERN.test('SBP')).toBe(false);
    expect(PAYMENT_METHODS_PATTERN.test('BTC:x')).toBe(false);
    expect(PAYMENT_METHODS_PATTERN.test('SBP:mock-ru,')).toBe(false);
  });
});
