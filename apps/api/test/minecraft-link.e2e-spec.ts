import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { randomBytes, randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import {
  EmailService,
  SendEmailInput,
} from '../src/modules/email/email.service';
import { signPluginRequest } from '../src/modules/minecraft-link/plugin-signature.guard';
import { PrismaService } from '../src/modules/prisma/prisma.service';

jest.setTimeout(60_000);

const TEST_SECRET = randomBytes(32).toString('hex');

/// ADR-0072: привязка Minecraft при регистрации. Плагин имитируется
/// подписанными запросами (тот же контракт, что у настоящего плагина).
describe('Minecraft link in registration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  /// Секрет, который видит приложение (локальный .env или тестовый).
  let secret = TEST_SECRET;
  const unique = randomUUID().slice(0, 6);
  const sent: SendEmailInput[] = [];
  const emails: string[] = [];
  const uuids: string[] = [];

  const plugin = (
    path: string,
    body: Record<string, string>,
    opts: { secret?: string; ts?: number } = {},
  ) => {
    const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
    return request(app.getHttpServer())
      .post(path)
      .set('x-twomc-timestamp', ts)
      .set(
        'x-twomc-signature',
        signPluginRequest(opts.secret ?? secret, ts, 'POST', path, body),
      )
      .send(body);
  };

  const newPlayer = (label: string) => {
    const uuid = randomUUID();
    uuids.push(uuid);
    return { uuid, name: `mc${label}${unique}`.slice(0, 16) };
  };

  /// Регистрация до подтверждения почты → { verificationId, completionToken }.
  async function verifiedRegistration(username: string) {
    const email = `mc-${username}@example.com`.toLowerCase();
    emails.push(email);
    const start = await request(app.getHttpServer())
      .post('/auth/register/start')
      .send({ email, username, acceptTerms: true, acceptPersonalData: true })
      .expect(200);
    expect(start.body.minecraftRequired).toBe(true);
    const mail = [...sent].reverse().find((m) => m.to === email);
    const code = /(\d{6})/.exec(mail?.text ?? '')?.[1];
    const verify = await request(app.getHttpServer())
      .post('/auth/register/verify')
      .send({ verificationId: start.body.verificationId, code })
      .expect(200);
    return {
      verificationId: start.body.verificationId as string,
      completionToken: verify.body.completionToken as string,
    };
  }

  /// /site-connect в игре → ссылка → страница → 15-символьный код.
  async function linkCode(player: { uuid: string; name: string }) {
    const connect = await plugin(
      '/minecraft/plugin/site-connect',
      player,
    ).expect(200);
    const token = String(connect.body.url).split('/site-connect/')[1];
    const open = await request(app.getHttpServer())
      .post('/minecraft/site-connect/open')
      .send({ token })
      .expect(200);
    expect(open.body.code).toMatch(/^[A-HJ-NP-Z2-9]{15}$/);
    return { code: open.body.code as string, token };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    // Интеграция включена в любом окружении: реальный секрет из .env или тестовый.
    const config = app.get(ConfigService);
    const original = config.get.bind(config) as (
      key: string,
      fallback?: unknown,
    ) => unknown;
    secret = (original('MINECRAFT_PLUGIN_SECRET') as string) || TEST_SECRET;
    jest
      .spyOn(config, 'get')
      .mockImplementation(((key: string, fallback?: unknown) =>
        key === 'MINECRAFT_PLUGIN_SECRET'
          ? secret
          : original(key, fallback)) as never);
    jest
      .spyOn(app.get(EmailService), 'send')
      .mockImplementation(async (input) => {
        sent.push(input);
      });
  });

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
    await prisma.minecraftConnectSession.deleteMany({
      where: { uuid: { in: uuids } },
    });
    await app.close();
  });

  it('плагин: без подписи, с чужим секретом или старой меткой времени — 401', async () => {
    const player = newPlayer('sig');
    await request(app.getHttpServer())
      .post('/minecraft/plugin/site-connect')
      .send(player)
      .expect(401);
    await plugin('/minecraft/plugin/site-connect', player, {
      secret: 'x'.repeat(64),
    }).expect(401);
    await plugin('/minecraft/plugin/site-connect', player, {
      ts: Math.floor(Date.now() / 1000) - 600,
    }).expect(401);
  });

  it('полный путь: почта → /site-connect → 15 символов → 5 символов в игре → аккаунт с привязкой', async () => {
    const player = newPlayer('ok');
    const reg = await verifiedRegistration(player.name);

    const before = await request(app.getHttpServer())
      .post('/auth/register/state')
      .send(reg)
      .expect(200);
    expect(before.body.stage).toBe('minecraft');
    // Без подтверждения в игре аккаунт не создаётся.
    const early = await request(app.getHttpServer())
      .post('/auth/register/complete')
      .send({ ...reg, password: 'Sup3rSecretPassw0rd!' })
      .expect(400);
    expect(early.body.code ?? early.body.message?.code).toBe(
      'minecraft_required',
    );

    const { code } = await linkCode(player);
    // Пробелы/дефисы/регистр при вставке не мешают.
    const pasted =
      `${code.slice(0, 5)}-${code.slice(5, 10)} ${code.slice(10)}`.toLowerCase();
    const issued = await request(app.getHttpServer())
      .post('/auth/register/minecraft/code')
      .send({ ...reg, code: pasted })
      .expect(200);
    expect(issued.body.challenge).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
    expect(issued.body.name).toBe(player.name);

    // Повтор того же 15-символьного кода — «уже использован».
    const replay = await request(app.getHttpServer())
      .post('/auth/register/minecraft/code')
      .send({ ...reg, code })
      .expect(400);
    expect(replay.body.code ?? replay.body.message?.code).toBe('mc_code_used');

    const wrong = await plugin('/minecraft/plugin/site-connect/confirm', {
      ...player,
      code: issued.body.challenge === 'AAAAA' ? 'BBBBB' : 'AAAAA',
    }).expect(200);
    expect(wrong.body).toMatchObject({ status: 'invalid', attemptsLeft: 4 });

    const ok = await plugin('/minecraft/plugin/site-connect/confirm', {
      ...player,
      code: issued.body.challenge.toLowerCase(),
    }).expect(200);
    expect(ok.body.status).toBe('confirmed');
    // Повтор подтверждения ничего не меняет.
    const again = await plugin('/minecraft/plugin/site-connect/confirm', {
      ...player,
      code: issued.body.challenge,
    }).expect(200);
    expect(again.body.status).toBe('not_found');

    const after = await request(app.getHttpServer())
      .post('/auth/register/state')
      .send(reg)
      .expect(200);
    expect(after.body.stage).toBe('create');
    expect(after.body.minecraft).toMatchObject({
      confirmed: true,
      name: player.name,
    });

    await request(app.getHttpServer())
      .post('/auth/register/complete')
      .send({ ...reg, password: 'Sup3rSecretPassw0rd!' })
      .expect(201);
    const user = await prisma.user.findUniqueOrThrow({
      where: { username: player.name },
      include: { minecraftAccount: true },
    });
    expect(user.minecraftAccount).toMatchObject({
      uuid: player.uuid,
      name: player.name,
    });

    // Тот же Minecraft-аккаунт для новой регистрации — отказ.
    const other = newPlayer('dup');
    const reg2 = await verifiedRegistration(other.name);
    const { code: code2 } = await linkCode({
      uuid: player.uuid,
      name: other.name,
    });
    const dup = await request(app.getHttpServer())
      .post('/auth/register/minecraft/code')
      .send({ ...reg2, code: code2 })
      .expect(409);
    expect(dup.body.code ?? dup.body.message?.code).toBe('minecraft_taken');
  });

  it('чужой ник, неверный и просроченный код; одновременное использование — только один успех', async () => {
    const player = newPlayer('chk');
    const reg = await verifiedRegistration(player.name);
    const stranger = newPlayer('str');
    const { code: strangerCode } = await linkCode(stranger);
    const wrongAccount = await request(app.getHttpServer())
      .post('/auth/register/minecraft/code')
      .send({ ...reg, code: strangerCode })
      .expect(400);
    expect(wrongAccount.body.code ?? wrongAccount.body.message?.code).toBe(
      'mc_wrong_account',
    );

    const invalid = await request(app.getHttpServer())
      .post('/auth/register/minecraft/code')
      .send({ ...reg, code: 'ABCDEFGHJKLMNPQ' })
      .expect(400);
    expect(invalid.body.code ?? invalid.body.message?.code).toBe(
      'mc_code_invalid',
    );

    const { code: expiredCode, token } = await linkCode(player);
    const session = await prisma.minecraftConnectSession.findFirstOrThrow({
      where: { uuid: player.uuid },
      orderBy: { createdAt: 'desc' },
    });
    await prisma.minecraftConnectSession.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await request(app.getHttpServer())
      .post('/auth/register/minecraft/code')
      .send({ ...reg, code: expiredCode })
      .expect(400);
    expect(expired.body.code ?? expired.body.message?.code).toBe(
      'mc_code_expired',
    );
    const expiredLink = await request(app.getHttpServer())
      .post('/minecraft/site-connect/open')
      .send({ token })
      .expect(400);
    expect(expiredLink.body.code ?? expiredLink.body.message?.code).toBe(
      'link_expired',
    );

    const { code } = await linkCode(player);
    const results = await Promise.all(
      [0, 1].map(() =>
        request(app.getHttpServer())
          .post('/auth/register/minecraft/code')
          .send({ ...reg, code }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });

  it('5-символьный код: срок истёк → новый код; лимит попыток', async () => {
    const player = newPlayer('ttl');
    const reg = await verifiedRegistration(player.name);
    const { code } = await linkCode(player);
    const issued = await request(app.getHttpServer())
      .post('/auth/register/minecraft/code')
      .send({ ...reg, code })
      .expect(200);
    await prisma.emailVerification.update({
      where: { id: reg.verificationId },
      data: { mcChallengeExpiresAt: new Date(Date.now() - 1000) },
    });
    const late = await plugin('/minecraft/plugin/site-connect/confirm', {
      ...player,
      code: issued.body.challenge,
    }).expect(200);
    expect(late.body.status).toBe('expired');

    const renewed = await request(app.getHttpServer())
      .post('/auth/register/minecraft/challenge')
      .send(reg)
      .expect(200);
    expect(renewed.body.challenge).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
    const wrongCode = renewed.body.challenge === 'AAAAA' ? 'BBBBB' : 'AAAAA';
    for (let i = 0; i < 5; i += 1) {
      await plugin('/minecraft/plugin/site-connect/confirm', {
        ...player,
        code: wrongCode,
      });
    }
    const locked = await plugin('/minecraft/plugin/site-connect/confirm', {
      ...player,
      code: renewed.body.challenge,
    }).expect(200);
    expect(locked.body.status).toBe('attempts');
  });
});
