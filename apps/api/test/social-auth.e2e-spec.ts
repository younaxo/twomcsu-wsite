import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { SocialAuthService } from '../src/modules/auth/social-auth.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';

jest.setTimeout(20_000);

/// ADR-0069: вход через Discord/Telegram — только для уже привязанных
/// аккаунтов, без автосоздания и автопривязки. Сетевые вызовы к Discord и
/// проверка подписи Telegram подменены (подпись покрыта unit-тестом).
describe('Social login (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let social: SocialAuthService;
  const unique = randomUUID().slice(0, 8);
  const password = 'Sup3rSecretPassw0rd!';
  const userIds: string[] = [];
  const tgId = `9${Date.now()}`.slice(0, 12);
  const discordId = `8${Date.now()}`.slice(0, 18);

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
    return { id: user.id, username, auth: `Bearer ${login.body.accessToken}` };
  }

  const tgPayload = {
    id: Number(tgId),
    first_name: 'Test',
    username: `tg_${unique}`,
    auth_date: Math.floor(Date.now() / 1000),
    hash: 'a'.repeat(64),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    social = app.get(SocialAuthService);

    jest.spyOn(social, 'verifyTelegram').mockImplementation((payload) => ({
      providerUserId: String(payload.id),
      username: payload.username ?? null,
      displayName: payload.first_name ?? null,
    }));
    jest.spyOn(social, 'discordConfigured').mockReturnValue(true);
    jest.spyOn(social, 'exchangeDiscordCode').mockResolvedValue({
      providerUserId: discordId,
      username: `dc_${unique}`,
      displayName: 'Discord Test',
    });
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

  it('Telegram: непривязанный аккаунт — 403 и никакого автосоздания', async () => {
    const usersBefore = await prisma.user.count();
    const res = await request(app.getHttpServer())
      .post('/auth/telegram/login')
      .send({ payload: tgPayload })
      .expect(403);
    expect(res.body.code ?? res.body.message?.code).toBe('telegram_not_linked');
    expect(await prisma.user.count()).toBe(usersBefore);
  });

  it('Telegram: привязка из профиля → вход в тот же аккаунт; повторная привязка к другому — 409', async () => {
    const owner = await createUser('tg');
    await request(app.getHttpServer())
      .post('/auth/telegram/link')
      .set('Authorization', owner.auth)
      .send({ payload: tgPayload })
      .expect(200);

    const login = await request(app.getHttpServer())
      .post('/auth/telegram/login')
      .send({ payload: tgPayload })
      .expect(200);
    expect(login.body.user.id).toBe(owner.id);
    expect(login.body.accessToken).toEqual(expect.any(String));
    expect(String(login.headers['set-cookie'])).toContain('refresh_token=');

    const other = await createUser('tg2');
    await request(app.getHttpServer())
      .post('/auth/telegram/link')
      .set('Authorization', other.auth)
      .send({ payload: tgPayload })
      .expect(409);

    const list = await request(app.getHttpServer())
      .get('/auth/linked-accounts')
      .set('Authorization', owner.auth)
      .expect(200);
    expect(list.body).toEqual([
      expect.objectContaining({
        provider: 'telegram',
        username: `tg_${unique}`,
      }),
    ]);

    await request(app.getHttpServer())
      .delete('/auth/linked-accounts/telegram')
      .set('Authorization', owner.auth)
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/telegram/login')
      .send({ payload: tgPayload })
      .expect(403);
    expect(
      await prisma.auditLog.count({
        where: {
          actorId: owner.id,
          action: { in: ['auth.external.link', 'auth.external.unlink'] },
        },
      }),
    ).toBe(2);
  });

  it('Discord: start → redirect с state; callback непривязанного — на /login с ошибкой', async () => {
    const start = await request(app.getHttpServer())
      .get('/auth/discord/start?next=/shop')
      .expect(302);
    expect(start.headers.location).toMatch(
      /^https:\/\/discord\.com\/oauth2\/authorize\?/,
    );
    expect(start.headers.location).toContain('scope=identify');
    const cookies = ([] as string[]).concat(start.headers['set-cookie'] ?? []);
    const nonceCookie = cookies.find((c) => c.startsWith('social_nonce='));
    expect(nonceCookie).toBeDefined();
    const state = new URL(start.headers.location as string).searchParams.get(
      'state',
    );

    const callback = await request(app.getHttpServer())
      .get(
        `/auth/discord/callback?code=test&state=${encodeURIComponent(state ?? '')}`,
      )
      .set('Cookie', (nonceCookie as string).split(';')[0] as string)
      .expect(302);
    expect(callback.headers.location).toContain(
      '/login?social_error=discord_not_linked',
    );
  });

  it('Discord: подделанный state или чужой браузер (нет nonce) — отказ', async () => {
    const { state } = social.createState({ mode: 'login', next: '/' });
    const res = await request(app.getHttpServer())
      .get(
        `/auth/discord/callback?code=test&state=${encodeURIComponent(state)}`,
      )
      .expect(302);
    expect(res.headers.location).toContain('/login?social_error=invalid_state');
  });

  it('Discord: привязка через link-url → callback → вход в тот же аккаунт', async () => {
    const owner = await createUser('dc');
    const linkUrl = await request(app.getHttpServer())
      .post('/auth/discord/link-url')
      .set('Authorization', owner.auth)
      .expect(200);
    const cookies = ([] as string[]).concat(
      linkUrl.headers['set-cookie'] ?? [],
    );
    const nonce = (
      cookies.find((c) => c.startsWith('social_nonce=')) as string
    ).split(';')[0];
    const state = new URL(linkUrl.body.url).searchParams.get('state') ?? '';
    const linked = await request(app.getHttpServer())
      .get(
        `/auth/discord/callback?code=test&state=${encodeURIComponent(state)}`,
      )
      .set('Cookie', nonce as string)
      .expect(302);
    expect(linked.headers.location).toContain(
      '/settings/linked-accounts?linked=discord',
    );

    const start = await request(app.getHttpServer())
      .get('/auth/discord/start')
      .expect(302);
    const startNonce = ([] as string[])
      .concat(start.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('social_nonce='))
      ?.split(';')[0];
    const loginState =
      new URL(start.headers.location as string).searchParams.get('state') ?? '';
    const login = await request(app.getHttpServer())
      .get(
        `/auth/discord/callback?code=test&state=${encodeURIComponent(loginState)}`,
      )
      .set('Cookie', startNonce as string)
      .expect(302);
    expect(login.headers.location).toContain('/auth/complete?next=');
    expect(String(login.headers['set-cookie'])).toContain('refresh_token=');
    const link = await prisma.userExternalAccount.findFirst({
      where: { provider: 'discord', providerUserId: discordId },
    });
    expect(link?.userId).toBe(owner.id);
  });
});
