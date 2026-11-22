import './helpers/wallet-env';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { APP_CREATE_OPTIONS, configureApp } from './../src/configure-app';
import { markStaffTwoFactorEnabled } from './helpers/staff-two-factor';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';
import { TwoFactorService } from '../src/modules/auth/two-factor/two-factor.service';
import { WalletExecutor } from '../src/modules/delivery/executors/wallet.executor';
import { WalletLedgerService } from '../src/modules/wallet/wallet-ledger.service';

jest.setTimeout(30_000);

/// Кошелёк рубинов (0.15, ADR-0191). Спека НЕ запускалась при написании (нет
/// БД в сеансе) — прогнать на одноразовой БД при «ресурсы свободны», после
/// применения миграции 20261124100000_wallet_ledger. Свежий код 2FA подменён
/// заглушкой (принимает только 123456). Журнал append-only (триггер БД), поэтому
/// строки журнала тестовых пользователей после прогона остаются (без FK):
/// использовать только одноразовую БД. Права wallet.view/wallet.adjust
/// синхронизируются реестром прав при старте.
describe('Кошелёк рубинов (0.15, e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  let executor: WalletExecutor;
  let ledger: WalletLedgerService;
  const unique = randomUUID().slice(0, 8);
  const password = 'Sup3rSecretPassw0rd!';
  const GOOD_CODE = '123456';
  const roleSlugs: string[] = [];
  const extraUsers: string[] = [];

  interface TestUser {
    id: string;
    accessToken: string;
  }
  let viewer: TestUser;
  let adjuster: TestUser;
  let player: TestUser;

  const http = () => request(app.getHttpServer());
  const auth = (u: TestUser) => `Bearer ${u.accessToken}`;

  async function createUser(label: string): Promise<TestUser> {
    const email = `wl-${label}-${unique}@example.com`;
    const username = `wl${label}${unique}`
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 16);
    await http()
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);
    const login = await http()
      .post('/auth/login')
      .send({ emailOrUsername: email, password })
      .expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { id: user.id, accessToken: login.body.accessToken };
  }

  async function makeStaff(user: TestUser, slug: string, keys: string[]) {
    roleSlugs.push(slug);
    const role = await prisma.role.create({
      data: {
        name: slug,
        slug,
        displayName: slug,
        priority: 20,
        isSystem: false,
        isAssignable: true,
      },
    });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });
    await markStaffTwoFactorEnabled(prisma, user.id);
    const records = await prisma.permission.findMany({
      where: { key: { in: keys } },
    });
    await prisma.rolePermission.createMany({
      data: records.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
    await permissions.invalidateRole(role.id);
    await permissions.invalidateUser(user.id);
  }

  const task = (orderItemId: string, quantity: number, userId: string) => ({
    taskId: `t-${orderItemId}`,
    orderItemId,
    orderId: `o-${orderItemId}`,
    step: 1,
    executor: 'wallet',
    attempt: 1,
    idempotencyKey: `${orderItemId}:1`,
    nick: null,
    recipientUserId: userId,
    quantity,
    decorationId: null,
    renderedCommand: null,
  });

  const adjust = (u: TestUser, userId: string, body: Record<string, unknown>) =>
    http()
      .post(`/admin/wallet/users/${userId}/adjust`)
      .set('Authorization', auth(u))
      .send({ reason: 'тест', twoFactorCode: GOOD_CODE, ...body });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TwoFactorService)
      .useValue({
        available: true,
        verify: (_id: string, code: string) =>
          Promise.resolve(code === GOOD_CODE ? 'totp' : null),
      })
      .compile();
    app = moduleFixture.createNestApplication(APP_CREATE_OPTIONS);
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    permissions = app.get(PermissionService);
    executor = app.get(WalletExecutor);
    ledger = app.get(WalletLedgerService);
    viewer = await createUser('viewer');
    adjuster = await createUser('adjuster');
    player = await createUser('player');
    await makeStaff(viewer, `e2e-wl-view-${unique}`, ['wallet.view']);
    await makeStaff(adjuster, `e2e-wl-adj-${unique}`, [
      'wallet.view',
      'wallet.adjust',
    ]);
  });

  // Сбрасываем лимиты между тестами: на корректировке стоит @Throttle.
  afterEach(() => {
    const storage = app.get<{ storage: Record<string, unknown> }>(
      ThrottlerStorage,
    );
    for (const key of Object.keys(storage.storage)) delete storage.storage[key];
  });

  afterAll(async () => {
    const users = [viewer, adjuster, player]
      .filter(Boolean)
      .map((u) => u.id)
      .concat(extraUsers);
    await prisma.userRole.deleteMany({
      where: { role: { slug: { in: roleSlugs } } },
    });
    await prisma.rolePermission.deleteMany({
      where: { role: { slug: { in: roleSlugs } } },
    });
    await prisma.role.deleteMany({ where: { slug: { in: roleSlugs } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: users } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  });

  it('GET /wallet/history: без токена 401; пустая история у нового игрока', async () => {
    await http().get('/wallet/history').expect(401);
    const res = await http()
      .get('/wallet/history')
      .set('Authorization', auth(player))
      .expect(200);
    expect(res.body).toMatchObject({ items: [], total: 0, page: 1 });
  });

  it('покупка: +100 рубинов, повтор не зачисляет вторично, баланс и история видны', async () => {
    const t = task(`i-${unique}-a`, 100, player.id);
    await expect(executor.execute(t)).resolves.toMatchObject({
      kind: 'delivered',
    });
    await expect(executor.execute(t)).resolves.toMatchObject({
      kind: 'delivered',
    });
    await Promise.all([executor.execute(t), executor.execute(t)]);

    const balance = await http()
      .get('/wallet')
      .set('Authorization', auth(player))
      .expect(200);
    expect(balance.body.balances).toContainEqual({
      currency: 'RUBY',
      amountMinor: '100',
      scale: 0,
    });
    const history = await http()
      .get('/wallet/history?limit=10')
      .set('Authorization', auth(player))
      .expect(200);
    expect(history.body.total).toBe(1);
    expect(history.body.items[0]).toMatchObject({
      kind: 'PURCHASE',
      amount: '100',
      balanceAfter: '100',
    });
    expect(history.body.items[0].actorId).toBeUndefined();
  });

  it('баланс = сумма журнала (сверка)', async () => {
    const recon = await ledger.reconcile(player.id);
    expect(recon.consistent).toBe(true);
    expect(recon.ledger).toBe(100n);
  });

  it('админ-просмотр: без права 403, с wallet.view — баланс и история', async () => {
    await http()
      .get(`/admin/wallet/users/${player.id}`)
      .set('Authorization', auth(player))
      .expect(403);
    const res = await http()
      .get(`/admin/wallet/users/${player.id}`)
      .set('Authorization', auth(viewer))
      .expect(200);
    expect(res.body).toMatchObject({ balance: '100', consistent: true });
    expect(res.body.history.items[0].actorId).toBeDefined();
  });

  it('корректировка: без wallet.adjust 403; неверный код 403; причина обязательна', async () => {
    await adjust(viewer, player.id, { amount: '10' }).expect(403);
    await adjust(adjuster, player.id, {
      amount: '10',
      twoFactorCode: '000000',
    }).expect(403);
    await adjust(adjuster, player.id, { amount: '10', reason: ' ' }).expect(
      400,
    );
  });

  it('корректировка: +50, потолок, нельзя в минус, аудит', async () => {
    const ok = await adjust(adjuster, player.id, {
      amount: '50',
      reason: 'компенсация',
    }).expect(201);
    expect(ok.body.balance).toBe('150');
    // WALLET_ADJUST_MAX = 1000 (helpers/wallet-env.ts)
    await adjust(adjuster, player.id, { amount: '1001' }).expect(400);
    const minus = await adjust(adjuster, player.id, {
      amount: '-151',
    }).expect(409);
    expect(minus.body.code).toBe('wallet_insufficient');
    const audit = await prisma.auditLog.findMany({
      where: { actorId: adjuster.id, action: 'wallet.adjusted' },
    });
    expect(audit).toHaveLength(1);
    expect((await ledger.reconcile(player.id)).consistent).toBe(true);
  });

  it('корректировка: повтор с тем же requestId не применяется дважды', async () => {
    const body = { amount: '5', requestId: `req-${unique}-1` };
    const a = await adjust(adjuster, player.id, body).expect(201);
    const b = await adjust(adjuster, player.id, body).expect(201);
    expect(a.body.replayed).toBe(false);
    expect(b.body.replayed).toBe(true);
    expect(b.body.balance).toBe(a.body.balance);
  });

  it('параллельные списания не уводят в минус', async () => {
    const target = await createUser('race');
    extraUsers.push(target.id);
    await adjust(adjuster, target.id, { amount: '100' }).expect(201);
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        adjust(adjuster, target.id, { amount: '-40' }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    const recon = await ledger.reconcile(target.id);
    expect(recon.ledger).toBe(20n);
    expect(recon.consistent).toBe(true);
  });
});
