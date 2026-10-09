/// Форматирование дат/чисел через Intl (ru-RU) — без ручных масок.
const LOCALE = 'ru-RU';

const dateTime = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const dateOnly = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const number = new Intl.NumberFormat(LOCALE);

const money = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 2,
});

const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });

function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }
  return dateTime.format(toDate(value));
}

export function formatDate(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }
  return dateOnly.format(toDate(value));
}

export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  return number.format(typeof value === 'string' ? Number(value) : value);
}

/// Prisma Decimal приходит строкой — форматируем как рубли.
export function formatMoney(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  return money.format(typeof value === 'string' ? Number(value) : value);
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 1000 * 60 * 60 * 24 * 365],
  ['month', 1000 * 60 * 60 * 24 * 30],
  ['day', 1000 * 60 * 60 * 24],
  ['hour', 1000 * 60 * 60],
  ['minute', 1000 * 60],
];

export function formatRelative(value: string | number | Date, now: Date = new Date()): string {
  const diff = toDate(value).getTime() - now.getTime();
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(diff) >= ms) {
      return relative.format(Math.round(diff / ms), unit);
    }
  }
  return relative.format(0, 'second');
}

const pluralRules = new Intl.PluralRules(LOCALE);

/// Русские формы по количеству: plural(5, { one: 'игрок', few: 'игрока', many: 'игроков' }).
export function plural(count: number, forms: { one: string; few: string; many: string }): string {
  const category = pluralRules.select(count);
  if (category === 'one') {
    return forms.one;
  }
  if (category === 'few') {
    return forms.few;
  }
  return forms.many;
}
