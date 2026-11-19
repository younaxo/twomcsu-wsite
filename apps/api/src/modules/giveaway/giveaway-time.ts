import { GIVEAWAY_TIMEZONE } from './giveaway.constants';

/// В БД и API - UTC; для показа игрокам - «по МСК» с явной подписью.
export function formatMsk(date: Date): string {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: GIVEAWAY_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')}.${get('month')}.${get('year')} ${get('hour')}:${get('minute')}:${get('second')} по МСК`;
}

/// Короткая подпись для плагина: «22.11 00:00 по МСК» (без года и секунд).
export function formatMskShort(date: Date): string {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: GIVEAWAY_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')}.${get('month')} ${get('hour')}:${get('minute')} по МСК`;
}

/// Начало минуты (UTC) для корзины.
export function floorToMinute(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 60_000) * 60_000);
}
