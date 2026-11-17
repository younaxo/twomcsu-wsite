import { createHash, createHmac } from 'crypto';
import {
  buildCanonical,
  canonicalJson,
  deriveServerKey,
  formatKeyId,
  parseKeyId,
  payloadHash,
  sha256Hex,
  signRequest,
  verifySignature,
} from './bridge-crypto';
import { SLUG_PATTERN, isValidSlug } from './bridge.constants';
import { TEST_MASTER } from '../../../test/support/bridge-support';

// Эталонный вектор из раздела 2.2 BRIDGE-CONTRACT.md (тестовый ключ).
const VECTOR_KEY = 'example-secret-not-for-production-use-0123456789';
const VECTOR_BODY =
  '{"schema":"twomc.bridge.v1","sentAt":"2026-11-17T12:00:00.000Z","events":[{"eventId":"0193f0a2-7c1e-7000-8000-000000000001","type":"bridge.hello","serverId":"survival","streamId":"boot-0001","seq":1,"occurredAt":"2026-11-17T12:00:00.000Z","data":{"pluginVersion":"0.0.0-example","platform":"example"}}]}';
const VECTOR_BODY_SHA =
  '948f3c8711ceacb9257f84d3f4037387f1a7008fd2f5239cf72c2bb4d4fd9ad5';
const VECTOR_SIGNATURE =
  '9cbc99b98b00133f034fd5d058bdaff1818f54fa3003c074d14823f2dd80c2fc';

