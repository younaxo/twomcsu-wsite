import { createHash, timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcrypt';

/// Формат хранения без миграции схемы: `sha256$<hex>` (секрет — 32 случайных
/// байта, стойкость даёт энтропия, медленный хеш не нужен) либо прежний bcrypt.
/// Старые bcrypt-секреты принимаются и лениво переводятся в sha256 после
/// первой успешной проверки.
export const SHA256_PREFIX = 'sha256$';
export const MAX_SECRET_LENGTH = 500;

export function sha256Hash(secret: string): string {
  return SHA256_PREFIX + createHash('sha256').update(secret).digest('hex');
}

function equalSha256(secret: string, stored: string): boolean {
  const expected = Buffer.from(stored.slice(SHA256_PREFIX.length), 'hex');
  const actual = createHash('sha256').update(secret).digest();
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

let dummyHash: Promise<string> | null = null;
/// bcrypt-хеш случайной строки (rounds как у боевых): фиктивное сравнение для
/// неизвестного slug выравнивает время ответа.
function dummyBcryptHash(rounds: number): Promise<string> {
  dummyHash ??= bcrypt.hash(`dummy-${Math.random()}-${Date.now()}`, rounds);
  return dummyHash;
}

/// Сравнение в постоянное время. stored === null — сайта нет/выключен:
/// выполняется фиктивное bcrypt-сравнение и всегда false. Ошибка формата хеша
/// трактуется как «не совпало».
export async function verifyWebhookSecret(
  secret: string,
  stored: string | null,
  rounds = 12,
): Promise<boolean> {
  try {
    if (stored === null) {
      await bcrypt.compare(secret, await dummyBcryptHash(rounds));
      return false;
    }
    if (stored.startsWith(SHA256_PREFIX)) {
      return equalSha256(secret, stored);
    }
    return await bcrypt.compare(secret, stored);
  } catch {
    return false;
  }
}
