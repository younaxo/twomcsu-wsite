import { createHash, createHmac, hkdfSync, timingSafeEqual } from 'crypto';
import { GIVEAWAY_SIGNATURE_PREFIX } from './giveaway.constants';

export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function formatKeyId(serverId: string, version: number): string {
  return `${serverId}.${version}`;
}

export function parseKeyId(
  keyId: string,
): { serverId: string; version: number } | null {
  const dot = keyId.lastIndexOf('.');
  if (dot <= 0) return null;
  const ver = keyId.slice(dot + 1);
  if (!/^[1-9][0-9]{0,5}$/.test(ver)) return null;
  return { serverId: keyId.slice(0, dot), version: Number(ver) };
}

/// `ключ = HKDF-SHA256(мастер, соль = id сервера, info = "twomc-giveaway" 0x00
/// "v1" 0x00 u32be(версия))`, 32 байта.
export function deriveServerKey(
  masterSecret: Buffer,
  serverId: string,
  version: number,
): Buffer {
  if (masterSecret.length === 0) throw new Error('empty master secret');
  const ver = Buffer.alloc(4);
  ver.writeUInt32BE(version, 0);
  const info = Buffer.concat([
    Buffer.from('twomc-giveaway', 'utf8'),
    Buffer.from([0]),
    Buffer.from('v1', 'utf8'),
    Buffer.from([0]),
    ver,
  ]);
  return Buffer.from(
    hkdfSync('sha256', masterSecret, Buffer.from(serverId, 'utf8'), info, 32),
  );
}

export interface SignInput {
  keyId: string;
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  body: Buffer;
}

export function buildCanonical(input: SignInput): string {
  return [
    GIVEAWAY_SIGNATURE_PREFIX,
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

/// Сравнение за постоянное время.
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
