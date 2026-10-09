import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import {
  EmailService,
  SendEmailInput,
} from '../src/modules/email/email.service';
import { MinecraftLinkService } from '../src/modules/minecraft-link/minecraft-link.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';

jest.setTimeout(30_000);

/// ADR-0070: регистрация с подтверждением почты. Письма перехватываются —
/// код берётся из текста письма, настоящая почта не отправляется.
describe('Registration with e-mail OTP (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const unique = randomUUID().slice(0, 8);
  const sent: SendEmailInput[] = [];
  const emails: string[] = [];

  const codeFor = (email: string) => {
    const mail = [...sent].reverse().find((m) => m.to === email);
    return /(\d{6})/.exec(mail?.text ?? '')?.[1] ?? '';
  };

  const start = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/auth/register/start').send(body);

  const baseBody = (label: string) => {
    const email = `otp-${label}-${unique}@example.com`;
    emails.push(email);
    return {
      email,
      username: `otp${label}${unique}`.slice(0, 16),
      acceptTerms: true,
      acceptPersonalData: true,
    };
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    // Набор проверяет регистрацию без шага Minecraft (ADR-0072) — независимо
    // от того, включена ли интеграция с плагином в локальном .env.
    jest
      .spyOn(app.get(MinecraftLinkService), 'required')
      .mockReturnValue(false);
    jest
      .spyOn(app.get(EmailService), 'send')
      .mockImplementation(async (input) => {
        sent.push(input);
      });
  });

  // Все запросы идут с одного IP: сбрасываем IP-лимиты между сценариями,
  // чтобы проверять логику регистрации, а не накопленный счётчик.
  afterEach(() => {
    const storage = app.get<{ storage: Record<string, unknown> }>(
      ThrottlerStorage,
    );
    for (const key of Object.keys(storage.storage)) delete storage.storage[key];
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    await prisma.legalConsent.deleteMany({ where: { userId: { in: ids } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.emailVerification.deleteMany({
      where: { email: { in: emails } },
    });
    await app.close();
  });

  it('полный путь: start → verify → complete; согласия, реферер, автологин', async () => {
    const referrer = baseBody('ref');
    // Пригласивший — через тот же поток.
    const r1 = await start(referrer).expect(200);
    const rv = await request(app.getHttpServer())
      .post('/auth/register/verify')
      .send({
        verificationId: r1.body.verificationId,
        code: codeFor(referrer.email),
      })
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/register/complete')
      .send({
        verificationId: r1.body.verificationId,
        completionToken: rv.body.completionToken,
        password: 'Sup3rSecretPassw0rd!',
      })
      .expect(201);
    const refUser = await prisma.user.findUniqueOrThrow({
      where: { email: referrer.email },
    });
    expect(refUser.isVerified).toBe(true);
    expect(refUser.referralCode).toBe(referrer.username.toUpperCase());

    const body = {
      ...baseBody('main'),
      referralCode: refUser.referralCode?.toLowerCase(),
    };
    const started = await start(body).expect(200);
    expect(started.body.maskedEmail).toMatch(/^ot\*\*\*@example\.com$/);
    expect(started.body).not.toHaveProperty('code');
    // До создания аккаунта пользователя нет, пароль нигде не хранится.
    expect(
      await prisma.user.findUnique({ where: { email: body.email } }),
    ).toBeNull();

    const verified = await request(app.getHttpServer())
      .post('/auth/register/verify')
      .send({
        verificationId: started.body.verificationId,
        code: codeFor(body.email),
      })
      .expect(200);
    const complete = await request(app.getHttpServer())
      .post('/auth/register/complete')
      .send({
        verificationId: started.body.verificationId,
        completionToken: verified.body.completionToken,
        password: 'Sup3rSecretPassw0rd!',
      })
      .expect(201);
    expect(complete.body.accessToken).toEqual(expect.any(String));
    expect(String(complete.headers['set-cookie'])).toContain('refresh_token=');

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: body.email },
    });
    expect(user.referredBy).toBe(refUser.id);
    const consents = await prisma.legalConsent.findMany({
      where: { userId: user.id },
    });
    expect(consents.map((c) => c.document).sort()).toEqual([
      'personal_data',
      'terms',
    ]);

    // Токен завершения одноразовый.
    await request(app.getHttpServer())
      .post('/auth/register/complete')
      .send({
        verificationId: started.body.verificationId,
        completionToken: verified.body.completionToken,
        password: 'Sup3rSecretPassw0rd!',
      })
      .expect(404);
  });

  it('согласия обязательны и раздельны; неверный реферальный код; занятый ник', async () => {
    const body = baseBody('cons');
    await start({ ...body, acceptTerms: false }).expect(400);
    await start({ ...body, acceptPersonalData: false }).expect(400);
    const badRef = await start({
      ...body,
      referralCode: 'NO_SUCH_CODE_X',
    }).expect(400);
    expect(badRef.body.code ?? badRef.body.message?.code).toBe(
      'referral_invalid',
    );
    const existing = await prisma.user.findFirstOrThrow({
      select: { username: true },
    });
    const taken = await start({
      ...body,
      username: existing.username.toUpperCase(),
    }).expect(409);
    expect(taken.body.code ?? taken.body.message?.code).toBe('username_taken');
  });

  it('неверный код, лимит попыток, просроченный код', async () => {
    const body = baseBody('att');
    const started = await start(body).expect(200);
    const id = started.body.verificationId;
    const right = codeFor(body.email);
    const wrong = right === '000000' ? '111111' : '000000';
    const first = await request(app.getHttpServer())
      .post('/auth/register/verify')
      .send({ verificationId: id, code: wrong })
      .expect(400);
    expect(first.body.attemptsLeft ?? first.body.message?.attemptsLeft).toBe(4);
    for (let i = 0; i < 4; i += 1) {
      await request(app.getHttpServer())
        .post('/auth/register/verify')
        .send({ verificationId: id, code: wrong });
    }
    // Попытки исчерпаны — даже верный код не принимается.
    await request(app.getHttpServer())
      .post('/auth/register/verify')
      .send({ verificationId: id, code: right })
      .expect(429);

    const body2 = baseBody('exp');
    const s2 = await start(body2).expect(200);
    await prisma.emailVerification.update({
      where: { id: s2.body.verificationId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await request(app.getHttpServer())
      .post('/auth/register/verify')
      .send({
        verificationId: s2.body.verificationId,
        code: codeFor(body2.email),
      })
      .expect(400);
    expect(expired.body.code ?? expired.body.message?.code).toBe('otp_expired');
  });

  it('некорректный e-mail — 400; сбой SMTP вне production не ломает поток', async () => {
    await start({ ...baseBody('bad'), email: 'not-an-email' }).expect(400);
    const mailer = app.get(EmailService);
    const spy = jest
      .spyOn(mailer, 'send')
      .mockRejectedValueOnce(new Error('550 relay denied'));
    const body = baseBody('smtp');
    const res = await start(body).expect(200);
    expect(res.body.verificationId).toEqual(expect.any(String));
    spy.mockImplementation(async (input) => {
      sent.push(input);
    });
  });

  it('повторная отправка: cooldown, новый код заменяет старый', async () => {
    const body = baseBody('rs');
    const started = await start(body).expect(200);
    const id = started.body.verificationId;
    const oldCode = codeFor(body.email);
    await request(app.getHttpServer())
      .post('/auth/register/resend')
      .send({ verificationId: id })
      .expect(429);
    await prisma.emailVerification.update({
      where: { id },
      data: { lastSentAt: new Date(Date.now() - 61_000) },
    });
    const resent = await request(app.getHttpServer())
      .post('/auth/register/resend')
      .send({ verificationId: id })
      .expect(200);
    expect(resent.body.resendsLeft).toBe(3);
    const newCode = codeFor(body.email);
    if (newCode !== oldCode) {
      await request(app.getHttpServer())
        .post('/auth/register/verify')
        .send({ verificationId: id, code: oldCode })
        .expect(400);
    }
    await request(app.getHttpServer())
      .post('/auth/register/verify')
      .send({ verificationId: id, code: newCode })
      .expect(200);
  });
});
