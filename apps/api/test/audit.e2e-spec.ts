import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { AuditService } from '../src/modules/audit/audit.service';
import {
  sanitizeChanges,
  severityFor,
} from '../src/modules/audit/audit.interceptor';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { RedisService } from '../src/modules/redis/redis.service';
import { PermissionService } from '../src/modules/roles/permission.service';

jest.setTimeout(20_000);

/// PHASE 22: автоматический audit всех staff-мутаций (interceptor) +
/// ретенция по ENV. Проверяется против реального Postgres+Redis.
describe('Audit log (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  let redis: RedisService;
  let audit: AuditService;
  const unique = randomUUID().slice(0, 8);
  const cleanupRoleSlugs: string[] = [];

  interface TestUser {
    id: string;
    accessToken: string;
  }

  async function createUser(label: string): Promise<TestUser> {
    const email = `au-${label}-${unique}@example.com`;
    const username = `au${label}${unique}`
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 16);
    const password = 'Sup3rSecretPassw0rd!';
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

  let admin: TestUser;
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
    redis = app.get(RedisService);
    audit = app.get(AuditService);

    admin = await createUser('admin');
    const slug = `audit-admin-${unique}`;
    cleanupRoleSlugs.push(slug);
    const adminRole = await prisma.role.create({
      data: {
        name: slug,
        slug,
        displayName: slug,
        priority: 50,
        isSystem: false,
        isAssignable: true,
      },
    });
    await prisma.userRole.create({
      data: { userId: admin.id, roleId: adminRole.id },
    });
    const records = await prisma.permission.findMany({
      where: {
        key: {
          in: ['roles.create', 'roles.delete', 'roles.edit', 'audit_log.view'],
        },
      },
    });
    await prisma.rolePermission.createMany({
      data: records.map((p) => ({ roleId: adminRole.id, permissionId: p.id })),
    });
    await permissions.invalidateRole(adminRole.id);
    await permissions.invalidateUser(admin.id);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: admin.id } });
    await prisma.userRole.deleteMany({ where: { userId: admin.id } });
    await prisma.role.deleteMany({ where: { slug: { in: cleanupRoleSlugs } } });
    await prisma.user.deleteMany({ where: { id: admin.id } });
    await redis.client.del(`permissions:user:${admin.id}`);
    await app.close();
  });

  /// Interceptor пишет после ответа — даём ему завершиться.
  async function waitForAudit(where: object, tries = 20) {
    for (let i = 0; i < tries; i += 1) {
      const entry = await prisma.auditLog.findFirst({
        where,
        orderBy: { createdAt: 'desc' },
      });
      if (entry) {
        return entry;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return null;
  }

  it('создание роли через API попадает в audit как roles.create с id цели', async () => {
    const slug = `audit-target-${unique}`;
    cleanupRoleSlugs.push(slug);
    const res = await request(app.getHttpServer())
      .post('/admin/roles')
      .set('Authorization', auth(admin))
      .send({ name: slug, slug, displayName: 'Цель', priority: 5 })
      .expect(201);

    const entry = await waitForAudit({
      actorId: admin.id,
      action: 'roles.create',
    });
    expect(entry).not.toBeNull();
    expect(entry?.targetId).toBe(res.body.id);
    expect(entry?.targetType).toBe('roles');
    expect(entry?.severity).toBe('warning');
    expect(entry?.changes).toMatchObject({ slug, priority: 5 });
    expect(entry?.ipAddress).toBeTruthy();
    expect(typeof entry?.duration).toBe('number');
  });

  it('удаление роли — critical, видно в GET /admin/audit-log', async () => {
    const slug = `audit-del-${unique}`;
    cleanupRoleSlugs.push(slug);
    const created = await request(app.getHttpServer())
      .post('/admin/roles')
      .set('Authorization', auth(admin))
      .send({ name: slug, slug, displayName: 'Удалить', priority: 5 })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/admin/roles/${created.body.id}`)
      .set('Authorization', auth(admin))
      .expect(200);

    const entry = await waitForAudit({
      actorId: admin.id,
      action: 'roles.delete',
      targetId: created.body.id,
    });
    expect(entry?.severity).toBe('critical');

    const list = await request(app.getHttpServer())
      .get('/admin/audit-log')
      .query({ actorId: admin.id, action: 'roles.delete' })
      .set('Authorization', auth(admin))
      .expect(200);
    expect(
      list.body.items.some((i: { id: string }) => i.id === entry?.id),
    ).toBe(true);
  });

  it('неудачная мутация (403) не логируется', async () => {
    await request(app.getHttpServer())
      .put('/admin/roles/nonexistent/permissions')
      .set('Authorization', auth(admin))
      .send({ permissionKeys: [] })
      .expect(403);
    const entry = await waitForAudit(
      { actorId: admin.id, action: 'permissions.manage' },
      3,
    );
    expect(entry).toBeNull();
  });

  it('секреты в теле скрываются, уровни по ключу', () => {
    expect(sanitizeChanges({ password: 'x', title: 'ok' })).toEqual({
      password: '[скрыто]',
      title: 'ok',
    });
    expect(severityFor('store.products.create')).toBe('info');
    expect(severityFor('store.products.delete')).toBe('warning');
    expect(severityFor('permissions.manage')).toBe('critical');
  });

  it('ретенция удаляет записи старше срока', async () => {
    const old = await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: 'test.old',
        severity: 'info',
        createdAt: new Date(Date.now() - 400 * 24 * 3_600_000),
      },
    });
    const fresh = await prisma.auditLog.create({
      data: { actorId: admin.id, action: 'test.fresh', severity: 'info' },
    });
    const { deleted } = await audit.cleanupOld(365);
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.auditLog.findUnique({ where: { id: old.id } }),
    ).toBeNull();
    expect(
      await prisma.auditLog.findUnique({ where: { id: fresh.id } }),
    ).not.toBeNull();
  });
});
