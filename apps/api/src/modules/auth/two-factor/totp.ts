import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/// TOTP по RFC 6238 (HMAC-SHA1, шаг 30 с, 6 цифр) — совместимо с Google
/// Authenticator, Aegis, 1Password и др. Без внешних зависимостей: только
/// `crypto`. Base32 — RFC 4648 без padding (так его ждут приложения).

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
/// Допуск рассинхронизации часов: ±1 шаг (±30 с).
export const TOTP_WINDOW = 1;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error('invalid base32');
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/// Новый секрет: 20 случайных байт (160 бит, как рекомендует RFC 4226).
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

/// Код для шага времени (HOTP с counter = step).
export function hotp(
  secret: Buffer,
  counter: number,
  digits = TOTP_DIGITS,
): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

function sameCode(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/// Проверяет код в окне ±`TOTP_WINDOW` шагов. Возвращает принятый шаг или
/// null. Шаг ≤ `lastStep` не принимается — один код нельзя использовать дважды
/// (повтор перехваченного кода).
export function verifyTotp(
  secretBase32: string,
  code: string,
  nowMs: number,
  lastStep: number | null = null,
): number | null {
  const normalized = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return null;
  const secret = base32Decode(secretBase32);
  const current = totpStep(nowMs);
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta += 1) {
    const step = current + delta;
    if (lastStep !== null && step <= lastStep) continue;
    if (sameCode(hotp(secret, step), normalized)) return step;
  }
  return null;
}

/// URI для QR-кода приложения-аутентификатора (Key Uri Format).
export function otpauthUri(
  issuer: string,
  account: string,
  secretBase32: string,
): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
