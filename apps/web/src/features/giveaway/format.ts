/// Форматирование и нормализация для страницы розыгрыша. Все даты — по МСК.

const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]{16}$/;

/// Нормализация ввода по ADR-G002 п. 2.2: верхний регистр, без `-` и пробелов,
/// `O -> 0`, `I, L -> 1`.
export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]+/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

export function isValidCode(input: string): boolean {
  return CROCKFORD.test(normalizeCode(input));
}

/// Показ кода: `XXXX-XXXX-XXXX-XXXX`. Невалидное значение возвращается как есть.
export function formatCode(input: string): string {
  const normalized = normalizeCode(input);
  if (!CROCKFORD.test(normalized)) return input;
  return normalized.match(/.{4}/g)!.join('-');
}

const mskDate = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/// «22 ноября 2026 г. в 00:00 по МСК».
export function formatMsk(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${mskDate.format(date)} по МСК`;
}

const mskTime = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  hour: '2-digit',
  minute: '2-digit',
});

/// «10:10 по МСК».
export function formatMskTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${mskTime.format(date)} по МСК`;
}

export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function splitCountdown(ms: number): Countdown {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/// «09:41» для таймера жизни кода.
export function formatMmSs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export const pluralDays = (n: number) => plural(n, 'день', 'дня', 'дней');
export const pluralHours = (n: number) => plural(n, 'час', 'часа', 'часов');
export const pluralMinutes = (n: number) => plural(n, 'минута', 'минуты', 'минут');

/// «28 ч 30 мин», «50 ч», «45 мин». Отрицательные и нечисловые значения - 0 мин.
export function formatDuration(totalMinutes: number): string {
  const total = Number.isFinite(totalMinutes) ? Math.max(0, Math.floor(totalMinutes)) : 0;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} мин`;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}
