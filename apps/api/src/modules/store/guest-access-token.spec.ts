import {
  GUEST_TOKEN_PATTERN,
  GUEST_TOKEN_TTL_MS,
  generateGuestToken,
  guestTokenExpiry,
  hashGuestToken,
} from './guest-access-token';

describe('guest-access-token (0.12a)', () => {
  it('токен: не менее 128 бит, base64url, уникален', () => {
    const a = generateGuestToken();
    const b = generateGuestToken();
    expect(a).not.toBe(b);
    expect(Buffer.from(a, 'base64url').length).toBeGreaterThanOrEqual(16);
    expect(GUEST_TOKEN_PATTERN.test(a)).toBe(true);
  });

  it('хеш: SHA-256 hex, детерминирован, не равен токену', () => {
    const t = generateGuestToken();
    expect(hashGuestToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashGuestToken(t)).toBe(hashGuestToken(t));
    expect(hashGuestToken(t)).not.toContain(t);
  });

  it('срок жизни 30 дней', () => {
    const now = new Date('2026-11-23T00:00:00Z');
    expect(guestTokenExpiry(now).getTime() - now.getTime()).toBe(
      GUEST_TOKEN_TTL_MS,
    );
    expect(GUEST_TOKEN_TTL_MS).toBe(30 * 86_400_000);
  });

  it('шаблон отвергает короткие и с лишними символами', () => {
    expect(GUEST_TOKEN_PATTERN.test('short')).toBe(false);
    expect(GUEST_TOKEN_PATTERN.test('O-20261123-ABCDEF')).toBe(false);
    expect(GUEST_TOKEN_PATTERN.test(`${'a'.repeat(30)}/..`)).toBe(false);
  });
});
