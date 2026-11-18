import { createHash, createHmac, hkdfSync, timingSafeEqual } from 'crypto';
import { BRIDGE_SIGNATURE_PREFIX } from './bridge.constants';

/// Общая функция подписи и вывода ключа (2.2 и 2.4 контракта). Её же
/// использует симулятор плагина (без копии логики), а независимая реализация
/// эталонного вектора лежит только в контрактном тесте.

export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/// `key-id` = `<slug>.<поколение>`.
export function formatKeyId(slug: string, generation: number): string {
  return `${slug}.${generation}`;
}

export interface ParsedKeyId {
  slug: string;
  generation: number;
}

/// Разбор после проверки формата. Поколение — целое от 1 без ведущих нулей.
export function parseKeyId(keyId: string): ParsedKeyId | null {
  const dot = keyId.lastIndexOf('.');
  if (dot <= 0) return null;
  const slug = keyId.slice(0, dot);
  const gen = keyId.slice(dot + 1);
  if (!/^[1-9][0-9]{0,5}$/.test(gen)) return null;
  return { slug, generation: Number(gen) };
}

/// `ключ_сервера = HKDF-SHA256(мастер, соль = slug, info = "twomc-bridge" 0x00
/// "v1" 0x00 u32be(поколение))`, 32 байта. Мастер-секрет — байты строки UTF-8.
export function deriveServerKey(
  masterSecret: Buffer,
  slug: string,
  generation: number,
): Buffer {
  if (masterSecret.length === 0) throw new Error('empty master secret');
  const gen = Buffer.alloc(4);
  gen.writeUInt32BE(generation, 0);
  const info = Buffer.concat([
    Buffer.from('twomc-bridge', 'utf8'),
    Buffer.from([0]),
    Buffer.from('v1', 'utf8'),
    Buffer.from([0]),
    gen,
  ]);
  return Buffer.from(
    hkdfSync('sha256', masterSecret, Buffer.from(slug, 'utf8'), info, 32),
  );
}

export interface SignInput {
  keyId: string;
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  /// Сырое тело; для запроса без тела — пустой буфер.
  body: Buffer;
}

export function buildCanonical(input: SignInput): string {
  return [
    BRIDGE_SIGNATURE_PREFIX,
    input.keyId,
    input.timestamp,
    input.nonce,
    input.method,
    input.path,
    sha256Hex(input.body),
  ].join('\n');
}

export function signRequest(key: Buffer, input: SignInput): string {
  if (key.length === 0) throw new Error('empty key');
  return createHmac('sha256', key).update(buildCanonical(input)).digest('hex');
}

/// Сравнение за постоянное время. Формат (64 hex) проверен заранее, но
/// функция сама защищена от буферов разной длины.
export function verifySignature(
  key: Buffer,
  input: SignInput,
  signatureHex: string,
): boolean {
  if (key.length === 0 || !/^[0-9a-fA-F]{64}$/.test(signatureHex)) return false;
  const expected = Buffer.from(signRequest(key, input), 'hex');
  const actual = Buffer.from(signatureHex, 'hex');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/// Каноническая сериализация (5.2): без пробелов, ключи объектов на всех
/// уровнях в порядке кодовых единиц UTF-16 (как сравнение строк в JS),
/// порядок элементов массивов сохраняется. Только JSON-значения.
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) throw new Error('non-finite number');
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
      }
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      const parts: string[] = [];
      for (const k of keys) {
        if (obj[k] === undefined) continue;
        parts.push(`${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
      }
      return `{${parts.join(',')}}`;
    }
    default:
      throw new Error('unsupported value');
  }
}

/// `payloadHash` = SHA-256 (hex) канонического JSON только поля `data`.
export function payloadHash(data: unknown): string {
  return sha256Hex(canonicalJson(data));
}
