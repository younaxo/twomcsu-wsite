import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';
import { markStaffTwoFactorEnabled } from './helpers/staff-two-factor';

jest.setTimeout(30_000);

/// J-08-4: отказы 403 и валидация DTO маршрутов рассылок. Отдельный файл
/// (свой экземпляр приложения и лимитер): на POST mailings лимит 3/мин, а
/// глобальный ThrottlerGuard идёт до проверки прав и валидации, поэтому
/// 403/400 тоже расходуют лимит. Здесь ровно 3 POST mailings (1x403, 2x400);
/// cancel имеет отдельный лимит 20/мин. Регистраций 2 (лимит логина 10/мин).
describe('Communications: рассылки, 403 и валидация (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  const unique = randomUUID().slice(0, 8);
  const password = 'Sup3rSecretPassw0rd!';
  const userIds: string[] = [];
  const roleIds: string[] = [];
  const http = () => request(app.getHttpServer());
  const content = { title: 'Рассылка', message: 'Текст рассылки' };
  const audience = { kind: 'all' };
  let plain: string;
  let bulker: string;

  async function createUser(label: string) {
    const email = `mv-${label}-${unique}@example.com`;
    const username = `mv${label}${unique}`.slice(0, 16);
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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    permissions = app.get(PermissionService);

    const plainUser = await createUser('pl');
    const bulkUser = await createUser('bk');
    plain = plainUser.auth;
    bulker = bulkUser.auth;
    const slug = `mv-${unique}`;
    const role = await prisma.role.create({
      data: { name: slug, slug, displayName: slug, priority: 10 },
    });
    roleIds.push(role.id);
    const records = await prisma.permission.findMany({
      where: { key: 'communications.messages.bulk' },
    });
    await prisma.rolePermission.createMany({
      data: records.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
    await prisma.userRole.create({
      data: { userId: bulkUser.id, roleId: role.id },
    });
    await markStaffTwoFactorEnabled(prisma, bulkUser.id);
    await permissions.invalidateUser(bulkUser.id);
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

  it('403 без communications.messages.bulk: создание, чтение, отмена', async () => {
    await http()
      .post('/admin/communications/mailings')
      .set('Authorization', plain)
      .send({ ...content, audience, confirmCount: 1 })
      .expect(403);
    await http()
      .get('/admin/communications/mailings/some-id')
      .set('Authorization', plain)
      .expect(403);
    await http()
      .post('/admin/communications/mailings/some-id/cancel')
      .set('Authorization', plain)
      .expect(403);
  });

  it('400: пустой title и audience.kind вне списка на создании', async () => {
    await http()
      .post('/admin/communications/mailings')
      .set('Authorization', bulker)
      .send({ ...content, title: '', audience, confirmCount: 1 })
      .expect(400);
    await http()
      .post('/admin/communications/mailings')
      .set('Authorization', bulker)
      .send({ ...content, audience: { kind: 'everyone' }, confirmCount: 1 })
      .expect(400);
  });

  it('400: limit=0 и limit=101 в списке', async () => {
    for (const limit of [0, 101]) {
      await http()
        .get(`/admin/communications/mailings?limit=${limit}`)
        .set('Authorization', bulker)
        .expect(400);
    }
  });
});
