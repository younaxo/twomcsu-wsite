import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { BruteForceService } from '../src/modules/auth/brute-force.service';
import { PermissionService } from '../src/modules/roles/permission.service';
import { resetAdmin2faCache } from '../src/modules/roles/guards/permissions.guard';
import {
  base32Decode,
  hotp,
  totpStep,
} from '../src/modules/auth/two-factor/totp';

jest.setTimeout(30_000);

/// ADR-0109: TOTP 2FA — настройка, вход в два шага, резервные коды, защита от
/// повтора и перебора, требование 2FA персоналу.
describe('Двухфакторная аутентификация (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const unique = randomUUID().slice(0, 8);
  const email = `twofa-${unique}@example.com`;
  const username = `tfa${unique}`.slice(0, 16);
  const password = 'Sup3rSecretPassw0rd!';
  let userId: string;
  let token: string;
  let secret: string;
  let backupCodes: string[];
  const roleSlug = `e2e-2fa-${unique}`;

  const http = () => request(app.getHttpServer());
  const code = (offset = 0) =>
    hotp(base32Decode(secret), totpStep(Date.now()) + offset);
  /// Тестовый «следующий шаг»: сбросить последний принятый шаг, чтобы снова
  /// принять текущий код (в жизни — следующие 30 секунд).
  const allowSameStep = () =>
    prisma.user.update({
      where: { id: userId },
      data: { twoFactorLastStep: null },
    });
  const cookieOf = (res: request.Response, name: string) =>
    ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .find((value) => value.startsWith(`${name}=`));
  const resetBruteForce = async () => {
    const guard = app.get(BruteForceService);
    await Promise.all(
      ['127.0.0.1', '::ffff:127.0.0.1', '::1'].map((ip) => guard.reset(ip)),
    );
  };
  const passwordLogin = () =>
    http().post('/auth/login').send({ emailOrUsername: username, password });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await http()
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);
    const login = await passwordLogin().expect(200);
    token = login.body.accessToken;
    userId = (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  });

  afterAll(async () => {
    await prisma.siteSettings.updateMany({ data: { requireAdmin2fa: false } });
    resetAdmin2faCache();
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.role.deleteMany({ where: { slug: roleSlug } });
    await app.close();
  });

  it('настройка: QR-URI, неверный код не включает, верный — включает и даёт 10 резервных кодов', async () => {
    const auth = `Bearer ${token}`;
    const status = await http()
      .get('/auth/2fa')
      .set('Authorization', auth)
      .expect(200);
    expect(status.body).toEqual({
      available: true,
      enabled: false,
      enabledAt: null,
      backupCodesRemaining: 0,
    });

    const setup = await http()
      .post('/auth/2fa/setup')
      .set('Authorization', auth)
      .expect(200);
    secret = setup.body.secret;
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(setup.body.otpauthUri).toContain(`secret=${secret}`);
    expect(setup.body.otpauthUri).toContain('issuer=twomc.su');

    await http()
      .post('/auth/2fa/enable')
      .set('Authorization', auth)
      .send({ code: code() === '000000' ? '111111' : '000000' })
      .expect(400);
    const enabled = await http()
      .post('/auth/2fa/enable')
      .set('Authorization', auth)
      .send({ code: code() })
      .expect(200);
    backupCodes = enabled.body.backupCodes;
    expect(backupCodes).toHaveLength(10);

    // В БД — только шифротекст и хеши.
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      omit: { twoFactorSecret: false },
    });
    expect(row.twoFactorEnabled).toBe(true);
    expect(row.twoFactorSecret).toMatch(/^v1\./);
    expect(row.twoFactorSecret).not.toContain(secret);
    const hashes = await prisma.twoFactorBackupCode.findMany({
      where: { userId },
    });
    expect(hashes).toHaveLength(10);
    expect(hashes.some((item) => backupCodes.includes(item.codeHash))).toBe(
      false,
    );

    // Секрет не уходит наружу ни в /auth/me, ни повторно в setup.
    const me = await http()
      .get('/auth/me')
      .set('Authorization', auth)
      .expect(200);
    expect(me.body.twoFactorEnabled).toBe(true);
    expect(JSON.stringify(me.body)).not.toContain(secret);
    await http().post('/auth/2fa/setup').set('Authorization', auth).expect(409);
  });

  it('вход: пароль → челлендж в httpOnly cookie без токенов; код → сессия; повтор кода — нет', async () => {
    const first = await passwordLogin().expect(200);
    expect(first.body).toEqual({ twoFactorRequired: true });
    expect(cookieOf(first, 'refresh_token')).toBeUndefined();
    const challenge = cookieOf(first, 'two_factor_challenge');
    expect(challenge).toMatch(/HttpOnly/i);
    expect(challenge).toMatch(/Path=\/auth/);
    const cookie = challenge!.split(';')[0]!;

    await http()
      .post('/auth/login/2fa')
      .send({ code: code() })
      .expect(401)
      .expect((res) => expect(res.body.code).toBe('two_factor_expired'));
    // Код, уже принятый при включении (тот же шаг), второй раз не подходит.
    const replay = await http()
      .post('/auth/login/2fa')
      .set('Cookie', cookie)
      .send({ code: code() });
    expect(replay.status).toBe(401);
    await resetBruteForce();

    await allowSameStep();
    const ok = await http()
      .post('/auth/login/2fa')
      .set('Cookie', cookie)
      .send({ code: code() })
      .expect(200);
    expect(ok.body.accessToken).toEqual(expect.any(String));
    expect(ok.body.user.id).toBe(userId);
    expect(cookieOf(ok, 'refresh_token')).toBeDefined();
    // Челлендж одноразовый.
    await http()
      .post('/auth/login/2fa')
      .set('Cookie', cookie)
      .send({ code: code() })
      .expect(401);
  });

  it('резервный код: работает один раз; 5 неверных кодов сжигают челлендж', async () => {
    const challenge = async () =>
      cookieOf(
        await passwordLogin().expect(200),
        'two_factor_challenge',
      )!.split(';')[0]!;

    const cookie = await challenge();
    await http()
      .post('/auth/login/2fa')
      .set('Cookie', cookie)
      .send({ code: backupCodes[0]!.toUpperCase() })
      .expect(200);
    const again = await challenge();
    await http()
      .post('/auth/login/2fa')
      .set('Cookie', again)
      .send({ code: backupCodes[0] })
      .expect(401);
    const status = await http()
      .get('/auth/2fa')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(status.body.backupCodesRemaining).toBe(9);

    const locked = await challenge();
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const res = await http()
        .post('/auth/login/2fa')
        .set('Cookie', locked)
        .send({ code: 'zzzz-zzzz' })
        .expect(401);
      expect(res.body.code).toBe('two_factor_invalid');
      expect(res.body.attemptsLeft).toBe(5 - attempt);
    }
    const fifth = await http()
      .post('/auth/login/2fa')
      .set('Cookie', locked)
      .send({ code: 'zzzz-zzzz' })
      .expect(401);
    expect(fifth.body.code).toBe('two_factor_locked');
    await allowSameStep();
    await http()
      .post('/auth/login/2fa')
      .set('Cookie', locked)
      .send({ code: code() })
      .expect(401)
      .expect((res) => expect(res.body.code).toBe('two_factor_expired'));
    // Неудачи 2FA считаются попытками входа с IP. e2e-наборы в CI идут
    // параллельно с одного адреса — сбросить счётчик, чтобы не задеть соседей.
    await resetBruteForce();
  });

  it('requireAdmin2fa: персонал без 2FA получает 403 admin_2fa_required, с 2FA — доступ', async () => {
    const role = await prisma.role.create({
      data: {
        name: roleSlug,
        slug: roleSlug,
        displayName: roleSlug,
        priority: 10,
        isSystem: false,
        isAssignable: true,
      },
    });
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { key: 'dashboard.view' },
    });
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: permission.id },
    });
    await prisma.userRole.create({ data: { userId, roleId: role.id } });
    await app.get(PermissionService).invalidateUser(userId);
    await prisma.siteSettings.updateMany({ data: { requireAdmin2fa: true } });
    resetAdmin2faCache();
    const auth = `Bearer ${token}`;

    // С включённой 2FA — пускает.
    await http().get('/admin/dashboard').set('Authorization', auth).expect(200);

    // Без 2FA — понятный отказ с кодом.
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false },
    });
    const denied = await http()
      .get('/admin/dashboard')
      .set('Authorization', auth)
      .expect(403);
    expect(denied.body.code).toBe('admin_2fa_required');

    // Требование выключено — снова пускает.
    await prisma.siteSettings.updateMany({ data: { requireAdmin2fa: false } });
    resetAdmin2faCache();
    await http().get('/admin/dashboard').set('Authorization', auth).expect(200);
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });
  });

  it('отключение: нужен пароль и код; после — вход без второго шага', async () => {
    const auth = `Bearer ${token}`;
    await http()
      .post('/auth/2fa/disable')
      .set('Authorization', auth)
      .send({ password: 'wrong-password', code: backupCodes[1] })
      .expect(401);
    await http()
      .post('/auth/2fa/disable')
      .set('Authorization', auth)
      .send({ password, code: 'zzzz-zzzz' })
      .expect(401);
    await resetBruteForce();
    await http()
      .post('/auth/2fa/disable')
      .set('Authorization', auth)
      .send({ password, code: backupCodes[1] })
      .expect(200);
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      omit: { twoFactorSecret: false },
    });
    expect(row.twoFactorEnabled).toBe(false);
    expect(row.twoFactorSecret).toBeNull();
    expect(await prisma.twoFactorBackupCode.count({ where: { userId } })).toBe(
      0,
    );
    const login = await passwordLogin().expect(200);
    expect(login.body.accessToken).toEqual(expect.any(String));
  });
});
