import { ConfigService } from '@nestjs/config';
import { createHash, generateKeyPairSync, sign } from 'crypto';
import {
  createPkce,
  SocialAuthService,
  safeNextPath,
  TELEGRAM_OIDC,
} from './social-auth.service';

const CLIENT_ID = '123456';

function makeService(): SocialAuthService {
  const values: Record<string, string> = {
    TELEGRAM_BOT_TOKEN: `${CLIENT_ID}:TEST_TOKEN_FOR_UNIT_SPEC`,
    TELEGRAM_CLIENT_SECRET: 'unit-spec-client-secret',
    TELEGRAM_REDIRECT_URI: 'https://api.example.test/auth/telegram/callback',
    JWT_ACCESS_SECRET: 'unit-spec-access-secret-0123456789',
  };
  const config = {
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  } as unknown as ConfigService;
  return new SocialAuthService(
    config,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...keys.publicKey.export({ format: 'jwk' }), kid: 'tg-1' };

function idToken(claims: Record<string, unknown>): string {
  const enc = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const head = `${enc({ alg: 'RS256', kid: 'tg-1' })}.${enc(claims)}`;
  const signature = sign('sha256', Buffer.from(head), keys.privateKey);
  return `${head}.${signature.toString('base64url')}`;
}

describe('SocialAuthService', () => {
  const service = makeService();

  describe('Telegram OpenID Connect', () => {
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: TELEGRAM_OIDC.issuer,
      aud: CLIENT_ID,
      sub: 'opaque-sub',
      iat: now,
      exp: now + 300,
      nonce: 'nonce-1',
      id: 987654321,
      name: 'Кирилл',
      preferred_username: 'twomc_player',
    };
    let requests: { url: string; init?: RequestInit }[] = [];

    function mockFetch(token: string, tokenStatus = 200) {
      requests = [];
      jest
        .spyOn(global, 'fetch')
        .mockImplementation(async (input, init?: RequestInit) => {
          const url = String(input);
          requests.push({ url, init });
          if (url === TELEGRAM_OIDC.jwks) {
            return new Response(JSON.stringify({ keys: [jwk] }));
          }
          return new Response(JSON.stringify({ id_token: token }), {
            status: tokenStatus,
          });
        });
    }

    afterEach(() => jest.restoreAllMocks());

    it('URL авторизации: code + PKCE S256, scope openid profile, state и nonce', () => {
      const pkce = createPkce();
      expect(pkce.challenge).toBe(
        createHash('sha256').update(pkce.verifier).digest('base64url'),
      );
      const url = new URL(
        service.telegramAuthorizeUrl('st', 'nonce-1', pkce.challenge),
      );
      expect(`${url.origin}${url.pathname}`).toBe(TELEGRAM_OIDC.authorize);
      expect(Object.fromEntries(url.searchParams)).toEqual({
        client_id: CLIENT_ID,
        redirect_uri: 'https://api.example.test/auth/telegram/callback',
        response_type: 'code',
        scope: 'openid profile',
        state: 'st',
        nonce: 'nonce-1',
        code_challenge: pkce.challenge,
        code_challenge_method: 'S256',
      });
    });

    it('обмен кода: Basic-авторизация, verifier, проверенный id_token → профиль по id', async () => {
      mockFetch(idToken(claims));
      const profile = await service.exchangeTelegramCode(
        'code-1',
        'verifier-1',
        'nonce-1',
      );
      expect(profile).toEqual({
        providerUserId: '987654321',
        username: 'twomc_player',
        displayName: 'Кирилл',
      });
      const tokenCall = requests.find((r) => r.url === TELEGRAM_OIDC.token);
      const headers = tokenCall?.init?.headers as Record<string, string>;
      expect(headers.authorization).toBe(
        `Basic ${Buffer.from(`${CLIENT_ID}:unit-spec-client-secret`).toString('base64')}`,
      );
      const body = new URLSearchParams(String(tokenCall?.init?.body));
      expect(body.get('code_verifier')).toBe('verifier-1');
      expect(body.get('grant_type')).toBe('authorization_code');
    });

    it('чужой aud, чужой nonce или ошибка token endpoint — отказ', async () => {
      mockFetch(idToken({ ...claims, aud: '999' }));
      await expect(
        service.exchangeTelegramCode('c', 'v', 'nonce-1'),
      ).rejects.toThrow('telegram_failed');
      mockFetch(idToken(claims));
      await expect(
        service.exchangeTelegramCode('c', 'v', 'other-nonce'),
      ).rejects.toThrow('telegram_failed');
      mockFetch(idToken(claims), 400);
      await expect(
        service.exchangeTelegramCode('c', 'v', 'nonce-1'),
      ).rejects.toThrow('telegram_failed');
    });

    it('без Client Secret провайдер выключен', () => {
      const config = {
        get: (key: string, fallback?: unknown) =>
          key === 'TELEGRAM_BOT_TOKEN' ? '1:x' : fallback,
      } as unknown as ConfigService;
      const disabled = new SocialAuthService(
        config,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
      expect(disabled.providers().telegram.enabled).toBe(false);
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
