import { randomInt } from 'crypto';

/// Резервные коды 2FA (ADR-0109): 10 одноразовых кодов `xxxx-xxxx` из
/// алфавита без похожих символов (нет 0/o, 1/l/i) — ≈ 41 бит на код. Сервер
/// хранит только HMAC-хеш нормализованного значения.

export const BACKUP_CODE_COUNT = 10;
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function generateBackupCodes(count = BACKUP_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    let raw = '';
    for (let index = 0; index < 8; index += 1) {
      raw += ALPHABET[randomInt(ALPHABET.length)];
    }
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
}

/// Ввод пользователя → каноническая форма: регистр, пробелы и дефисы не важны.
export function normalizeBackupCode(input: string): string | null {
  const value = input.toLowerCase().replace(/[\s-]/g, '');
  return /^[a-z0-9]{8}$/.test(value) ? value : null;
}
