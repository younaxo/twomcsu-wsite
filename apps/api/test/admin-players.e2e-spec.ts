import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { AuditService } from '../src/modules/audit/audit.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';
import { markStaffTwoFactorEnabled } from './helpers/staff-two-factor';

jest.setTimeout(30_000);

/// Q116: админский просмотр инвентаря и статистики игрока.
describe('Admin players view (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  const unique = randomUUID().slice(0, 6);
  const password = 'Sup3rSecretPassw0rd!';
  const userIds: string[] = [];
  const roleIds: string[] = [];
  /// Тестовая константа (не секрет): включает admin-2FA, иначе кейс
  /// admin_2fa_required не исполняется.
  const TEST_TWO_FACTOR_KEY = 'e2e-admin-players-test-only-key-0123456789ab';
  const previousTwoFactorKey = process.env.TWO_FACTOR_ENCRYPTION_KEY;
  const http = () => request(app.getHttpServer());

  async function createUser(label: string) {
    const email = `ap-${label}-${unique}@example.com`;
    const username = `ap${label}${unique}`.slice(0, 16);
    await http()
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);
    const login = await http()
      .post('/auth/login')
      .send({ emailOrUsername: username, password })
      .expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    userIds.push(user.id);
    return { id: user.id, auth: `Bearer ${login.body.accessToken}` };
  }

  async function giveRole(
    userId: string,
    keys: string[],
    withTwoFactor = true,
  ) {
    const slug = `ap-${unique}-${roleIds.length}`;
    const role = await prisma.role.create({
      data: {
        name: slug,
        slug,
        displayName: slug,
        priority: 10,
        isSystem: false,
        isAssignable: true,
      },
    });
    roleIds.push(role.id);
    const records = await prisma.permission.findMany({
      where: { key: { in: keys } },
    });
    await prisma.rolePermission.createMany({
      data: records.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
    await prisma.userRole.create({ data: { userId, roleId: role.id } });
    if (withTwoFactor) await markStaffTwoFactorEnabled(prisma, userId);
    await permissions.invalidateRole(role.id);
    await permissions.invalidateUser(userId);
  }

  let target: { id: string; auth: string };
  let admin: { id: string; auth: string };
  let moderator: { id: string; auth: string };
  let no2fa: { id: string; auth: string };
  let plain: { id: string; auth: string };

  beforeAll(async () => {
    process.env.TWO_FACTOR_ENCRYPTION_KEY = TEST_TWO_FACTOR_KEY;
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    permissions = app.get(PermissionService);
    // Новое право может быть ещё не засеяно в тестовой БД.
    await prisma.permission.upsert({
      where: { key: 'players.inventory.view' },
      create: {
        key: 'players.inventory.view',
        module: 'players',
        description: 'Просмотр инвентаря и статистики игрока (Q116)',
      },
      update: {},
    });
    target = await createUser('target');
    admin = await createUser('admin');
    moderator = await createUser('mod');
    plain = await createUser('plain');
    no2fa = await createUser('no2fa');
    await giveRole(admin.id, ['players.inventory.view']);
    await giveRole(moderator.id, ['users.view']);
    await giveRole(no2fa.id, ['players.inventory.view'], false);
  });

  afterAll(async () => {
    if (previousTwoFactorKey === undefined) {
      delete process.env.TWO_FACTOR_ENCRYPTION_KEY;
    } else {
      process.env.TWO_FACTOR_ENCRYPTION_KEY = previousTwoFactorKey;
    }
    if (app) {
      await prisma.auditLog.deleteMany({
        where: { actorId: { in: userIds } },
      });
      await prisma.playerInventory.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.playerStatistics.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: roleIds } },
      });
      await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
      await prisma.refreshToken.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await app.close();
    }
  });

  const paths = (id: string) => [
    `/admin/players/${id}/inventory`,
    `/admin/players/${id}/stats`,
  ];

  it('без токена 401, обычный пользователь и модератор без права 403', async () => {
    for (const path of paths(target.id)) {
      await http().get(path).expect(401);
      await http().get(path).set('Authorization', plain.auth).expect(403);
      await http().get(path).set('Authorization', moderator.auth).expect(403);
    }
  });

  it('с правом: пустой инвентарь и пустая статистика, 200', async () => {
    const inv = await http()
      .get(`/admin/players/${target.id}/inventory`)
      .set('Authorization', admin.auth)
      .expect(200);
    expect(inv.body).toEqual({
      state: 'no_data',
      servers: [],
      viewer: { relation: 'admin' },
    });
    const stats = await http()
      .get(`/admin/players/${target.id}/stats`)
      .set('Authorization', admin.auth)
      .expect(200);
    expect(stats.body).toEqual({
      state: 'no_data',
      stats: null,
      viewer: { relation: 'admin' },
    });
  });

  it('статистика с данными: поля без приватных', async () => {
    await prisma.playerStatistics.create({
      data: {
        userId: target.id,
        playTime: 120,
        kills: 4,
        deaths: 2,
        hits: 9,
        killDeathRatio: 2,
        lastServer: 'survival',
      },
    });
    const res = await http()
      .get(`/admin/players/${target.id}/stats`)
      .set('Authorization', admin.auth)
      .expect(200);
    expect(res.body.state).toBe('ok');
    expect(res.body.stats).toMatchObject({
      playTimeMinutes: 120,
      kills: 4,
      deaths: 2,
      hits: 9,
      killDeathRatio: 2,
      lastServer: 'survival',
    });
    expect(res.body.stats.userId).toBeUndefined();
  });

  it('право есть, 2FA нет: 403 admin_2fa_required', async () => {
    for (const path of paths(target.id)) {
      const res = await http()
        .get(path)
        .set('Authorization', no2fa.auth)
        .expect(403);
      expect(JSON.stringify(res.body)).toContain('admin_2fa_required');
    }
  });

  it('инвентарь со снимком: слоты в ответе, без служебных полей', async () => {
    await prisma.playerInventory.create({
      data: {
        userId: target.id,
        serverSlug: 'survival',
        grp: 'main',
        epoch: 'e1',
        rev: 1,
        slots: [
          {
            area: 'hotbar',
            slot: 0,
            item: { id: 'minecraft:diamond', count: 3 },
          },
        ],
        slotCount: 1,
        contentHash: 'a'.repeat(64),
        capturedAt: new Date(),
        lastSeenAt: new Date(),
        playerOnline: true,
      },
    });
    const res = await http()
      .get(`/admin/players/${target.id}/inventory`)
      .set('Authorization', admin.auth)
      .expect(200);
    expect(res.body.state).toBe('ok');
    expect(res.body.viewer).toEqual({ relation: 'admin' });
    const srv = res.body.servers.find(
      (x: { server: { slug: string } }) => x.server.slug === 'survival',
    );
    const main = srv.groups.find((g: { group: string }) => g.group === 'main');
    expect(main.state).toBe('ok');
    expect(main.slots).toHaveLength(1);
    expect(main.slots[0]).toMatchObject({
      area: 'hotbar',
      slot: 0,
      item: { id: 'minecraft:diamond', count: 3 },
    });
    expect(JSON.stringify(res.body)).not.toContain('contentHash');
  });

  it('аудит: запись о просмотре без содержимого (свои данные теста)', async () => {
    const auditTarget = await createUser('audt');
    for (const path of paths(auditTarget.id)) {
      await http()
        .get(path)
        .set('Authorization', admin.auth)
        .set('User-Agent', 'e2e-agent-' + 'z'.repeat(300))
        .expect(200);
    }
    const rows = await prisma.auditLog.findMany({
      where: { actorId: admin.id, targetId: auditTarget.id },
    });
    expect(rows.map((r) => r.action).sort()).toEqual([
      'players.inventory.view',
      'players.stats.view',
    ]);
    for (const row of rows) {
      expect(row.targetType).toBe('user');
      expect(row.changes).toBeNull();
      expect(row.ipAddress).toBeTruthy();
      expect(row.userAgent).toBe(
        ('e2e-agent-' + 'z'.repeat(300)).slice(0, 255),
      );
    }
  });

  it('сбой записи аудита: данные не отдаются (5xx)', async () => {
    const spy = jest
      .spyOn(app.get(AuditService), 'log')
      .mockRejectedValue(new Error('audit down'));
    try {
      for (const path of paths(target.id)) {
        const res = await http().get(path).set('Authorization', admin.auth);
        expect(res.status).toBeGreaterThanOrEqual(500);
        expect(res.body.state).toBeUndefined();
      }
    } finally {
      spy.mockRestore();
    }
  });

  it('404 для несуществующего пользователя', async () => {
    for (const path of paths('no-such-user')) {
      await http().get(path).set('Authorization', admin.auth).expect(404);
    }
  });

  it('невалидный server: 422', async () => {
    await http()
      .get(`/admin/players/${target.id}/inventory?server=BAD%20SLUG`)
      .set('Authorization', admin.auth)
      .expect(422);
  });
});
