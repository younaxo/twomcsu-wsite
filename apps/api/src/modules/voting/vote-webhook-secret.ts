import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcrypt';

/// Формат хранения без миграции схемы: `sha256$<hex>` (секрет — 32 случайных
/// байта, стойкость даёт энтропия, медленный хеш не нужен) либо прежний bcrypt.
/// Старые bcrypt-секреты принимаются и лениво переводятся в sha256 после
/// первой успешной проверки.
/// F1: секрет всегда генерирует сервер (randomBytes(32) = 256 бит, ручного ввода
/// в DTO нет), поэтому pepper/HMAC и медленный хеш не нужны: утечка хеша не
/// даёт перебора при такой энтропии. Если когда-либо появится ручной ввод —
/// перейти на HMAC-SHA256 с VOTING_WEBHOOK_PEPPER.
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

/// Фиктивный sha256-хеш случайной строки: сравнение для неизвестного/выключенного
/// slug идёт тем же быстрым кодом (equalSha256), что и для известного.
const DUMMY_SHA256 = sha256Hash(`dummy-${randomBytes(16).toString('hex')}`);

/// Сравнение в постоянное время. stored === null — сайта нет/выключен:
/// выполняется фиктивное sha256-сравнение (тот же код-путь, что у sha256-записи) и всегда false. Ошибка формата хеша
/// трактуется как «не совпало».
export async function verifyWebhookSecret(
  secret: string,
  stored: string | null,
): Promise<boolean> {
  try {
    if (stored === null) {
      equalSha256(secret, DUMMY_SHA256);
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
