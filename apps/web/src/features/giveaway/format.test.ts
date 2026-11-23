import { describe, expect, it } from 'vitest';
import {
  formatCode,
  formatDuration,
  formatMmSs,
  formatMsk,
  formatMskTime,
  isValidCode,
  normalizeCode,
  splitCountdown,
} from './format';

describe('нормализация кода (ADR-G002 п. 2.2)', () => {
  it('убирает дефисы и пробелы, приводит к верхнему регистру', () => {
    expect(normalizeCode(' abcd-efgh jkmn-pqrs ')).toBe('ABCDEFGHJKMNPQRS');
  });
  it('заменяет O на 0, I и L на 1', () => {
    expect(normalizeCode('oilO')).toBe('0110');
  });
  it('валидирует алфавит Crockford (без U) и длину 16', () => {
    expect(isValidCode('ABCD-EFGH-JKMN-PQRS')).toBe(true);
    expect(isValidCode('abcdefghjkmnpqrs')).toBe(true);
    expect(isValidCode('ABCD-EFGH-JKMN-PQRU')).toBe(false);
    expect(isValidCode('ABCD')).toBe(false);
  });
  it('форматирует по четыре символа', () => {
    expect(formatCode('abcdefghjkmnpqrs')).toBe('ABCD-EFGH-JKMN-PQRS');
    expect(formatCode('не код')).toBe('не код');
  });
});

describe('даты по МСК', () => {
  it('показывает московское время и подпись «по МСК»', () => {
    // 21:00 UTC 21 ноября = 00:00 МСК 22 ноября.
    const text = formatMsk('2026-11-21T21:00:00.000Z');
    expect(text).toContain('22 ноября 2026');
    expect(text).toContain('00:00');
    expect(text.endsWith('по МСК')).toBe(true);
  });
  it('не зависит от часового пояса окружения', () => {
    expect(formatMskTime('2026-11-22T10:10:00.000Z')).toContain('13:10');
  });
  it('пустая строка для неверной даты', () => {
    expect(formatMsk('мусор')).toBe('');
  });
});

describe('время', () => {
  it('раскладывает обратный отсчёт', () => {
    expect(splitCountdown(((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000)).toEqual({
      days: 2,
      hours: 3,
      minutes: 4,
      seconds: 5,
    });
    expect(splitCountdown(-5)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });
  it('форматирует таймер кода', () => {
    expect(formatMmSs(600_000)).toBe('10:00');
    expect(formatMmSs(61_000)).toBe('01:01');
    expect(formatMmSs(-1)).toBe('00:00');
  });
});

describe('formatDuration', () => {
  it('часы и минуты', () => {
    expect(formatDuration(1710)).toBe('28 ч 30 мин');
    expect(formatDuration(3000)).toBe('50 ч');
    expect(formatDuration(45)).toBe('45 мин');
    expect(formatDuration(0)).toBe('0 мин');
    expect(formatDuration(-5)).toBe('0 мин');
    expect(formatDuration(Number.NaN)).toBe('0 мин');
  });
});
