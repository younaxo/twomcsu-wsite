import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';

// См. auth.e2e-spec.ts — тот же риск конкуренции за ресурсы под полным сьютом.
jest.setTimeout(20_000);

describe('RBAC (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  const unique = randomUUID().slice(0, 8);
  const cleanupUserEmails: string[] = [];
  const cleanupRoleSlugs: string[] = [];

  async function createUser(
    label: string,
  ): Promise<{ id: string; accessToken: string }> {
    const email = `rbac-${label}-${unique}@example.com`;
    const username = `rbac${label.replace(/[^a-zA-Z0-9]/g, '')}${unique}`.slice(
      0,
      16,
    );
    const password = 'Sup3rSecretPassw0rd!';
    cleanupUserEmails.push(email);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ emailOrUsername: email, password })
      .expect(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { id: user.id, accessToken: loginRes.body.accessToken };
  }

  async function createRole(
    slug: string,
    priority: number,
    opts: { isSystem?: boolean; isAssignable?: boolean } = {},
  ) {
    cleanupRoleSlugs.push(slug);
    return prisma.role.create({
      data: {
        name: slug,
        slug,
        displayName: slug,
        priority,
        isSystem: opts.isSystem ?? false,
        isAssignable: opts.isAssignable ?? true,
      },
    });
  }

  async function grantRole(userId: string, roleId: string) {
    await prisma.userRole.create({ data: { userId, roleId } });
    await permissions.invalidateUser(userId);
  }

  async function grantPermissions(roleId: string, keys: string[]) {
    const records = await prisma.permission.findMany({
      where: { key: { in: keys } },
    });
    await prisma.rolePermission.createMany({
      data: records.map((p) => ({ roleId, permissionId: p.id })),
    });
    await permissions.invalidateRole(roleId);
  }

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
    await prisma.userRole.deleteMany({
      where: { role: { slug: { in: cleanupRoleSlugs } } },
    });
    await prisma.rolePermission.deleteMany({
      where: { role: { slug: { in: cleanupRoleSlugs } } },
    });
    await prisma.roleAssignmentLog.deleteMany({
      where: { role: { slug: { in: cleanupRoleSlugs } } },
    });
    await prisma.role.deleteMany({ where: { slug: { in: cleanupRoleSlugs } } });
    await prisma.user.deleteMany({
      where: { email: { in: cleanupUserEmails } },
    });
    await app.close();
  });

  it('без permission → 403, с permission → успех', async () => {
    const actor = await createUser('plain');
    const role = await createRole(`viewer-${unique}`, 50);
    await grantPermissions(role.id, ['roles.view']);
    await grantRole(actor.id, role.id);

    // roles.view есть → список ролей доступен.
    await request(app.getHttpServer())
      .get('/admin/roles')
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .expect(200);

    // roles.create отсутствует → 403.
    await request(app.getHttpServer())
      .post('/admin/roles')
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .send({
        name: 'x',
        slug: `should-fail-${unique}`,
        displayName: 'x',
        priority: 1,
      })
      .expect(403);
  });

  it('без токена → 401', async () => {
    await request(app.getHttpServer()).get('/admin/roles').expect(401);
  });

  it('superuser (Owner) обходит любую проверку permission', async () => {
    const actor = await createUser('owner');
    const owner = await prisma.role.findUniqueOrThrow({
      where: { slug: 'owner' },
    });
    await grantRole(actor.id, owner.id);

    await request(app.getHttpServer())
      .get('/admin/permissions')
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .expect(200);

    const created = await request(app.getHttpServer())
      .post('/admin/roles')
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .send({
        name: 'superuser-created',
        slug: `superuser-created-${unique}`,
        displayName: 'Superuser Created',
        priority: 1,
      })
      .expect(201);
    cleanupRoleSlugs.push(created.body.slug);
  });

  it('отзыв роли мгновенно убирает доступ (инвалидация Redis-кеша)', async () => {
    const actor = await createUser('revoke');
    const role = await createRole(`revoke-role-${unique}`, 50);
    await grantPermissions(role.id, ['roles.view']);
    await grantRole(actor.id, role.id);

    await request(app.getHttpServer())
      .get('/admin/roles')
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .expect(200);

    await prisma.userRole.deleteMany({
      where: { userId: actor.id, roleId: role.id },
    });
    await permissions.invalidateUser(actor.id);

    await request(app.getHttpServer())
      .get('/admin/roles')
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .expect(403);
  });

  it('нельзя редактировать/удалять роль с priority выше или равным своему', async () => {
    const actor = await createUser('hierarchy');
    const actorRole = await createRole(`manager-${unique}`, 100);
    await grantPermissions(actorRole.id, [
      'roles.edit',
      'roles.delete',
      'roles.create',
    ]);
    await grantRole(actor.id, actorRole.id);

    const higherRole = await createRole(`higher-${unique}`, 500);
    const lowerRole = await createRole(`lower-${unique}`, 10);

    await request(app.getHttpServer())
      .patch(`/admin/roles/${higherRole.id}`)
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .send({ displayName: 'hacked' })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/admin/roles/${lowerRole.id}`)
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .send({ displayName: 'renamed-ok' })
      .expect(200);
  });

  it('нельзя удалить системную (isSystem) роль', async () => {
    const actor = await createUser('system-protect');
    const actorRole = await createRole(`destroyer-${unique}`, 999);
    await grantPermissions(actorRole.id, ['roles.delete']);
    await grantRole(actor.id, actorRole.id);

    const systemRole = await createRole(`protected-system-${unique}`, 1, {
      isSystem: true,
    });

    await request(app.getHttpServer())
      .delete(`/admin/roles/${systemRole.id}`)
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .expect(403);
  });

  it('нельзя выдать роли permission, которого нет у самого актёра', async () => {
    const actor = await createUser('grant-limit');
    const actorRole = await createRole(`limited-manager-${unique}`, 100);
    // У актёра есть permissions.manage и roles.view, но НЕТ roles.delete.
    await grantPermissions(actorRole.id, ['permissions.manage', 'roles.view']);
    await grantRole(actor.id, actorRole.id);

    const targetRole = await createRole(`target-${unique}`, 10);

    await request(app.getHttpServer())
      .put(`/admin/roles/${targetRole.id}/permissions`)
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .send({ permissionKeys: ['roles.delete'] })
      .expect(403);

    await request(app.getHttpServer())
      .put(`/admin/roles/${targetRole.id}/permissions`)
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .send({ permissionKeys: ['roles.view'] })
      .expect(200);
  });

  it('GET /auth/me отдаёт effective permissions и роли для frontend-меню', async () => {
    const actor = await createUser('me-perms');
    const role = await createRole(`me-perms-${unique}`, 10);
    await grantPermissions(role.id, ['roles.view', 'users.view']);

    const before = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .expect(200);
    expect(before.body.permissions).toEqual({
      superuser: false,
      permissions: [],
      maxPriority: null,
    });
    expect(before.body.roles).toEqual([]);

    await grantRole(actor.id, role.id);

    const after = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .expect(200);
    expect(after.body.permissions.superuser).toBe(false);
    expect(after.body.permissions.maxPriority).toBe(10);
    expect([...after.body.permissions.permissions].sort()).toEqual([
      'roles.view',
      'users.view',
    ]);
    expect(after.body.roles).toHaveLength(1);
    expect(after.body.roles[0]).toMatchObject({
      id: role.id,
      slug: role.slug,
      priority: 10,
      isSuperuser: false,
    });
  });
});
