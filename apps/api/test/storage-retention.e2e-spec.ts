import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StorageRetention } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';
import { StorageRetentionService } from '../src/modules/system/storage-retention.service';

jest.setTimeout(30_000);

const OLD = new Date('2000-01-01T00:00:00Z');
const FUTURE = new Date(Date.now() + 365 * 24 * 3_600_000);

/// ADR-0084: сроки хранения и очистка служебных журналов. Очищаются только
/// старые записи (2000 год), созданные тестом, и такие же «древние» записи БД;
/// журнал аудита целиком тест не очищает — параллельные наборы не страдают.
describe('Storage retention (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  let service: StorageRetentionService;
  let original: StorageRetention | null = null;
  const unique = randomUUID().slice(0, 8);
  const password = 'Sup3rSecretPassw0rd!';
  const userIds: string[] = [];
  const roleIds: string[] = [];
  const http = () => request(app.getHttpServer());
  const base = '/admin/system/storage';

  async function createUser(label: string) {
    const email = `st-${label}-${unique}@example.com`;
    const username = `st${label}${unique}`.slice(0, 16);
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

  async function grant(userId: string, keys: string[]) {
    const slug = `st-${unique}-${roleIds.length}`;
    const role = await prisma.role.create({
      data: { name: slug, slug, displayName: slug, priority: 10 },
    });
    roleIds.push(role.id);
    const records = await prisma.permission.findMany({
      where: { key: { in: keys } },
    });
    await prisma.rolePermission.createMany({
      data: records.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
    await prisma.userRole.create({ data: { userId, roleId: role.id } });
    await permissions.invalidateUser(userId);
  }

  const resetToken = (userId: string, used: boolean) =>
    prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: `st-${randomUUID()}`,
        expiresAt: used ? OLD : FUTURE,
        usedAt: used ? OLD : null,
        createdAt: OLD,
      },
    });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    permissions = app.get(PermissionService);
    service = app.get(StorageRetentionService);
    original = await prisma.storageRetention.findUnique({
      where: { id: 'global' },
    });
  });

  afterAll(async () => {
    if (original) {
      const { id: _id, updatedAt: _u, lastResult, ...rest } = original;
      await prisma.storageRetention.update({
        where: { id: 'global' },
        data: { ...rest, lastResult: lastResult ?? undefined },
      });
    } else {
      await prisma.storageRetention.deleteMany({ where: { id: 'global' } });
    }
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.passwordResetToken.deleteMany({
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

  it('обзор, сроки, права на чувствительные журналы, предпросмотр, очистка с подтверждением, аудит', async () => {
    const plain = await createUser('p');
    const manager = await createUser('m');
    const auditor = await createUser('a');
    await grant(manager.id, ['system.storage.view', 'system.storage.manage']);
    await grant(auditor.id, [
      'system.storage.view',
      'system.storage.manage',
      'system.storage.audit',
    ]);

    await http().get(base).set('Authorization', plain.auth).expect(403);
    const overview = await http()
      .get(base)
      .set('Authorization', manager.auth)
      .expect(200);
    expect(
      (
        overview.body.categories as Array<{ key: string; sensitive: boolean }>
      ).map((item) => `${item.key}:${item.sensitive}`),
    ).toEqual([
      'audit:true',
      'security:true',
      'serverStatus:false',
      'technical:false',
    ]);

    // Сроки: недопустимое значение, чувствительная категория без права.
    await http()
      .patch(base)
      .set('Authorization', manager.auth)
      .send({ retention: { technical: 45 } })
      .expect(400);
    await http()
      .patch(base)
      .set('Authorization', manager.auth)
      .send({ retention: { audit: 30 } })
      .expect(403);
    const updated = await http()
      .patch(base)
      .set('Authorization', manager.auth)
      .send({ retention: { technical: 30 } })
      .expect(200);
    expect(
      updated.body.categories.find(
        (item: { key: string }) => item.key === 'technical',
      ).retentionDays,
    ).toBe(30);

    // Технические записи: использованный старый код удаляется, действующий — нет.
    await resetToken(plain.id, true);
    await resetToken(plain.id, true);
    const active = await resetToken(plain.id, false);
    const preview = await http()
      .post(`${base}/preview`)
      .set('Authorization', manager.auth)
      .send({ category: 'technical', olderThanDays: 365 })
      .expect(200);
    expect(preview.body.count).toBeGreaterThanOrEqual(2);
    expect(preview.body.bytes).toEqual(expect.any(Number));

    // Записей стало больше, чем видел админ, — 409.
    await resetToken(plain.id, true);
    await http()
      .post(`${base}/cleanup`)
      .set('Authorization', manager.auth)
      .send({
        category: 'technical',
        olderThanDays: 365,
        confirmCount: preview.body.count,
      })
      .expect(409);
    const fresh = await http()
      .post(`${base}/preview`)
      .set('Authorization', manager.auth)
      .send({ category: 'technical', olderThanDays: 365 })
      .expect(200);
    const cleaned = await http()
      .post(`${base}/cleanup`)
      .set('Authorization', manager.auth)
      .send({
        category: 'technical',
        olderThanDays: 365,
        confirmCount: fresh.body.count,
      })
      .expect(200);
    expect(cleaned.body.deleted).toBe(fresh.body.count);
    expect(
      await prisma.passwordResetToken.findMany({
        where: { userId: plain.id },
        select: { id: true },
      }),
    ).toEqual([{ id: active.id }]);

    // Журнал безопасности: только с отдельным правом; активная сессия остаётся.
    await prisma.refreshToken.createMany({
      data: [
        {
          userId: plain.id,
          tokenHash: `st-${randomUUID()}`,
          expiresAt: OLD,
          revokedAt: OLD,
          createdAt: OLD,
        },
        {
          userId: plain.id,
          tokenHash: `st-active-${unique}`,
          expiresAt: FUTURE,
          createdAt: OLD,
        },
      ],
    });
    const security = await http()
      .post(`${base}/preview`)
      .set('Authorization', manager.auth)
      .send({ category: 'security', olderThanDays: 365 })
      .expect(200);
    await http()
      .post(`${base}/cleanup`)
      .set('Authorization', manager.auth)
      .send({
        category: 'security',
        olderThanDays: 365,
        confirmCount: security.body.count,
      })
      .expect(403);
    await http()
      .post(`${base}/cleanup`)
      .set('Authorization', auditor.auth)
      .send({
        category: 'security',
        olderThanDays: 365,
        confirmCount: security.body.count,
      })
      .expect(200);
    expect(
      await prisma.refreshToken.findUnique({
        where: { tokenHash: `st-active-${unique}` },
      }),
    ).not.toBeNull();

    // Недопустимые параметры.
    for (const bad of [
      { category: 'users', olderThanDays: 30, confirmCount: 0 },
      { category: 'technical', olderThanDays: 45, confirmCount: 0 },
    ]) {
      await http()
        .post(`${base}/cleanup`)
        .set('Authorization', manager.auth)
        .send(bad)
        .expect(400);
    }

    const audits = await prisma.auditLog.findMany({
      where: {
        actorId: { in: [manager.id, auditor.id] },
        action: { startsWith: 'system.storage.' },
      },
      select: { action: true, targetId: true, severity: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits).toEqual([
      {
        action: 'system.storage.update',
        targetId: 'global',
        severity: 'warning',
      },
      {
        action: 'system.storage.cleanup',
        targetId: 'technical',
        severity: 'warning',
      },
      {
        action: 'system.storage.cleanup',
        targetId: 'security',
        severity: 'critical',
      },
    ]);
  });

  it('автоочистка: только категории со сроком; результат записан', async () => {
    const owner = await createUser('o');
    await service.getSettings();
    await prisma.storageRetention.update({
      where: { id: 'global' },
      data: {
        autoCleanup: true,
        auditDays: 0,
        securityDays: 0,
        serverStatusDays: 0,
        technicalDays: 7,
      },
    });
    await resetToken(owner.id, true);
    const keep = await resetToken(owner.id, false);
    const result = await service.runAuto();
    expect(result.technical).toBeGreaterThanOrEqual(1);
    expect(result.audit).toBeUndefined();
    expect(
      await prisma.passwordResetToken.findMany({
        where: { userId: owner.id },
        select: { id: true },
      }),
    ).toEqual([{ id: keep.id }]);
    const settings = await prisma.storageRetention.findUniqueOrThrow({
      where: { id: 'global' },
    });
    expect(settings.lastRunTrigger).toBe('auto');

    await prisma.storageRetention.update({
      where: { id: 'global' },
      data: { autoCleanup: false },
    });
    expect(await service.runAuto()).toEqual({});
  });
});
