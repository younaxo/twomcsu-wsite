import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import {
  EmailService,
  SendEmailInput,
} from '../src/modules/email/email.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { RedisService } from '../src/modules/redis/redis.service';

async function flushBruteForceKeys(redis: RedisService): Promise<void> {
  const keys = await redis.client.keys('bruteforce:*');
  if (keys.length > 0) {
    await redis.client.del(...keys);
  }
}

// Компиляция AppModule под полным e2e-сьютом (8 файлов параллельно, общие
// Postgres+Redis) может подойти ближе к дефолтному таймауту хука Jest
// (5000 мс), чем при изолированном запуске — см. RISKS.md.
jest.setTimeout(20_000);

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let emailService: EmailService;
  let redis: RedisService;

  const unique = randomUUID().slice(0, 8);
  const email = `test-${unique}@example.com`;
  const username = `user${unique}`;
  const password = 'Sup3rSecretPassw0rd!';
  const bannedEmail = `banned-${unique}@example.com`;
  const bannedUsername = `banned${unique}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    emailService = app.get(EmailService);
    redis = app.get(RedisService);
    await flushBruteForceKeys(redis);

    // Регистрация требует существования позиции по умолчанию (как создаёт seed, PHASE 32).
    const existingDefault = await prisma.position.findFirst({
      where: { isDefault: true },
    });
    if (!existingDefault) {
      await prisma.position.create({
        data: {
          name: `e2e-default-${unique}`,
          slug: `e2e-default-${unique}`,
          displayName: 'Default (e2e)',
          group: 'default',
          color: '#ffffff',
          isDefault: true,
        },
      });
    }
  });

  afterAll(async () => {
    await flushBruteForceKeys(redis);
    await prisma.auditLog.deleteMany({
      where: { actor: { email: { in: [email, bannedEmail] } } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [email, bannedEmail] } },
    });
    await app.close();
  });

  it('POST /auth/register создаёт пользователя', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);

    expect(response.body.user.email).toBe(email);
    expect(response.body.user.username).toBe(username);
    expect(response.body.user.password).toBeUndefined();
  });

  it('POST /auth/register с занятым email возвращает 409', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, username: `${username}2`, password })
      .expect(409);
  });

  it('POST /auth/login с неверным паролем возвращает 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ emailOrUsername: email, password: 'wrong-password' })
      .expect(401);
  });

  it('GET /auth/me без токена возвращает 401', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('полный цикл login → me → refresh (rotation) → reuse detection → logout', async () => {
    const agent = request.agent(app.getHttpServer());

    const loginRes = await agent
      .post('/auth/login')
      .send({ emailOrUsername: email, password })
      .expect(200);

    const accessToken = loginRes.body.accessToken;
    expect(accessToken).toEqual(expect.any(String));
    const originalCookies = loginRes.headers['set-cookie'];
    expect(originalCookies).toBeDefined();

    const meRes = await agent
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(meRes.body.email).toBe(email);
    // Публичная identity `ник#0000` (ADR-0099): discriminator выдаёт backend.
    expect(meRes.body.discriminator).toMatch(/^\d{4}$/);
    expect(meRes.body.tag).toBe(
      `${meRes.body.username}#${meRes.body.discriminator}`,
    );

    const refreshRes = await agent.post('/auth/refresh').expect(200);
    const newAccessToken = refreshRes.body.accessToken;
    expect(newAccessToken).toEqual(expect.any(String));
    // Сам access token при {sub}-пэйлоаде может совпасть побайтово, если
    // login/refresh попали в одну и ту же секунду (iat/exp с точностью до
    // секунды) — это не нарушает модель безопасности. Важно, что ротируется
    // именно refresh-cookie (проверяется ниже reuse detection по старому cookie).
    const newCookies = refreshRes.headers['set-cookie'];
    expect(newCookies).toBeDefined();
    expect(String(newCookies[0])).not.toBe(String(originalCookies[0]));

    // Повторное использование уже отозванного (старого) refresh-cookie —
    // должно сработать reuse detection и отозвать ВСЕ сессии пользователя.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', originalCookies)
      .expect(401);

    // Из-за reuse detection даже «актуальная» (вторая) сессия должна быть отозвана.
    await agent.post('/auth/refresh').expect(401);
  });

  it('восстановление по нику (A13): маска e-mail, ссылка — только при совпадении полного адреса', async () => {
    const sent: SendEmailInput[] = [];
    jest.spyOn(emailService, 'send').mockImplementation(async (input) => {
      sent.push(input);
    });
    const lookup = await request(app.getHttpServer())
      .post('/auth/forgot-password/lookup')
      .send({ username: username.toUpperCase() })
      .expect(200);
    expect(lookup.body.maskedEmail).toMatch(/^t\*\*\*\S@e\*{5}\.com$/);
    expect(JSON.stringify(lookup.body)).not.toContain(email);
    expect(lookup.body.providers).toEqual([]);
    const unknown = await request(app.getHttpServer())
      .post('/auth/forgot-password/lookup')
      .send({ username: `nobody${unique}`.slice(0, 16) })
      .expect(200);
    expect(unknown.body).toEqual({ maskedEmail: null, providers: [] });

    // Неверный адрес — ответ тот же, письма нет.
    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: `other-${unique}@example.com`, username })
      .expect(200);
    expect(sent).toHaveLength(0);
    // Полный адрес (другой регистр) — письмо со ссылкой.
    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: email.toUpperCase(), username })
      .expect(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.html).toMatch(/token=[a-f0-9]{64}/);
  });

  it('forgot-password → reset-password выдаёт новый пароль и отзывает сессии', async () => {
    let captured: SendEmailInput | undefined;
    jest.spyOn(emailService, 'send').mockImplementation(async (input) => {
      captured = input;
    });

    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email })
      .expect(200);

    expect(captured).toBeDefined();
    const match = /token=([a-f0-9]+)/.exec(captured!.html);
    expect(match).not.toBeNull();
    const rawToken = match![1];

    const newPassword = 'AnotherSecurePassw0rd!';
    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: rawToken, password: newPassword })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ emailOrUsername: email, password: newPassword })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: rawToken, password: 'irrelevant12345' })
      .expect(401);
  });

  it('бан блокирует вход и мгновенно обрывает действующую сессию (fix S3)', async () => {
    const bannedPassword = 'BannedUserPassw0rd!';
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: bannedEmail,
        username: bannedUsername,
        password: bannedPassword,
      })
      .expect(201);

    const agent = request.agent(app.getHttpServer());
    const loginRes = await agent
      .post('/auth/login')
      .send({ emailOrUsername: bannedEmail, password: bannedPassword })
      .expect(200);
    const accessToken = loginRes.body.accessToken;

    await prisma.user.update({
      where: { email: bannedEmail },
      data: { isBanned: true, banReason: 'e2e-test' },
    });

    // Уже выданный access token перестаёт работать немедленно — JwtStrategy
    // проверяет isBanned в БД на каждый запрос (см. strategies/jwt.strategy.ts).
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);

    // refresh для забаненного тоже не работает — в старом проекте это был S3
    // (29-SECURITY.md): бан не блокировал refresh.
    await agent.post('/auth/refresh').expect(401);

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ emailOrUsername: bannedEmail, password: bannedPassword })
      .expect(403);
    expect(JSON.stringify(res.body)).toContain('e2e-test');
  });

  it('блокирует IP на 429 после 10 неудачных попыток входа (brute-force)', async () => {
    const bruteEmail = `brute-${unique}@example.com`;
    const brutePassword = 'BruteForcePassw0rd!';
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: bruteEmail,
        username: `brute${unique}`,
        password: brutePassword,
      })
      .expect(201);

    await flushBruteForceKeys(redis);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ emailOrUsername: bruteEmail, password: 'wrong-password' });
    }

    // Даже с верным паролем — IP уже заблокирован на 15 минут.
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ emailOrUsername: bruteEmail, password: brutePassword })
      .expect(429);

    await flushBruteForceKeys(redis);
    await prisma.auditLog.deleteMany({
      where: { actor: { email: bruteEmail } },
    });
    await prisma.user.deleteMany({ where: { email: bruteEmail } });
  });
});
