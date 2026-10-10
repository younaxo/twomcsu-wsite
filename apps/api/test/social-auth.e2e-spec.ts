import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import {
  ExternalProfile,
  SocialAuthService,
} from '../src/modules/auth/social-auth.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';

jest.setTimeout(30_000);

type Provider = 'discord' | 'telegram';

/// ADR-0069/ADR-0071: вход через Discord/Telegram — только для уже привязанных
/// аккаунтов, без автосоздания и автопривязки. Обмен кода у провайдеров
/// подменён (OIDC/подпись покрыты unit-тестами); state, nonce, PKCE-cookie,
/// режимы login/link и экраны результата проверяются по-настоящему.
describe('Social login (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let social: SocialAuthService;
  const unique = randomUUID().slice(0, 8);
  const password = 'Sup3rSecretPassw0rd!';
  const userIds: string[] = [];
  const profiles: Record<Provider, ExternalProfile> = {
    discord: {
      providerUserId: `8${Date.now()}`.slice(0, 18),
      username: `dc_${unique}`,
      displayName: 'Discord Test',
    },
    telegram: {
      providerUserId: `9${Date.now()}`.slice(0, 12),
      username: `tg_${unique}`,
      displayName: 'Telegram Test',
    },
  };

  async function createUser(label: string) {
    const email = `sl-${label}-${unique}@example.com`;
    const username = `sl${label}${unique}`.slice(0, 16);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ emailOrUsername: username, password })
      .expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    userIds.push(user.id);
    return { id: user.id, auth: `Bearer ${login.body.accessToken}` };
  }

  const cookiesOf = (res: request.Response) =>
    ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .filter((c) => c.startsWith('social_'))
      .map((c) => c.split(';')[0])
      .join('; ');

  /// Полный проход: start (login) или link-url (link) → callback → экран результата.
  async function flow(
    provider: Provider,
    options: { auth?: string; query?: string } = {},
  ) {
    const begin = options.auth
      ? await request(app.getHttpServer())
          .post(`/auth/${provider}/link-url`)
          .set('Authorization', options.auth)
          .expect(200)
      : await request(app.getHttpServer())
          .get(`/auth/${provider}/start?next=/shop`)
          .expect(302);
    const authorizeUrl = new URL(
      options.auth ? begin.body.url : begin.headers.location,
    );
    const state = authorizeUrl.searchParams.get('state') ?? '';
    const callback = await request(app.getHttpServer())
      .get(
        `/auth/${provider}/callback?${options.query ?? 'code=test'}&state=${encodeURIComponent(state)}`,
      )
      .set('Cookie', cookiesOf(begin))
      .expect(302);
    const result = new URL(callback.headers.location as string);
    return { authorizeUrl, begin, callback, result };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    social = app.get(SocialAuthService);

    jest.spyOn(social, 'discordConfigured').mockReturnValue(true);
    jest.spyOn(social, 'telegramConfigured').mockReturnValue(true);
    jest
      .spyOn(social, 'exchangeDiscordCode')
      .mockImplementation(async () => profiles.discord);
    jest
      .spyOn(social, 'exchangeTelegramCode')
      .mockImplementation(async () => profiles.telegram);
  });

  afterAll(async () => {
    await prisma.userExternalAccount.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('Discord start: redirect на discord.com с state, nonce-cookie', async () => {
    const { authorizeUrl, begin } = await flow('discord');
    expect(authorizeUrl.origin).toBe('https://discord.com');
    expect(authorizeUrl.searchParams.get('scope')).toBe('identify');
    expect(cookiesOf(begin)).toContain('social_nonce=');
  });

  it('Telegram start: OIDC oauth.telegram.org/auth с PKCE S256 и nonce, verifier в httpOnly-cookie', async () => {
    const { authorizeUrl, begin } = await flow('telegram');
    expect(`${authorizeUrl.origin}${authorizeUrl.pathname}`).toBe(
      'https://oauth.telegram.org/auth',
    );
    expect(authorizeUrl.searchParams.get('response_type')).toBe('code');
    expect(authorizeUrl.searchParams.get('scope')).toBe('openid profile');
    expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorizeUrl.searchParams.get('nonce')).toEqual(expect.any(String));
    const raw = String(begin.headers['set-cookie']);
    expect(raw).toMatch(/social_pkce=[^;]+;.*HttpOnly/i);
  });

  it.each(['discord', 'telegram'] as const)(
    '%s: непривязанный аккаунт — экран «не привязан», аккаунт не создаётся',
    async (provider) => {
      const { result, callback } = await flow(provider);
      expect(result.pathname).toBe('/auth/result');
      expect(Object.fromEntries(result.searchParams)).toEqual({
        provider,
        mode: 'login',
        status: 'not_linked',
        next: '/shop',
      });
      expect(String(callback.headers['set-cookie'])).not.toContain(
        'refresh_token=',
      );
      // Точечно (параллельные наборы e2e создают своих пользователей): ни
      // привязки этого внешнего аккаунта, ни пользователя с его ником.
      expect(
        await prisma.userExternalAccount.count({
          where: {
            provider,
            providerUserId: profiles[provider].providerUserId,
          },
        }),
      ).toBe(0);
      expect(
        await prisma.user.count({
          where: { username: profiles[provider].username ?? '' },
        }),
      ).toBe(0);
    },
  );

  it.each(['discord', 'telegram'] as const)(
    '%s: привязка → вход в тот же аккаунт; повторно — «уже подключено»; другому — «занят»',
    async (provider) => {
      const owner = await createUser(`${provider.slice(0, 2)}o`);
      const linked = await flow(provider, { auth: owner.auth });
      expect(linked.result.searchParams.get('mode')).toBe('link');
      expect(linked.result.searchParams.get('status')).toBe('linked');
      expect(linked.result.searchParams.get('next')).toBe(
        '/settings/linked-accounts',
      );

      const again = await flow(provider, { auth: owner.auth });
      expect(again.result.searchParams.get('status')).toBe('already_linked');

      const login = await flow(provider);
      expect(login.result.searchParams.get('status')).toBe('success');
      expect(String(login.callback.headers['set-cookie'])).toContain(
        'refresh_token=',
      );
      // Токены не попадают в URL результата.
      expect(login.callback.headers.location).not.toMatch(/token|code=/i);
      const link = await prisma.userExternalAccount.findFirst({
        where: {
          provider,
          providerUserId: profiles[provider].providerUserId,
        },
      });
      expect(link?.userId).toBe(owner.id);

      const other = await createUser(`${provider.slice(0, 2)}x`);
      const taken = await flow(provider, { auth: other.auth });
      expect(taken.result.searchParams.get('status')).toBe('taken');
    },
  );

  it('2FA (ADR-0109): вход через Discord при включённой 2FA — только челлендж, без сессии', async () => {
    const owner = await createUser('2f');
    const profile: ExternalProfile = {
      providerUserId: `7${Date.now()}`.slice(0, 18),
      username: `dc2fa_${unique}`,
      displayName: 'Discord 2FA',
    };
    await prisma.userExternalAccount.create({
      data: {
        userId: owner.id,
        provider: 'discord',
        providerUserId: profile.providerUserId,
        username: profile.username,
      },
    });
    await prisma.user.update({
      where: { id: owner.id },
      data: { twoFactorEnabled: true },
    });
    jest.spyOn(social, 'exchangeDiscordCode').mockResolvedValueOnce(profile);
    const login = await flow('discord');
    expect(login.result.searchParams.get('status')).toBe('two_factor');
    const cookies = String(login.callback.headers['set-cookie']);
    expect(cookies).not.toContain('refresh_token=');
    expect(cookies).toMatch(/two_factor_challenge=[^;]+;.*HttpOnly/i);
    expect(login.callback.headers.location).not.toMatch(/token|challenge/i);
  });

  it('у пользователя уже другой Telegram — «сначала отключите»; после отвязки вход закрыт', async () => {
    const owner = await createUser('tgs');
    const saved = profiles.telegram;
    profiles.telegram = { ...saved, providerUserId: `7${Date.now()}` };
    try {
      expect(
        (await flow('telegram', { auth: owner.auth })).result.searchParams.get(
          'status',
        ),
      ).toBe('linked');
      profiles.telegram = { ...saved, providerUserId: `6${Date.now()}` };
      expect(
        (await flow('telegram', { auth: owner.auth })).result.searchParams.get(
          'status',
        ),
      ).toBe('slot_taken');
      await request(app.getHttpServer())
        .delete('/auth/linked-accounts/telegram')
        .set('Authorization', owner.auth)
        .expect(200);
      expect(
        await prisma.auditLog.count({
          where: {
            actorId: owner.id,
            action: { in: ['auth.external.link', 'auth.external.unlink'] },
          },
        }),
      ).toBe(2);
    } finally {
      profiles.telegram = saved;
    }
  });

  it('отказ у провайдера — «вход отменён»; ошибка провайдера — «не удалось»', async () => {
    const cancelled = await flow('discord', {
      query: 'error=access_denied',
    });
    expect(cancelled.result.searchParams.get('status')).toBe('cancelled');
    const failed = await flow('telegram', { query: 'error=server_error' });
    expect(failed.result.searchParams.get('status')).toBe('error');
  });

  it('подделанный state или чужой браузер (нет nonce) — «сессия входа устарела»', async () => {
    const { state } = social.createState({ mode: 'login', next: '/' });
    const res = await request(app.getHttpServer())
      .get(
        `/auth/discord/callback?code=test&state=${encodeURIComponent(state)}`,
      )
      .expect(302);
    const result = new URL(res.headers.location as string);
    expect(result.searchParams.get('status')).toBe('expired');
  });

  it('провайдер не настроен — экран «недоступно», а не JSON', async () => {
    (social.discordConfigured as jest.Mock).mockReturnValueOnce(false);
    const res = await request(app.getHttpServer())
      .get('/auth/discord/start')
      .expect(302);
    expect(
      new URL(res.headers.location as string).searchParams.get('status'),
    ).toBe('unavailable');
  });
});