describe('контрактный вектор подписи (2.2)', () => {
  it('независимая реализация в тесте воспроизводит эталон', () => {
    // Намеренно без функций модуля: строка и HMAC собираются здесь.
    const bodyHash = createHash('sha256')
      .update(VECTOR_BODY, 'utf8')
      .digest('hex');
    expect(bodyHash).toBe(VECTOR_BODY_SHA);
    const canonical =
      'twomc-bridge-v1\n' +
      'survival.1\n' +
      '1794916800\n' +
      'AAAAAAAAAAAAAAAAAAAAAA\n' +
      'POST\n' +
      '/bridge/v1/events\n' +
      bodyHash;
    const signature = createHmac('sha256', VECTOR_KEY)
      .update(canonical, 'utf8')
      .digest('hex');
    expect(signature).toBe(VECTOR_SIGNATURE);
  });

  it('общая функция модуля даёт тот же результат', () => {
    const input = {
      keyId: 'survival.1',
      timestamp: '1794916800',
      nonce: 'AAAAAAAAAAAAAAAAAAAAAA',
      method: 'POST',
      path: '/bridge/v1/events',
      body: Buffer.from(VECTOR_BODY, 'utf8'),
    };
    expect(sha256Hex(input.body)).toBe(VECTOR_BODY_SHA);
    expect(buildCanonical(input).split('\n')).toHaveLength(7);
    const key = Buffer.from(VECTOR_KEY, 'utf8');
    expect(signRequest(key, input)).toBe(VECTOR_SIGNATURE);
    expect(verifySignature(key, input, VECTOR_SIGNATURE)).toBe(true);
    expect(verifySignature(key, input, VECTOR_SIGNATURE.toUpperCase())).toBe(
      true,
    );
  });

  it('изменение любого компонента ломает подпись', () => {
    const key = Buffer.from(VECTOR_KEY, 'utf8');
    const base = {
      keyId: 'survival.1',
      timestamp: '1794916800',
      nonce: 'AAAAAAAAAAAAAAAAAAAAAA',
      method: 'POST',
      path: '/bridge/v1/events',
      body: Buffer.from(VECTOR_BODY, 'utf8'),
    };
    const variants = [
      { ...base, keyId: 'survival.2' },
      { ...base, timestamp: '1794916801' },
      { ...base, nonce: 'AAAAAAAAAAAAAAAAAAAAAB' },
      { ...base, method: 'GET' },
      { ...base, path: '/bridge/v1/handshake' },
      { ...base, body: Buffer.from(`${VECTOR_BODY} `, 'utf8') },
    ];
    for (const v of variants) {
      expect(verifySignature(key, v, VECTOR_SIGNATURE)).toBe(false);
    }
  });

  it('пустой ключ и неверный формат подписи - всегда отказ', () => {
    const input = {
      keyId: 'survival.1',
      timestamp: '1794916800',
      nonce: 'AAAAAAAAAAAAAAAAAAAAAA',
      method: 'GET',
      path: '/bridge/v1/handshake',
      body: Buffer.alloc(0),
    };
    expect(() => signRequest(Buffer.alloc(0), input)).toThrow();
    expect(verifySignature(Buffer.alloc(0), input, VECTOR_SIGNATURE)).toBe(
      false,
    );
    expect(verifySignature(Buffer.from(VECTOR_KEY), input, 'abcd')).toBe(false);
  });

  it('запрос без тела хэшируется от пустой строки', () => {
    expect(sha256Hex(Buffer.alloc(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});

describe('вывод ключа сервера (2.4)', () => {
  /// Независимая реализация HKDF-SHA256 (RFC 5869) для 32 байт.
  function hkdf32(ikm: Buffer, salt: Buffer, info: Buffer): Buffer {
    const prk = createHmac('sha256', salt).update(ikm).digest();
    return createHmac('sha256', prk)
      .update(Buffer.concat([info, Buffer.from([1])]))
      .digest();
  }

  it('совпадает с независимой реализацией: соль = slug, info по контракту', () => {
    const gen = Buffer.alloc(4);
    gen.writeUInt32BE(3, 0);
    const info = Buffer.concat([
      Buffer.from('twomc-bridge'),
      Buffer.from([0]),
      Buffer.from('v1'),
      Buffer.from([0]),
      gen,
    ]);
    const expected = hkdf32(TEST_MASTER, Buffer.from('survival'), info);
    expect(deriveServerKey(TEST_MASTER, 'survival', 3).equals(expected)).toBe(
      true,
    );
  });

  it('разные slug и поколения дают разные ключи', () => {
    const a = deriveServerKey(TEST_MASTER, 'survival', 1);
    expect(a).toHaveLength(32);
    expect(a.equals(deriveServerKey(TEST_MASTER, 'survival', 2))).toBe(false);
    expect(a.equals(deriveServerKey(TEST_MASTER, 'creative', 1))).toBe(false);
    expect(a.equals(deriveServerKey(TEST_MASTER, 'survival', 1))).toBe(true);
  });

  it('пустой мастер-секрет отвергается', () => {
    expect(() => deriveServerKey(Buffer.alloc(0), 'survival', 1)).toThrow();
  });
});

describe('slug и key-id', () => {
  it.each(['survival', 'a1', '0a', 'lobby-2', 'a'.repeat(32)])(
    'slug %p допустим',
    (v) => {
      expect(isValidSlug(v)).toBe(true);
    },
  );
  it.each(['a', '-ab', 'Ab', 'a.b', 'a_b', 'a'.repeat(33), '', 'a b'])(
    'slug %p недопустим',
    (v) => {
      expect(isValidSlug(v)).toBe(false);
    },
  );
  it('шаблон не принимает перевод строки в конце', () => {
    expect(SLUG_PATTERN.test('survival\n')).toBe(false);
  });

  it('formatKeyId и parseKeyId', () => {
    expect(formatKeyId('survival', 12)).toBe('survival.12');
    expect(parseKeyId('survival.12')).toEqual({
      slug: 'survival',
      generation: 12,
    });
    expect(parseKeyId('survival.0')).toBeNull();
    expect(parseKeyId('survival.01')).toBeNull();
    expect(parseKeyId('survival')).toBeNull();
    expect(parseKeyId('.1')).toBeNull();
  });
});

describe('canonicalJson и payloadHash (5.2)', () => {
  it('ключи в лексикографическом порядке на всех уровнях, без пробелов', () => {
    expect(
      canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } }),
    ).toBe('{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}');
  });

  it('порядок элементов массивов сохраняется', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
  });

  it('порядок ключей не влияет на хэш, значения - влияют', () => {
    const a = payloadHash({ x: 1, y: { p: 'q', r: [1, 2] } });
    const b = payloadHash({ y: { r: [1, 2], p: 'q' }, x: 1 });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(payloadHash({ x: 2, y: { p: 'q', r: [1, 2] } })).not.toBe(a);
    expect(payloadHash({ x: 1, y: { p: 'q', r: [2, 1] } })).not.toBe(a);
  });

  it('хэш = SHA-256 hex от канонической строки (независимая проверка)', () => {
    const expected = createHash('sha256')
      .update('{"a":"я","b":[true,false,null]}', 'utf8')
      .digest('hex');
    expect(payloadHash({ b: [true, false, null], a: 'я' })).toBe(expected);
  });

  it('порядок по кодовым единицам UTF-16, а не по локали', () => {
    expect(canonicalJson({ b: 1, B: 2, a: 3, ä: 4 })).toBe(
      '{"B":2,"a":3,"b":1,"ä":4}',
    );
  });

  it('отвергает нечисловые значения', () => {
    expect(() => canonicalJson({ a: Number.NaN })).toThrow();
    expect(() => canonicalJson({ a: () => 1 })).toThrow();
  });
});
