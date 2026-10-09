import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'crypto';
import { SocialAuthService, safeNextPath } from './social-auth.service';

const BOT_TOKEN = '123456:TEST_TOKEN_FOR_UNIT_SPEC';

function makeService(): SocialAuthService {
  const values: Record<string, string> = {
    TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    TELEGRAM_BOT_USERNAME: 'twomc_test_bot',
    JWT_ACCESS_SECRET: 'unit-spec-access-secret-0123456789',
  };
  const config = {
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  } as unknown as ConfigService;
  return new SocialAuthService(config, {} as never, {} as never, {} as never);
}

function sign(payload: Record<string, string | number>): string {
  const check = Object.entries(payload)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = createHash('sha256').update(BOT_TOKEN).digest();
  return createHmac('sha256', secret).update(check).digest('hex');
}

describe('SocialAuthService', () => {
  const service = makeService();

  describe('verifyTelegram', () => {
    const base = {
      id: 42,
      first_name: 'Кирилл',
      username: 'twomc_player',
      auth_date: Math.floor(Date.now() / 1000),
    };

    it('принимает корректную подпись', () => {
      const profile = service.verifyTelegram({ ...base, hash: sign(base) });
      expect(profile).toEqual({
        providerUserId: '42',
        username: 'twomc_player',
        displayName: 'Кирилл',
      });
    });

    it('отклоняет подделанные данные', () => {
      const hash = sign(base);
      expect(() => service.verifyTelegram({ ...base, id: 43, hash })).toThrow();
    });

    it('отклоняет устаревшие данные', () => {
      const old = {
        ...base,
        auth_date: Math.floor(Date.now() / 1000) - 2 * 86400,
      };
      expect(() =>
        service.verifyTelegram({ ...old, hash: sign(old) }),
      ).toThrow();
    });
  });

  describe('state', () => {
    it('подписан и привязан к nonce', () => {
      const { state, nonce } = service.createState({
        mode: 'login',
        next: '/shop',
      });
      expect(service.verifyState(state, nonce)).toMatchObject({
        mode: 'login',
        next: '/shop',
      });
      expect(() => service.verifyState(state, 'other-nonce')).toThrow();
      const [body] = state.split('.');
      expect(() => service.verifyState(`${body}.forged`, nonce)).toThrow();
    });
  });

  it('safeNextPath принимает только внутренние пути', () => {
    expect(safeNextPath('/admin')).toBe('/admin');
    expect(safeNextPath('//evil.example')).toBe('/');
    expect(safeNextPath('https://evil.example')).toBe('/');
    expect(safeNextPath(undefined)).toBe('/');
  });
});
