import {
  dateToUpperBound,
  isDateRangeInverted,
  parseDateRange,
} from './date-range.util';

describe('date-range.util', () => {
  it('дата без времени в dateTo — конец суток UTC', () => {
    expect(dateToUpperBound('2026-11-18').toISOString()).toBe(
      '2026-11-18T23:59:59.999Z',
    );
  });

  it('полный ISO-момент не меняется', () => {
    expect(dateToUpperBound('2026-11-18T10:00:00.000Z').toISOString()).toBe(
      '2026-11-18T10:00:00.000Z',
    );
  });

  it('parseDateRange: пусто → undefined; заказ последнего дня попадает', () => {
    expect(parseDateRange()).toBeUndefined();
    const range = parseDateRange('2026-11-18', '2026-11-18');
    const lastDayOrder = new Date('2026-11-18T22:30:00.000Z');
    expect(range?.gte && lastDayOrder >= range.gte).toBe(true);
    expect(range?.lte && lastDayOrder <= range.lte).toBe(true);
  });

  it('isDateRangeInverted', () => {
    expect(isDateRangeInverted('2026-11-18', '2026-11-18')).toBe(false);
    expect(isDateRangeInverted('2026-11-19', '2026-11-18')).toBe(true);
    expect(isDateRangeInverted(undefined, '2026-11-18')).toBe(false);
  });
});
