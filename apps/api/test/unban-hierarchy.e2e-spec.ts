import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';
import { markStaffTwoFactorEnabled } from './helpers/staff-two-factor';

// См. auth.e2e-spec.ts — риск конкуренции за ресурсы под полным сьютом.
jest.setTimeout(20_000);

/// Q48/Q49, ADR-0173: единое правило снятия санкции для бана аккаунта
/// (массовое снятие) и бана в обращениях. Статический e2e: на одноразовой БД
/// запускает владелец/ревьюер; агентом не запускался.
describe('Unban hierarchy (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  const unique = randomUUID().slice(0, 8);
  const cleanupRoleSlugs: string[] = [];

  interface TestUser {
    id: string;
    accessToken: string;
    email: string;
  }

  async function createUser(label: string): Promise<TestUser> {
    const email = `uh-${label}-${unique}@example.com`;
    const username = `uh${label}${unique}`
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
    return { id: user.id, accessToken: loginRes.body.accessToken, email };
  }

  async function createRole(
    slug: string,
    priority: number,
    permissionKeys: string[],
    isSuperuser = false,
  ) {
    cleanupRoleSlugs.push(slug);
    const role = await prisma.role.create({
      data: {
        name: slug,
        slug,
        displayName: slug,
        priority,
        isSystem: false,
        isAssignable: true,
        isSuperuser,
      },
    });
    const records = await prisma.permission.findMany({
      where: { key: { in: permissionKeys } },
    });
    await prisma.rolePermission.createMany({
      data: records.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
    return role;
  }

  async function grantRole(userId: string, roleId: string) {
    await prisma.userRole.create({ data: { userId, roleId } });
    await markStaffTwoFactorEnabled(prisma, userId);
    await permissions.invalidateUser(userId);
  }

  const auth = (user: TestUser) => `Bearer ${user.accessToken}`;
  const bulk = (actor: TestUser, userIds: string[]) =>
    request(app.getHttpServer())
      .patch('/admin/users/bulk')
      .set('Authorization', auth(actor))
      .send({ userIds, action: 'UNBAN' });
  const reportUnban = (actor: TestUser, userId: string) =>
    request(app.getHttpServer())
      .delete(`/admin/reports/ban/${userId}`)
      .set('Authorization', auth(actor));

  let owner: TestUser;
  let senior: TestUser;
  let junior: TestUser;
  let victim: TestUser;
  let legacy: TestUser;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    permissions = app.get(PermissionService);

    owner = await createUser('owner');
    senior = await createUser('senior');
    junior = await createUser('junior');
    victim = await createUser('victim');
    legacy = await createUser('legacy');

    const keys = ['users.bulk.edit', 'users.ban', 'reports.ban'];
    await grantRole(
      owner.id,
      (await createRole(`uh-owner-${unique}`, 1000, [], true)).id,
    );
    await grantRole(
      senior.id,
      (await createRole(`uh-senior-${unique}`, 50, keys)).id,
    );
    await grantRole(
      junior.id,
      (await createRole(`uh-junior-${unique}`, 10, keys)).id,
    );
  }, 40_000);

  afterAll(async () => {
    const users = [owner, senior, junior, victim, legacy].filter(Boolean);
    const ids = users.map((u) => u.id);
    await prisma.reportBan.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRole.deleteMany({
      where: { role: { slug: { in: cleanupRoleSlugs } } },
    });
    await prisma.rolePermission.deleteMany({
      where: { role: { slug: { in: cleanupRoleSlugs } } },
    });
    await prisma.role.deleteMany({ where: { slug: { in: cleanupRoleSlugs } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  }, 20_000);

  it('младший не снимает бан аккаунта, выданный старшим (403-код в failed)', async () => {
    await prisma.user.update({
      where: { id: victim.id },
      data: { isBanned: true, banReason: 'x', bannedById: senior.id },
    });
    const res = await bulk(junior, [victim.id]).expect(200);
    expect(res.body.succeeded).toEqual([]);
    expect(res.body.failed[0]).toMatchObject({
      userId: victim.id,
      code: 'sanction_revoke_forbidden',
    });
    const still = await prisma.user.findUniqueOrThrow({
      where: { id: victim.id },
    });
    expect(still.isBanned).toBe(true);

    // Старший (выдавший) снимает; bannedById очищается; аудит с metadata.
    const ok = await bulk(senior, [victim.id]).expect(200);
    expect(ok.body.succeeded).toEqual([victim.id]);
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: victim.id },
    });
    expect(after.isBanned).toBe(false);
    expect(after.bannedById).toBeNull();
    const log = await prisma.auditLog.findFirst({
      where: { actorId: senior.id, action: 'user.unban', targetId: victim.id },
    });
    expect(log?.changes).toMatchObject({
      issuerId: senior.id,
      ownerOverride: false,
      self: false,
    });
  });

  it('старый бан без выдавшего: старший не снимает, владелец снимает (аудит «нет записи»)', async () => {
    await prisma.user.update({
      where: { id: legacy.id },
      data: { isBanned: true, banReason: 'old', bannedById: null },
    });
    const denied = await bulk(senior, [legacy.id]).expect(200);
    expect(denied.body.failed[0]).toMatchObject({
      code: 'sanction_revoke_forbidden',
    });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: legacy.id } }))
        .isBanned,
    ).toBe(true);

    const ok = await bulk(owner, [legacy.id]).expect(200);
    expect(ok.body.succeeded).toEqual([legacy.id]);
    const log = await prisma.auditLog.findFirst({
      where: { actorId: owner.id, action: 'user.unban', targetId: legacy.id },
    });
    expect(log?.changes).toMatchObject({
      issuerId: 'нет записи',
      ownerOverride: true,
    });
  });

  it('самоснятие не-владельцем бана в обращениях, выданного другим -> 403', async () => {
    await prisma.reportBan.create({
      data: { userId: junior.id, reason: 'x', bannedBy: senior.id },
    });
    const res = await reportUnban(junior, junior.id).expect(403);
    expect(res.body.code ?? res.body.message?.code).toBe(
      'sanction_revoke_forbidden',
    );
    expect(
      await prisma.reportBan.count({
        where: { userId: junior.id, isActive: true },
      }),
    ).toBe(1);
  });

  it('младший не снимает бан в обращениях старшего, старший снимает; аудит на бан', async () => {
    await reportUnban(junior, junior.id).expect(403);
    await prisma.reportBan.deleteMany({ where: { userId: victim.id } });
    const ban = await prisma.reportBan.create({
      data: { userId: victim.id, reason: 'x', bannedBy: senior.id },
    });
    await reportUnban(junior, victim.id).expect(403);
    await reportUnban(senior, victim.id).expect(200);
    const log = await prisma.auditLog.findFirst({
      where: {
        actorId: senior.id,
        action: 'reports.ban.revoke',
        targetId: ban.id,
      },
    });
    expect(log).not.toBeNull();
  });

  it('владелец снимает с себя бан в обращениях -> 200, аудит self=true', async () => {
    const ban = await prisma.reportBan.create({
      data: { userId: owner.id, reason: 'x', bannedBy: senior.id },
    });
    await reportUnban(owner, owner.id).expect(200);
    expect(
      await prisma.reportBan.count({
        where: { userId: owner.id, isActive: true },
      }),
    ).toBe(0);
    const log = await prisma.auditLog.findFirst({
      where: {
        actorId: owner.id,
        action: 'reports.ban.revoke',
        targetId: ban.id,
      },
    });
    expect(log?.changes).toMatchObject({
      issuerId: senior.id,
      ownerOverride: true,
      self: true,
    });
  });
});
