import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import { randomUUID } from 'crypto';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { BruteForceService } from '../src/modules/auth/brute-force.service';
import { PermissionService } from '../src/modules/roles/permission.service';
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
    await app.listen(0);
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
    await prisma.auditLog.deleteMany({ where: { actorId: userId } });
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
    // Код, уже принятый при включении, второй раз не подходит. Берётся именно
    // принятый шаг из БД: код «по текущему времени» после смены 30-секундного
    // шага — уже новый законный код, а не повтор.
    const { twoFactorLastStep } = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { twoFactorLastStep: true },
    });
    expect(twoFactorLastStep).not.toBeNull();
    const replay = await http()
      .post('/auth/login/2fa')
      .set('Cookie', cookie)
      .send({ code: hotp(base32Decode(secret), twoFactorLastStep!) });
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

  it('R181: enable/regen/disable и неудачи пишут аудит (IP, user-agent, без секретов); disable — critical у персонала', async () => {
    const auth = `Bearer ${token}`;
    const events = () =>
      prisma.auditLog.findMany({
        where: { actorId: userId, action: { startsWith: '2fa.' } },
        orderBy: { createdAt: 'asc' },
      });
    const base = (await events()).length;
    expect(base).toBeGreaterThanOrEqual(2); // enable + backup_code.used
    expect((await events()).map((e) => e.action)).toEqual(
      expect.arrayContaining(['2fa.enable', '2fa.backup_code.used']),
    );

    // Перевыпуск резервных кодов: неудача, затем успех.
    await allowSameStep();
    await http()
      .post('/auth/2fa/backup-codes')
      .set('Authorization', auth)
      .set('User-Agent', 'e2e-agent/1')
      .send({ code: '000000' })
      .expect(401);
    const regen = await http()
      .post('/auth/2fa/backup-codes')
      .set('Authorization', auth)
      .set('User-Agent', 'e2e-agent/1')
      .send({ code: code() })
      .expect(200);
    const regenCodes: string[] = regen.body.backupCodes;

    // Выключение (пользователь пока без роли персонала — severity info) и
    // повторное включение. Неудачные disable покрыты unit-тестом: лимит
    // throttle на disable — 5/мин на весь набор.
    await allowSameStep();
    await allowSameStep();
    const sameStepCode = code();
    await http()
      .post('/auth/2fa/disable')
      .set('Authorization', auth)
      .set('User-Agent', 'e2e-agent/1')
      .send({ password, code: sameStepCode })
      .expect(200);
    const setup = await http()
      .post('/auth/2fa/setup')
      .set('Authorization', auth)
      .expect(200);
    const oldSecret = secret;
    secret = setup.body.secret;
    const reEnabled = await http()
      .post('/auth/2fa/enable')
      .set('Authorization', auth)
      .set('User-Agent', 'e2e-agent/1')
      .send({ code: code() })
      .expect(200);
    backupCodes = reEnabled.body.backupCodes;

    const rows = (await events()).slice(base);
    expect(rows.map((r) => r.action)).toEqual([
      '2fa.backup_codes.regenerate.failed',
      '2fa.backup_codes.regenerate',
      '2fa.disable',
      '2fa.enable',
    ]);
    for (const row of rows) {
      expect(row.targetType).toBe('user');
      expect(row.targetId).toBe(userId);
      expect(row.ipAddress).toBeTruthy();
      expect(row.userAgent).toBe('e2e-agent/1');
    }
    const disable = rows.find((r) => r.action === '2fa.disable')!;
    expect(disable.severity).toBe('info'); // не персонал
    expect(rows[0]!.severity).toBe('warning');

    // Ни секретов, ни кодов, ни пароля в журнале.
    const dump = JSON.stringify(await events());
    for (const forbidden of [
      oldSecret,
      secret,
      password,
      sameStepCode,
      '000000',
      ...regenCodes,
      ...backupCodes,
    ]) {
      expect(dump).not.toContain(forbidden);
    }

    // Владелец получил уведомление о выключении.
    expect(
      await prisma.notification.count({
        where: { userId, title: { contains: 'выключена' } },
      }),
    ).toBe(1);
  });

  it('R181: disable у персонала (роль с правами) пишется как critical', async () => {
    const role = await prisma.role.create({
      data: {
        name: `${roleSlug}-aud`,
        slug: `${roleSlug}-aud`,
        displayName: 'audit-2fa',
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
    const auth = `Bearer ${token}`;
    await allowSameStep();
    await http()
      .post('/auth/2fa/disable')
      .set('Authorization', auth)
      .send({ password, code: code() })
      .expect(200);
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { actorId: userId, action: '2fa.disable' },
      orderBy: { createdAt: 'desc' },
    });
    expect(row.severity).toBe('critical');
    expect(row.changes).toMatchObject({ staff: true });
    // Вернуть состояние для следующих тестов: включить 2FA и убрать роль.
    const setup = await http()
      .post('/auth/2fa/setup')
      .set('Authorization', auth)
      .expect(200);
    secret = setup.body.secret;
    backupCodes = (
      await http()
        .post('/auth/2fa/enable')
        .set('Authorization', auth)
        .send({ code: code() })
        .expect(200)
    ).body.backupCodes;
    await prisma.userRole.deleteMany({ where: { userId, roleId: role.id } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.role.delete({ where: { id: role.id } });
    await app.get(PermissionService).invalidateUser(userId);
  });

  // 2FA персонала обязательна всегда (Q22), флага нет: guard смотрит на
  // twoFactorEnabled пользователя в БД. Набор требует заданного
  // TWO_FACTOR_ENCRYPTION_KEY; `test:e2e` гоняет его отдельно и последовательно
  // (apps/api/package.json), так как он сам включает/выключает 2FA у своего
  // пользователя и использует общий счётчик brute-force по IP.
  it('2FA персонала обязательна всегда: без 2FA 403 admin_2fa_required, с 2FA доступ', async () => {
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

    // 2FA снова включена — снова пускает.
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });
    await http().get('/admin/dashboard').set('Authorization', auth).expect(200);
  });

  it('ADR-0156: поиск получателей и WS mute_user/ban_user требуют 2FA персонала', async () => {
    const role = await prisma.role.findUniqueOrThrow({
      where: { slug: roleSlug },
    });
    const perms = await prisma.permission.findMany({
      where: {
        key: {
          in: [
            'communications.messages.send',
            'chat.mutes.create',
            'chat.bans.create',
          ],
        },
      },
    });
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
    await app.get(PermissionService).invalidateUser(userId);
    const auth = `Bearer ${token}`;
    const address = app.getHttpServer().address() as AddressInfo;
    const connect = (): Promise<Socket> =>
      new Promise((resolve, reject) => {
        const socket = io(`http://127.0.0.1:${address.port}/chat`, {
          auth: { token },
          transports: ['websocket'],
          forceNew: true,
        });
        socket.once('connect', () => resolve(socket));
        socket.once('connect_error', reject);
      });
    const emitAndWaitError = (socket: Socket, event: string) =>
      new Promise<{ event: string; message: string } | null>((resolve) => {
        const timer = setTimeout(() => resolve(null), 3000);
        socket.once('error', (payload) => {
          clearTimeout(timer);
          resolve(payload);
        });
        socket.emit(event, { userId, reason: 'SPAM' });
      });

    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false },
    });

    const denied = await http()
      .get('/admin/communications/recipients')
      .query({ q: username })
      .set('Authorization', auth)
      .expect(403);
    expect(denied.body.code).toBe('admin_2fa_required');

    const socket = await connect();
    try {
      for (const event of ['mute_user', 'ban_user']) {
        const err = await emitAndWaitError(socket, event);
        expect(err?.event).toBe(event);
        expect(err?.message).toContain('admin_2fa_required');
      }
    } finally {
      socket.disconnect();
    }
    expect(await prisma.chatMute.count({ where: { userId } })).toBe(0);

    // С включённой 2FA поиск получателей доступен.
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });
    await http()
      .get('/admin/communications/recipients')
      .query({ q: username })
      .set('Authorization', auth)
      .expect(200);
  });

  it('админка товаров: мутации без 2FA — 403 admin_2fa_required, с 2FA — доступ', async () => {
    const role = await prisma.role.findUniqueOrThrow({
      where: { slug: roleSlug },
    });
    const perms = await prisma.permission.findMany({
      where: {
        key: {
          in: [
            'store.products.view',
            'store.products.create',
            'store.products.edit',
            'store.products.delete',
            'store.products.variants',
            'store.categories.view',
            'store.categories.create',
            'store.categories.edit',
            'store.categories.delete',
          ],
        },
      },
    });
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
    await app.get(PermissionService).invalidateUser(userId);
    const auth = `Bearer ${token}`;
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false },
    });
    await prisma.siteSettings.updateMany({ data: { requireAdmin2fa: true } });

    const body = {
      name: 'E2E 2FA',
      slug: `e2e-2fa-${randomUUID().slice(0, 8)}`,
      type: 'PRIVILEGE',
      categoryId: 'any',
      variants: [{ duration: 'MONTH_1', price: '1.00' }],
    };
    const denials = [
      http().get('/admin/store/products'),
      http().post('/admin/store/products').send(body),
      http().patch('/admin/store/products/any').send({ name: 'x' }),
      http().delete('/admin/store/products/any'),
      http()
        .post('/admin/store/products/any/variants')
        .send({ duration: 'MONTH_1', price: '1.00' }),
      http().delete('/admin/store/products/any/variants/any'),
      http()
        .patch('/admin/store/products/any/variants/any')
        .send({ price: '2.00' }),
      http().get('/admin/store/categories'),
      http()
        .post('/admin/store/categories')
        .send({ name: 'E2E 2FA cat', slug: 'e2e-2fa-cat' }),
      http().patch('/admin/store/categories/any').send({ name: 'x' }),
      http().delete('/admin/store/categories/any'),
    ];
    for (const req of denials) {
      const denied = await req.set('Authorization', auth).expect(403);
      expect(denied.body.code).toBe('admin_2fa_required');
    }
    expect(await prisma.product.count({ where: { slug: body.slug } })).toBe(0);
    expect(
      await prisma.category.count({ where: { slug: 'e2e-2fa-cat' } }),
    ).toBe(0);

    // С включённой 2FA guard пропускает: список доступен.
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });
    await http()
      .get('/admin/store/products')
      .set('Authorization', auth)
      .expect(200);
    await prisma.siteSettings.updateMany({ data: { requireAdmin2fa: false } });
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
