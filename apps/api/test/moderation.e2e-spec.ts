import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';

// См. auth.e2e-spec.ts — риск конкуренции за ресурсы под полным сьютом.
jest.setTimeout(20_000);

describe('Moderation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  const unique = randomUUID().slice(0, 8);
  const cleanupRoleSlugs: string[] = [];

  interface TestUser {
    id: string;
    accessToken: string;
    username: string;
    email: string;
    password: string;
  }

  async function createUser(label: string): Promise<TestUser> {
    const email = `mod-${label}-${unique}@example.com`;
    const username = `mod${label}${unique}`
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
    return {
      id: user.id,
      accessToken: loginRes.body.accessToken,
      username,
      email,
      password,
    };
  }

  async function createRole(slug: string, priority: number) {
    cleanupRoleSlugs.push(slug);
    return prisma.role.create({
      data: {
        name: slug,
        slug,
        displayName: slug,
        priority,
        isSystem: false,
        isAssignable: true,
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

  let admin: TestUser;
  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  let dave: TestUser;
  let erin: TestUser;

  const createdReportNumbers: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    permissions = app.get(PermissionService);

    admin = await createUser('admin');
    alice = await createUser('alice');
    bob = await createUser('bob');
    carol = await createUser('carol');
    dave = await createUser('dave');
    erin = await createUser('erin');

    const adminRole = await createRole(`moderation-admin-${unique}`, 20);
    await grantRole(admin.id, adminRole.id);
    await grantPermissions(adminRole.id, [
      'users.mute',
      'users.warn',
      'users.kick',
      'users.ban',
      'users.delete',
      'messages.hard_delete',
      'comments.hard_delete',
      'comment_reports.view',
      'comment_reports.edit',
      'profile_reports.view',
      'profile_reports.edit',
    ]);
  }, 30_000);

  afterAll(async () => {
    await prisma.report.deleteMany({
      where: { reportNumber: { in: createdReportNumbers } },
    });
    await prisma.commentReport.deleteMany({
      where: {
        comment: {
          profile: { id: { in: [alice.id, bob.id].filter(Boolean) } },
        },
      },
    });
    await prisma.profileComment.deleteMany({
      where: {
        OR: [
          { authorId: alice.id },
          { authorId: bob.id },
          { authorId: carol.id },
        ],
      },
    });
    await prisma.profileReport.deleteMany({
      where: { OR: [{ reporterId: alice.id }, { reporterId: bob.id }] },
    });
    await prisma.userPunishment.deleteMany({
      where: { userId: { in: [bob.id, carol.id, dave.id].filter(Boolean) } },
    });
    await prisma.chatMessage.deleteMany({
      where: { channel: { slug: { startsWith: `e2e-${unique}` } } },
    });
    await prisma.chatChannel.deleteMany({
      where: { slug: { startsWith: `e2e-${unique}` } },
    });
    await prisma.userRole.deleteMany({
      where: { role: { slug: { in: cleanupRoleSlugs } } },
    });
    await prisma.rolePermission.deleteMany({
      where: { role: { slug: { in: cleanupRoleSlugs } } },
    });
    await prisma.role.deleteMany({ where: { slug: { in: cleanupRoleSlugs } } });
    await prisma.auditLog.deleteMany({
      where: {
        actor: {
          email: {
            in: [
              admin.email,
              alice.email,
              bob.email,
              carol.email,
              dave.email,
              erin.email,
            ],
          },
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            admin.email,
            alice.email,
            bob.email,
            carol.email,
            dave.email,
            erin.email,
          ],
        },
      },
    });
    await app.close();
  }, 20_000);

  const auth = (user: TestUser) => `Bearer ${user.accessToken}`;

  it('mute: требует users.mute, создаёт запись UserPunishment', async () => {
    await request(app.getHttpServer())
      .post(`/moderation/users/${bob.id}/mute`)
      .set('Authorization', auth(alice))
      .send({ reason: 'Флуд', durationMinutes: 30 })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/moderation/users/${bob.id}/mute`)
      .set('Authorization', auth(admin))
      .send({ reason: 'Флуд', durationMinutes: 30 })
      .expect(201);

    const mine = await request(app.getHttpServer())
      .get('/users/me/punishments')
      .set('Authorization', auth(bob))
      .expect(200);
    expect(
      mine.body.some(
        (p: { punishmentType: string }) => p.punishmentType === 'MUTE',
      ),
    ).toBe(true);
  });

  it('warn: требует users.warn, создаёт запись UserPunishment', async () => {
    await request(app.getHttpServer())
      .post(`/moderation/users/${bob.id}/warn`)
      .set('Authorization', auth(admin))
      .send({ reason: 'Нарушение правил чата' })
      .expect(201);

    const mine = await request(app.getHttpServer())
      .get('/users/me/punishments')
      .set('Authorization', auth(bob))
      .expect(200);
    expect(
      mine.body.some(
        (p: { punishmentType: string }) => p.punishmentType === 'WARN',
      ),
    ).toBe(true);
  });

  it('kick: разрывает refresh-сессию (повторный refresh — 401)', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/login')
      .send({ emailOrUsername: carol.email, password: carol.password })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/moderation/users/${carol.id}/kick`)
      .set('Authorization', auth(admin))
      .send({ reason: 'Токсичное поведение' })
      .expect(201);

    await agent.post('/auth/refresh').expect(401);
  });

  it('ban: немедленно блокирует доступ (даже с валидным access token), логин отклоняется', async () => {
    await request(app.getHttpServer())
      .post(`/moderation/users/${dave.id}/ban`)
      .set('Authorization', auth(admin))
      .send({ reason: 'Серьёзное нарушение', durationHours: 48 })
      .expect(201);

    await request(app.getHttpServer())
      .get('/users/me/punishments')
      .set('Authorization', auth(dave))
      .expect(401);

    // AuthService.login() различает неверные credentials (401) и бан (403)
    // — см. auth.service.ts, ADR PHASE 05.
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ emailOrUsername: dave.email, password: dave.password })
      .expect(403);

    const banned = await prisma.user.findUniqueOrThrow({
      where: { id: dave.id },
    });
    expect(banned.isBanned).toBe(true);
    expect(banned.bannedUntil).not.toBeNull();

    await request(app.getHttpServer())
      .post(`/moderation/users/${dave.id}/ban`)
      .set('Authorization', auth(admin))
      .send({ reason: 'Повторный бан' })
      .expect(403);
  });

  it('hard-delete message: безвозвратно удаляет сообщение чата', async () => {
    const channel = await prisma.chatChannel.create({
      data: {
        slug: `e2e-${unique}-channel`,
        name: 'E2E channel',
        type: 'GENERAL',
      },
    });
    const message = await prisma.chatMessage.create({
      data: {
        channelId: channel.id,
        authorId: alice.id,
        content: 'test message',
        contentHtml: 'test message',
      },
    });

    await request(app.getHttpServer())
      .post(`/moderation/messages/${message.id}/hard-delete`)
      .set('Authorization', auth(alice))
      .send({})
      .expect(403);

    await request(app.getHttpServer())
      .post(`/moderation/messages/${message.id}/hard-delete`)
      .set('Authorization', auth(admin))
      .send({ reason: 'Запрещённый контент' })
      .expect(201);

    const gone = await prisma.chatMessage.findUnique({
      where: { id: message.id },
    });
    expect(gone).toBeNull();
  });

  let rootCommentId: string;
  let replyCommentId: string;

  it('hard-delete comment: безвозвратно удаляет комментарий вместе с ответами (cascade)', async () => {
    const created = await request(app.getHttpServer())
      .post(`/users/${bob.username}/comments`)
      .set('Authorization', auth(alice))
      .send({ content: 'Комментарий на удаление' })
      .expect(201);
    rootCommentId = created.body.id;

    const reply = await request(app.getHttpServer())
      .post(`/users/${bob.username}/comments`)
      .set('Authorization', auth(carol))
      .send({ content: 'Ответ на комментарий', parentId: rootCommentId })
      .expect(201);
    replyCommentId = reply.body.id;

    await request(app.getHttpServer())
      .post(`/moderation/comments/${rootCommentId}/hard-delete`)
      .set('Authorization', auth(admin))
      .send({ reason: 'Оскорбления' })
      .expect(201);

    const rootGone = await prisma.profileComment.findUnique({
      where: { id: rootCommentId },
    });
    const replyGone = await prisma.profileComment.findUnique({
      where: { id: replyCommentId },
    });
    expect(rootGone).toBeNull();
    expect(replyGone).toBeNull();
  });

  it('delete-account: FK-конфликт даёт понятную ошибку, после устранения — удаление проходит', async () => {
    const reportNumber = `R-E2E-${unique}`;
    createdReportNumbers.push(reportNumber);
    await prisma.report.create({
      data: {
        reportNumber,
        type: 'OTHER',
        authorId: erin.id,
        description: 'Тестовое обращение для FK-конфликта',
      },
    });

    await request(app.getHttpServer())
      .delete(`/admin/users/${erin.id}`)
      .set('Authorization', auth(admin))
      .expect(403);

    await prisma.report.delete({ where: { reportNumber } });
    createdReportNumbers.splice(createdReportNumbers.indexOf(reportNumber), 1);

    await request(app.getHttpServer())
      .delete(`/admin/users/${erin.id}`)
      .set('Authorization', auth(admin))
      .expect(200);

    const gone = await prisma.user.findUnique({ where: { id: erin.id } });
    expect(gone).toBeNull();
  });

  it('жалобы на комментарии: список и рассмотрение модератором', async () => {
    const comment = await request(app.getHttpServer())
      .post(`/users/${alice.username}/comments`)
      .set('Authorization', auth(bob))
      .send({ content: 'Спам-комментарий' })
      .expect(201);
    const commentId = comment.body.id;

    await request(app.getHttpServer())
      .post(`/comments/${commentId}/report`)
      .set('Authorization', auth(carol))
      .send({ reason: 'SPAM', description: 'Явный спам' })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/admin/comment-reports')
      .set('Authorization', auth(admin))
      .query({ status: 'PENDING' })
      .expect(200);
    const found = list.body.find(
      (r: { commentId: string }) => r.commentId === commentId,
    );
    expect(found).toBeDefined();

    const reviewed = await request(app.getHttpServer())
      .patch(`/admin/comment-reports/${found.id}`)
      .set('Authorization', auth(admin))
      .send({ status: 'RESOLVED', reviewNote: 'Удалено' })
      .expect(200);
    expect(reviewed.body.status).toBe('RESOLVED');
    expect(reviewed.body.reviewedBy).toBe(admin.id);
  });

  it('жалобы на профиль: создание (запрет на себя), список и рассмотрение модератором', async () => {
    await request(app.getHttpServer())
      .post(`/users/${alice.username}/report`)
      .set('Authorization', auth(alice))
      .send({ reason: 'SPAM' })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/users/${bob.username}/report`)
      .set('Authorization', auth(alice))
      .send({ reason: 'HARASSMENT', description: 'Оскорбления в личке' })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/admin/profile-reports')
      .set('Authorization', auth(admin))
      .query({ status: 'PENDING' })
      .expect(200);
    const found = list.body.find(
      (r: { profileId: string; reporterId: string }) =>
        r.profileId === bob.id && r.reporterId === alice.id,
    );
    expect(found).toBeDefined();

    const reviewed = await request(app.getHttpServer())
      .patch(`/admin/profile-reports/${found.id}`)
      .set('Authorization', auth(admin))
      .send({ status: 'REJECTED', reviewNote: 'Не подтвердилось' })
      .expect(200);
    expect(reviewed.body.status).toBe('REJECTED');
  });
});
