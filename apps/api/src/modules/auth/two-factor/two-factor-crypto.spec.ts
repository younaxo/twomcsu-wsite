import { generateBackupCodes, normalizeBackupCode } from './backup-codes';
import { SecretBox } from './secret-box';
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  hotp,
  otpauthUri,
  totpStep,
  verifyTotp,
} from './totp';

/// RFC 6238, приложение B: секрет ASCII "12345678901234567890", SHA1. Там
/// 8 цифр — 6-значный код это последние 6 цифр того же значения.
const RFC_SECRET = Buffer.from('12345678901234567890');
const RFC_VECTORS: Array<[number, string]> = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
];

describe('TOTP (RFC 6238)', () => {
  it.each(RFC_VECTORS)('время %i → %s', (seconds, code) => {
    expect(hotp(RFC_SECRET, totpStep(seconds * 1000))).toBe(code);
    expect(hotp(RFC_SECRET, totpStep(seconds * 1000), 8).slice(-6)).toBe(code);
  });

  it('base32 туда-обратно; секрет — 32 символа (160 бит)', () => {
    expect(base32Encode(RFC_SECRET)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode('gezd gnbv-gy3t qojq gezdgnbvgy3tqojq')).toEqual(
      RFC_SECRET,
    );
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
  });

  it('окно ±1 шаг, мусор не принимается, повтор шага — нет', () => {
    const secret = base32Encode(RFC_SECRET);
    const now = 1111111111 * 1000;
    const step = totpStep(now);
    expect(verifyTotp(secret, '050471', now)).toBe(step);
    // Предыдущий и следующий шаг — в окне.
    expect(verifyTotp(secret, hotp(RFC_SECRET, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(secret, hotp(RFC_SECRET, step + 1), now)).toBe(step + 1);
    expect(verifyTotp(secret, hotp(RFC_SECRET, step + 2), now)).toBeNull();
    expect(verifyTotp(secret, '12345', now)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now)).toBeNull();
    expect(verifyTotp(secret, ' 050 471 ', now)).toBe(step);
    // Код уже принят на этом шаге — второй раз нельзя.
    expect(verifyTotp(secret, '050471', now, step)).toBeNull();
  });

  it('otpauth URI для QR', () => {
    const uri = otpauthUri('twomc.su', 'younaxo_', 'ABC234');
    expect(uri).toMatch(/^otpauth:\/\/totp\/twomc\.su%3Ayounaxo_\?/);
    const params = new URL(uri.replace('otpauth://', 'https://')).searchParams;
    expect(params.get('secret')).toBe('ABC234');
    expect(params.get('issuer')).toBe('twomc.su');
    expect(params.get('digits')).toBe('6');
    expect(params.get('period')).toBe('30');
  });
});

describe('SecretBox', () => {
  const box = new SecretBox('test-key-test-key-test-key-test-key');

  it('шифрует и расшифровывает; каждый раз разный шифротекст', () => {
    const a = box.encrypt('JBSWY3DPEHPK3PXP');
    const b = box.encrypt('JBSWY3DPEHPK3PXP');
    expect(a).not.toBe(b);
    expect(a.startsWith('v1.')).toBe(true);
    expect(a).not.toContain('JBSWY3DPEHPK3PXP');
    expect(box.decrypt(a)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('подмена шифротекста или другой ключ — ошибка, а не мусор', () => {
    const sealed = box.encrypt('secret');
    const parts = sealed.split('.');
    parts[3] = Buffer.from('другое').toString('base64url');
    expect(() => box.decrypt(parts.join('.'))).toThrow();
    const other = new SecretBox('other-key-other-key-other-key-other');
    expect(() => other.decrypt(sealed)).toThrow();
  });

  it('короткий ключ не принимается; хеш зависит от ключа', () => {
    expect(() => new SecretBox('short')).toThrow();
    const other = new SecretBox('other-key-other-key-other-key-other');
    expect(box.hash('abcd2345')).toMatch(/^[0-9a-f]{64}$/);
    expect(box.hash('abcd2345')).not.toBe(other.hash('abcd2345'));
  });
});

describe('Резервные коды', () => {
  it('10 уникальных кодов xxxx-xxxx без похожих символов', () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) {
      expect(code).toMatch(/^[a-hj-km-np-z2-9]{4}-[a-hj-km-np-z2-9]{4}$/);
    }
  });

  it('ввод нормализуется: регистр, пробелы, дефисы', () => {
    expect(normalizeBackupCode('ABCD-2345')).toBe('abcd2345');
    expect(normalizeBackupCode(' abcd 2345 ')).toBe('abcd2345');
    expect(normalizeBackupCode('abc')).toBeNull();
    expect(normalizeBackupCode('123456')).toBeNull();
  });
});
