import { randomInt } from 'crypto';

/// Форматы кодов привязки Minecraft (A12). `X` — латинская буква A–Z, `0` —
/// цифра 0–9, `-` — разделитель. Web повторяет эти правила для ввода
/// (`apps/web/src/lib/auth/minecraft-code.ts`) — api не импортирует shared.
///
/// - Код привязки (страница ссылки → регистрация): `XXX-000-X0X0-0X0` —
///   13 значимых символов + 3 дефиса = 16 в отображаемой строке.
/// - Код подтверждения (сайт → ввод в игре): `X0XX0` — 5 символов.
export const LINK_CODE_PATTERN = 'XXX-000-X0X0-0X0';
export const CHALLENGE_PATTERN = 'X0XX0';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';

/// Криптостойкий код по шаблону (randomInt без смещения).
export function generateByPattern(pattern: string): string {
  let out = '';
  for (const slot of pattern) {
    if (slot === 'X') out += LETTERS[randomInt(0, LETTERS.length)];
    else if (slot === '0') out += DIGITS[randomInt(0, DIGITS.length)];
    else out += slot;
  }
  return out;
}

/// Ввод → значимые символы: верхний регистр, без пробелов и дефисов.
export function normalizeCode(raw: string): string {
  return raw.replace(/[\s-]+/g, '').toUpperCase();
}

/// Нормализованный код соответствует шаблону (позиции букв и цифр).
export function matchesPattern(code: string, pattern: string): boolean {
  const slots = pattern.replace(/-/g, '');
  if (code.length !== slots.length) return false;
  return [...slots].every((slot, index) => {
    const char = code[index]!;
    return slot === 'X' ? LETTERS.includes(char) : DIGITS.includes(char);
  });
}
