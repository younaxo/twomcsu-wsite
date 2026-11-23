import { createHash, randomBytes } from 'crypto';

/// Секретный токен гостевого заказа (0.12a, ADR-0186 п. 3-4, ADR-0190).
/// 32 байта CSPRNG (256 бит, не менее 128), base64url; в БД только SHA-256-хеш.
export const GUEST_TOKEN_BYTES = 32;
/// Срок жизни токена (ADR-0186 п. 3): 30 дней.
export const GUEST_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/// base64url от 32 байт — 43 символа; нижняя граница защищает от мусора.
export const GUEST_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,128}$/;

export function generateGuestToken(): string {
  return randomBytes(GUEST_TOKEN_BYTES).toString('base64url');
}

export function hashGuestToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function guestTokenExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + GUEST_TOKEN_TTL_MS);
}
