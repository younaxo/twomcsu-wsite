import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'crypto';

/// Шифрование секретов 2FA в БД (ADR-0109): AES-256-GCM, ключ — SHA-256 от
/// `TWO_FACTOR_ENCRYPTION_KEY` (строка ≥ 32 символов, например
/// `openssl rand -base64 32`). Формат: `v1.<iv>.<tag>.<ciphertext>` (base64url).
/// Утечка БД без ключа не раскрывает секреты.

const VERSION = 'v1';

export class SecretBox {
  private readonly key: Buffer;
  private readonly pepper: Buffer;

  constructor(rawKey: string) {
    if (rawKey.length < 32) {
      throw new Error('TWO_FACTOR_ENCRYPTION_KEY: нужно не меньше 32 символов');
    }
    this.key = createHash('sha256').update(`twomc:2fa:enc:${rawKey}`).digest();
    this.pepper = createHash('sha256')
      .update(`twomc:2fa:pepper:${rawKey}`)
      .digest();
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv, tag, data]
      .map((part) =>
        typeof part === 'string' ? part : part.toString('base64url'),
      )
      .join('.');
  }

  decrypt(sealed: string): string {
    const [version, iv, tag, data] = sealed.split('.');
    if (version !== VERSION || !iv || !tag || data === undefined) {
      throw new Error('secret-box: неизвестный формат');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  /// HMAC-SHA256 с секретным pepper — для резервных кодов: без ключа сервера
  /// перебор по утёкшей БД бесполезен.
  hash(value: string): string {
    return createHmac('sha256', this.pepper).update(value).digest('hex');
  }
}
