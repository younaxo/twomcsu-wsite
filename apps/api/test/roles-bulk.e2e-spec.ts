import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';

jest.setTimeout(20_000);

/// ADR-0068: массовое изменение прав ролей.
describe('Roles bulk permissions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  const unique = randomUUID().slice(0, 8);
  const password = 'Sup3rSecretPassw0rd!';
  const userIds: string[] = [];
  const roleIds: string[] = [];

  async function createUser(label: string) {
    const email = `rb-${label}-${unique}@example.com`;
    const username = `rb${label}${unique}`.slice(0, 16);
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

  async function createRole(
    label: string,
    priority: number,
    keys: string[] = [],
    flags: { isSuperuser?: boolean } = {},
  ) {
    const slug = `rb-${label}-${unique}`;
    const role = await prisma.role.create({
      data: { name: slug, slug, displayName: slug, priority, ...flags },
    });
    roleIds.push(role.id);
    if (keys.length > 0) {
      const records = await prisma.permission.findMany({
        where: { key: { in: keys } },
      });
      await prisma.rolePermission.createMany({
        data: records.map((p) => ({ roleId: role.id, permissionId: p.id })),
      });
    }
    return role;
  }

  async function keysOf(roleId: string) {
    const rows = await prisma.rolePermission.findMany({
      where: { roleId },
      include: { permission: true },
    });
    return rows.map((r) => r.permission.key).sort();
  }

  const MANAGER_KEYS = [
    'permissions.manage',
    'roles.bulk.edit',
    'roles.view',
    'chat.messages.delete',
    'reports.stats',
  ];
  let manager: { id: string; auth: string };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    permissions = app.get(PermissionService);

    manager = await createUser('mg');
    const managerRole = await createRole('manager', 500, MANAGER_KEYS);
    await prisma.userRole.create({
      data: { userId: manager.id, roleId: managerRole.id },
    });
    await permissions.invalidateUser(manager.id);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: roleIds } },
    });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  const bulk = (auth: string, body: object) =>
    request(app.getHttpServer())
      .post('/admin/roles/bulk/permissions')
      .set('Authorization', auth)
      .send(body);

  it('без permission — 403', async () => {
    const plain = await createUser('pl');
    const role = await createRole('t0', 10);
    await bulk(plain.auth, {
      roleIds: [role.id],
      add: ['reports.stats'],
    }).expect(403);
  });

  it('add / remove по нескольким ролям, audit родитель + дети', async () => {
    const a = await createRole('a', 100, ['reports.stats']);
    const b = await createRole('b', 110);
    const added = await bulk(manager.auth, {
      roleIds: [a.id, b.id],
      add: ['chat.messages.delete'],
    }).expect(201);
    expect(added.body.updated).toHaveLength(2);
    expect(await keysOf(a.id)).toEqual([
      'chat.messages.delete',
      'reports.stats',
    ]);
    expect(await keysOf(b.id)).toEqual(['chat.messages.delete']);

    await bulk(manager.auth, {
      roleIds: [a.id, b.id],
      remove: ['reports.stats'],
    }).expect(201);
    expect(await keysOf(a.id)).toEqual(['chat.messages.delete']);

    const parent = await prisma.auditLog.count({
      where: { actorId: manager.id, action: 'roles.bulk.permissions' },
    });
    const children = await prisma.auditLog.findMany({
      where: { actorId: manager.id, action: 'roles.permissions.update' },
    });
    expect(parent).toBe(2);
    expect(children.map((c) => c.targetId).sort()).toEqual(
      [a.id, b.id, a.id].sort(),
    );
  });

  it('replace требует подтверждения', async () => {
    const c = await createRole('c', 120, ['chat.messages.delete']);
    await bulk(manager.auth, {
      roleIds: [c.id],
      replace: ['reports.stats'],
    }).expect(400);
    await bulk(manager.auth, {
      roleIds: [c.id],
      replace: ['reports.stats'],
      confirmReplace: true,
    }).expect(201);
    expect(await keysOf(c.id)).toEqual(['reports.stats']);
  });

  it('защищённая роль блокирует всю операцию (атомарно), иерархия, чужие права', async () => {
    const ok = await createRole('ok', 130);
    const su = await createRole('su', 140, [], { isSuperuser: true });
    const high = await createRole('high', 900);
    const blocked = await bulk(manager.auth, {
      roleIds: [ok.id, su.id, high.id],
      add: ['reports.stats'],
    }).expect(403);
    expect(blocked.body.blocked).toHaveLength(2);
    expect(await keysOf(ok.id)).toEqual([]);

    // Нельзя выдать право, которого нет у самого актёра.
    await bulk(manager.auth, {
      roleIds: [ok.id],
      add: ['users.delete'],
    }).expect(403);
    // Одно и то же право и в add, и в remove.
    await bulk(manager.auth, {
      roleIds: [ok.id],
      add: ['reports.stats'],
      remove: ['reports.stats'],
    }).expect(400);
  });
});
