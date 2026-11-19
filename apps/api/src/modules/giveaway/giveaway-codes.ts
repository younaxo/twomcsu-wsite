import { randomBytes, randomInt } from 'crypto';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  TICKET_LETTERS,
} from './giveaway.constants';

/// Чистые функции кодов и билетов (ADR-G002 п. 2, 7). Без зависимостей от Nest.

const CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{16}$/;

/// 16 символов из 32-символьного алфавита: из каждого байта берутся младшие
/// 5 бит (256 кратно 32, смещения нет), 80 бит энтропии.
export function generateCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] & 31];
  return out;
}

/// `XXXX-XXXX-XXXX-XXXX`.
export function formatCode(code: string): string {
  return code.match(/.{4}/g)?.join('-') ?? code;
}

/// Нормализация ввода игрока: регистр, `-`/пробелы, правила Crockford
/// (O -> 0, I/L -> 1). `null`, если после этого код не 16 символов алфавита.
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 64) return null;
  const s = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  return CODE_PATTERN.test(s) ? s : null;
}

/// Фиксированная строка для неверного формата: хэш считается всегда, чтобы
/// ветви не различались по времени.
export const DUMMY_CODE = '0'.repeat(CODE_LENGTH);

/// Буква без I и O + три цифры, CSPRNG без смещения (`randomInt`).
export function generateTicket(): string {
  const letter = TICKET_LETTERS[randomInt(TICKET_LETTERS.length)];
  const digits = String(randomInt(1000)).padStart(3, '0');
  return `${letter}${digits}`;
}

/// Токен ссылки отслеживания: 24 байта CSPRNG, base64url (32 символа).
export function generateTrackingToken(): string {
  return randomBytes(24).toString('base64url');
}
