import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { SlugRateLimiter } from './slug-rate-limiter';
import {
  SHA256_PREFIX,
  sha256Hash,
  verifyWebhookSecret,
} from './vote-webhook-secret';

describe('verifyWebhookSecret', () => {
  const secret = 'a'.repeat(64);

  it('sha256: верный секрет принимается, неверный и другой длины - нет', async () => {
    const stored = sha256Hash(secret);
    expect(stored.startsWith(SHA256_PREFIX)).toBe(true);
    await expect(verifyWebhookSecret(secret, stored)).resolves.toBe(true);
    await expect(verifyWebhookSecret('b'.repeat(64), stored)).resolves.toBe(
      false,
    );
    await expect(verifyWebhookSecret('x', stored)).resolves.toBe(false);
  });

  it('sha256: сравнение идёт через timingSafeEqual над дайджестами равной длины', async () => {
    const calls: number[][] = [];
    const original = crypto.timingSafeEqual;
    const spy = jest
      .spyOn(crypto, 'timingSafeEqual')
      .mockImplementation((a, b) => {
        calls.push([a.byteLength, b.byteLength]);
        return original(a, b);
      });
    await verifyWebhookSecret('short', sha256Hash(secret));
    await verifyWebhookSecret('l'.repeat(400), sha256Hash(secret));
    spy.mockRestore();
    expect(calls).toHaveLength(2);
    for (const [left, right] of calls) expect(left).toBe(right);
  });

  it('прежний bcrypt-хеш продолжает работать', async () => {
    const stored = await bcrypt.hash(secret, 4);
    await expect(verifyWebhookSecret(secret, stored)).resolves.toBe(true);
    await expect(verifyWebhookSecret('nope', stored)).resolves.toBe(false);
  });

  it('нет хеша (неизвестный slug): фиктивное bcrypt-сравнение, всегда false', async () => {
    const spy = jest.spyOn(bcrypt, 'compare');
    await expect(verifyWebhookSecret(secret, null, 4)).resolves.toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('повреждённый хеш - отказ без исключения', async () => {
    await expect(verifyWebhookSecret(secret, 'sha256$zz')).resolves.toBe(false);
    await expect(verifyWebhookSecret(secret, 'garbage')).resolves.toBe(false);
  });
});

describe('SlugRateLimiter', () => {
  it('пропускает limit запросов в окне, затем отказывает; окно сбрасывается', () => {
    const limiter = new SlugRateLimiter(3, 1000, 10);
    expect([1, 2, 3, 4].map(() => limiter.allow('a', 0))).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(limiter.allow('b', 0)).toBe(true);
    expect(limiter.allow('a', 1000)).toBe(true);
  });

  it('карта ограничена: при переполнении новые ключи не отслеживаются', () => {
    const limiter = new SlugRateLimiter(1, 1000, 2);
    limiter.allow('a', 0);
    limiter.allow('b', 0);
    expect(limiter.allow('c', 0)).toBe(true);
    expect(limiter.allow('c', 0)).toBe(true);
  });
});
