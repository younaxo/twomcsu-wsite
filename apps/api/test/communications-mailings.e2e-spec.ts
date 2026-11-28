import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { MailingsService } from '../src/modules/communications/mailings.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';
import { markStaffTwoFactorEnabled } from './helpers/staff-two-factor';

jest.setTimeout(30_000);

/// J-08-4: очередь заданий рассылки — постановка, прогресс, отмена, повтор.
/// Планировщик в тестах выключен: воркер вызывается напрямую (`processDue`).
/// Лимит маршрута постановки 3/мин — тест укладывается.
describe('Communications: фоновые рассылки (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  let mailings: MailingsService;
  const unique = randomUUID().slice(0, 8);
  const password = 'Sup3rSecretPassw0rd!';
  const userIds: string[] = [];
  const roleIds: string[] = [];
  const http = () => request(app.getHttpServer());
  const content = { title: 'Рассылка', message: 'Текст рассылки' };

  async function createUser(label: string) {
    const n = userIds.length;
    const email = `mj-${label}-${n}-${unique}@example.com`;
    const username = `mj${label}${n}${unique}`.slice(0, 16);
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
    const slug = `mj-${unique}-${roleIds.length}`;
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
    await markStaffTwoFactorEnabled(prisma, userId);
    await permissions.invalidateUser(userId);
  }

  async function setupBulker() {
    const bulker = await createUser('mb');
    const recipients = [
      await createUser('ra'),
      await createUser('rb'),
      await createUser('rc'),
    ];
    await grant(bulker.id, ['communications.messages.bulk']);
    return {
      bulker,
      recipients,
      audience: { kind: 'users', userIds: recipients.map((r) => r.id) },
    };
  }

  const countMailing = (jobId: string) =>
    prisma.notification.count({
      where: {
        userId: { in: userIds },
        metadata: { path: ['mailingId'], equals: jobId },
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
    mailings = app.get(MailingsService);
  });

  afterAll(async () => {
    await prisma.mailingJob.deleteMany({
      where: { createdById: { in: userIds } },
    });
    await prisma.notification.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.notificationSettings.deleteMany({
      where: { userId: { in: userIds } },
    });
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

  it('создание: 202, прогресс, повтор и «рестарт» воркера не дублируют, аудит', async () => {
    const { bulker, recipients, audience } = await setupBulker();
    await http()
      .post('/admin/communications/mailings')
      .set('Authorization', recipients[0].auth)
      .send({ ...content, audience, confirmCount: 3 })
      .expect(403);
    await http()
      .post('/admin/communications/mailings')
      .set('Authorization', bulker.auth)
      .send({ ...content, audience, confirmCount: 2 })
      .expect(409);

    const created = await http()
      .post('/admin/communications/mailings')
      .set('Authorization', bulker.auth)
      .send({ ...content, audience, confirmCount: 3 })
      .expect(202);
    const id = created.body.id as string;
    expect(created.body).toMatchObject({
      status: 'QUEUED',
      total: 3,
      processed: 0,
    });
    // Запрос ничего не доставил: это делает воркер.
    expect(await countMailing(id)).toBe(0);

    await mailings.processDue(100);
    const done = await http()
      .get(`/admin/communications/mailings/${id}`)
      .set('Authorization', bulker.auth)
      .expect(200);
    expect(done.body).toMatchObject({
      status: 'DONE',
      processed: 3,
      delivered: 3,
      skipped: 0,
      failed: 0,
    });
    expect(await countMailing(id)).toBe(3);

    // Повторный запуск и «рестарт» (задание снова RUNNING с нулевым курсором).
    await mailings.processDue(100);
    await prisma.mailingJob.update({
      where: { id },
      data: {
        status: 'RUNNING',
        cursor: null,
        processed: 0,
        delivered: 0,
        finishedAt: null,
      },
    });
    await mailings.processDue(100);
    expect(await countMailing(id)).toBe(3);
    const replay = await prisma.mailingJob.findUniqueOrThrow({ where: { id } });
    expect(replay).toMatchObject({
      status: 'DONE',
      skipped: 3,
      delivered: 0,
    });

    const list = await http()
      .get('/admin/communications/mailings')
      .set('Authorization', bulker.auth)
      .expect(200);
    expect(list.body.map((j: { id: string }) => j.id)).toContain(id);
    const audits = await prisma.auditLog.findMany({
      where: {
        actorId: bulker.id,
        action: { startsWith: 'communications.mailing.' },
      },
    });
    expect(audits.map((a) => a.action).sort()).toEqual([
      'communications.mailing.create',
      'communications.mailing.finish',
      'communications.mailing.finish',
    ]);
  });

  it('отмена: задание не отправляется, повтор 409, аудит с автором', async () => {
    const { bulker, audience } = await setupBulker();
    const created = await http()
      .post('/admin/communications/mailings')
      .set('Authorization', bulker.auth)
      .send({ ...content, audience, confirmCount: 3 })
      .expect(202);
    const id = created.body.id as string;
    const cancelled = await http()
      .post(`/admin/communications/mailings/${id}/cancel`)
      .set('Authorization', bulker.auth)
      .expect(200);
    expect(cancelled.body).toMatchObject({
      status: 'CANCELLED',
      cancelledById: bulker.id,
    });
    await mailings.processDue(100);
    expect(await countMailing(id)).toBe(0);
    await http()
      .post(`/admin/communications/mailings/${id}/cancel`)
      .set('Authorization', bulker.auth)
      .expect(409);
    await http()
      .post('/admin/communications/mailings/nonexistent/cancel')
      .set('Authorization', bulker.auth)
      .expect(404);
    const audit = await prisma.auditLog.findFirst({
      where: {
        actorId: bulker.id,
        action: 'communications.mailing.cancel',
        targetId: id,
      },
    });
    expect(audit).not.toBeNull();
  });

  it('лимит скорости: бюджет тика ограничивает доставку, остальное позже', async () => {
    const { bulker, audience } = await setupBulker();
    const created = await http()
      .post('/admin/communications/mailings')
      .set('Authorization', bulker.auth)
      .send({ ...content, audience, confirmCount: 3 })
      .expect(202);
    const id = created.body.id as string;
    await mailings.processDue(2);
    expect(await countMailing(id)).toBe(2);
    expect((await mailings.get(id)).status).toBe('RUNNING');
    await mailings.processDue(100);
    expect(await countMailing(id)).toBe(3);
    expect((await mailings.get(id)).status).toBe('DONE');
  });
});
