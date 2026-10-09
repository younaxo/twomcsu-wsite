import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';

jest.setTimeout(20_000);

/// ADR-0061 (alias входа), ADR-0062 (уровень доступа), защита от снятия с
/// себя superuser-роли.
describe('Identity: login alias, access level (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  const unique = randomUUID().slice(0, 8);
  const password = 'Sup3rSecretPassw0rd!';
  const roleIds: string[] = [];
  const userIds: string[] = [];

  interface TestUser {
    id: string;
    accessToken: string;
    username: string;
    email: string;
  }

  async function createUser(label: string): Promise<TestUser> {
    const email = `id-${label}-${unique}@example.com`;
    const username = `id${label}${unique}`
      .replace(/[^a-zA-Z0-9_]/g, '')
      .slice(0, 16);
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
    return {
      id: user.id,
      accessToken: login.body.accessToken,
      username,
      email,
    };
  }

  async function createRole(
    label: string,
    priority: number,
    keys: string[],
    isSuperuser = false,
  ) {
    const slug = `id-${label}-${unique}`;
    const role = await prisma.role.create({
      data: {
        name: slug,
        slug,
        displayName: slug,
        priority,
        isSuperuser,
        isSystem: false,
        isAssignable: true,
      },
    });
    roleIds.push(role.id);
    const records = await prisma.permission.findMany({
      where: { key: { in: keys } },
    });
    if (records.length > 0) {
      await prisma.rolePermission.createMany({
        data: records.map((p) => ({ roleId: role.id, permissionId: p.id })),
      });
    }
    return role;
  }

  async function grantRole(userId: string, roleId: string) {
    await prisma.userRole.create({ data: { userId, roleId } });
    await permissions.invalidateUser(userId);
  }

  const auth = (user: TestUser) => `Bearer ${user.accessToken}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    permissions = app.get(PermissionService);
  });

  afterAll(async () => {
    await prisma.loginAlias.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.roleAssignmentLog.deleteMany({
      where: { userId: { in: userIds } },
    });
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

  describe('alias входа', () => {
    it('обычный пользователь: логин = ник, alias не нужен', async () => {
      const player = await createUser('pl');
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ emailOrUsername: player.username, password })
        .expect(200);
      expect(res.body.user.username).toBe(player.username);
      expect(
        await prisma.loginAlias.count({ where: { userId: player.id } }),
      ).toBe(0);
    });

    it('alias ведёт в аккаунт с другим ником; ник не меняется', async () => {
      const owner = await createUser('al');
      const alias = `al${unique}`.toLowerCase();
      await prisma.loginAlias.create({ data: { alias, userId: owner.id } });

      const viaAlias = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ emailOrUsername: alias.toUpperCase(), password })
        .expect(200);
      expect(viaAlias.body.user.id).toBe(owner.id);
      expect(viaAlias.body.user.username).toBe(owner.username);

      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${viaAlias.body.accessToken}`)
        .expect(200);
      expect(me.body.username).toBe(owner.username);

      // Ник по-прежнему тоже подходит для входа.
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ emailOrUsername: owner.username, password })
        .expect(200);

      // Зарегистрировать ник, совпадающий с alias, нельзя.
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: `al2-${unique}@example.com`, username: alias, password })
        .expect(409);
    });
  });

  describe('уровень доступа', () => {
    it('/auth/me отдаёт accessLevel отдельно от priority ролей', async () => {
      const staff = await createUser('lv');
      const role = await createRole('lv', 250, ['users.view']);
      await grantRole(staff.id, role.id);
      await prisma.user.update({
        where: { id: staff.id },
        data: { accessLevel: 4 },
      });
      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', auth(staff))
        .expect(200);
      expect(me.body.accessLevel).toBe(4);
      expect(me.body.permissions.maxPriority).toBe(250);
    });

    it('изменение: permission, иерархия, не выше своего, свой — отдельное право, audit', async () => {
      const manager = await createUser('mg');
      const target = await createUser('tg');
      const plain = await createUser('np');
      const managerRole = await createRole('mg', 300, [
        'users.view',
        'users.access_level.edit',
      ]);
      await grantRole(manager.id, managerRole.id);
      await prisma.user.update({
        where: { id: manager.id },
        data: { accessLevel: 5 },
      });

      // Без permission — 403.
      await request(app.getHttpServer())
        .patch(`/admin/users/${target.id}/access-level`)
        .set('Authorization', auth(plain))
        .send({ accessLevel: 1 })
        .expect(403);

      // Валидация.
      await request(app.getHttpServer())
        .patch(`/admin/users/${target.id}/access-level`)
        .set('Authorization', auth(manager))
        .send({ accessLevel: -1 })
        .expect(400);

      // Выше собственного — 403.
      await request(app.getHttpServer())
        .patch(`/admin/users/${target.id}/access-level`)
        .set('Authorization', auth(manager))
        .send({ accessLevel: 6 })
        .expect(403);

      const ok = await request(app.getHttpServer())
        .patch(`/admin/users/${target.id}/access-level`)
        .set('Authorization', auth(manager))
        .send({ accessLevel: 4 })
        .expect(200);
      expect(ok.body.accessLevel).toBe(4);

      const audit = await prisma.auditLog.findFirst({
        where: { actorId: manager.id, action: 'users.access_level.edit' },
      });
      expect(audit?.targetId).toBe(target.id);
      expect(audit?.changes).toMatchObject({
        accessLevel: { from: 0, to: 4 },
      });

      // Свой уровень — без users.access_level.edit_self нельзя.
      await request(app.getHttpServer())
        .patch(`/admin/users/${manager.id}/access-level`)
        .set('Authorization', auth(manager))
        .send({ accessLevel: 9 })
        .expect(403);
    });
  });

  it('нельзя снять с себя superuser-роль (самоблокировка)', async () => {
    const root = await createUser('su');
    const role = await createRole('su', 950, [], true);
    await grantRole(root.id, role.id);
    await request(app.getHttpServer())
      .delete(`/admin/users/${root.id}/roles/${role.id}`)
      .set('Authorization', auth(root))
      .expect(403);
    expect(
      await prisma.userRole.count({
        where: { userId: root.id, roleId: role.id },
      }),
    ).toBe(1);
  });
});
