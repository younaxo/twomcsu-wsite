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

describe('Reports (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  const unique = randomUUID().slice(0, 8);
  const cleanupRoleSlugs: string[] = [];
  const createdReportNumbers: string[] = [];

  interface TestUser {
    id: string;
    accessToken: string;
    username: string;
    email: string;
    password: string;
  }

  async function createUser(label: string): Promise<TestUser> {
    const email = `rpt-${label}-${unique}@example.com`;
    const username = `rpt${label}${unique}`
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

  let moderator: TestUser;
  let admin: TestUser;
  let alice: TestUser;
  let bob: TestUser;
  let troll: TestUser;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    permissions = app.get(PermissionService);

    moderator = await createUser('moderator');
    admin = await createUser('admin');
    alice = await createUser('alice');
    bob = await createUser('bob');
    troll = await createUser('troll');

    const moderatorRole = await createRole(`reports-moderator-${unique}`, 10);
    await grantRole(moderator.id, moderatorRole.id);
    await grantPermissions(moderatorRole.id, [
      'reports.view',
      'reports.assign',
      'reports.status',
      'reports.verdict',
      'reports.messages',
      'reports.messages.pin',
      'reports.messages.unpin',
      'reports.notes',
      'reports.notes.pin',
    ]);

    const adminRole = await createRole(`reports-admin-${unique}`, 20);
    await grantRole(admin.id, adminRole.id);
    await grantPermissions(adminRole.id, [
      'reports.view',
      'reports.lock',
      'reports.stats',
      'reports.archived.view',
      'reports.archive',
      'reports.unarchive',
      'reports.delete',
      'reports.ban',
      'reports.messages',
      'support.donations.view',
      'users.punishments',
    ]);
  }, 30_000);

  afterAll(async () => {
    await prisma.report.deleteMany({
      where: { reportNumber: { in: createdReportNumbers } },
    });
    await prisma.topic.deleteMany({ where: { slug: 'report-rules' } });
    await prisma.userPunishment.deleteMany({ where: { userId: bob.id } });
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
              moderator.email,
              admin.email,
              alice.email,
              bob.email,
              troll.email,
            ],
          },
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            moderator.email,
            admin.email,
            alice.email,
            bob.email,
            troll.email,
          ],
        },
      },
    });
    await app.close();
  }, 20_000);

  const auth = (user: TestUser) => `Bearer ${user.accessToken}`;

  it('rules: без темы правил — null, после создания темы — отдаёт её', async () => {
    const empty = await request(app.getHttpServer())
      .get('/reports/rules')
      .set('Authorization', auth(alice))
      .expect(200);
    // Сервис реально возвращает null (нет такой Topic) — superagent
    // представляет JSON null как пустой объект в res.body.
    expect(empty.body).toEqual({});

    await prisma.topic.create({
      data: {
        slug: 'report-rules',
        title: 'Правила подачи обращений',
        category: 'RULES',
        content: 'Текст правил',
        createdBy: admin.id,
      },
    });

    const withRules = await request(app.getHttpServer())
      .get('/reports/rules')
      .set('Authorization', auth(alice))
      .expect(200);
    expect(withRules.body.slug).toBe('report-rules');
  });

  let reportNumber: string;

  it('создание обращения: генерирует reportNumber, резолвит цель по username', async () => {
    const res = await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', auth(alice))
      .send({
        type: 'PLAYER_COMPLAINT',
        description: 'Игрок нарушал правила сервера',
        server: 'survival-1',
        targets: [{ username: bob.username }],
        evidenceLinks: [
          { url: 'https://example.com/proof.png', title: 'Скриншот' },
        ],
      })
      .expect(201);
    reportNumber = res.body.reportNumber;
    createdReportNumbers.push(reportNumber);
    expect(reportNumber).toMatch(/^R-\d{8}-[0-9A-F]{6}$/);
    expect(res.body.targets[0].userId).toBe(bob.id);
    expect(res.body.evidenceLinks).toHaveLength(1);
  });

  it('ban в тикет-системе: блокирует создание новых обращений до unban', async () => {
    await request(app.getHttpServer())
      .post(`/admin/reports/ban/${troll.id}`)
      .set('Authorization', auth(admin))
      .send({ reason: 'Спам обращениями' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', auth(troll))
      .send({
        type: 'OTHER',
        description: 'Попытка создать обращение после бана',
        targets: [{ username: bob.username }],
      })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/admin/reports/ban/${troll.id}`)
      .set('Authorization', auth(admin))
      .expect(200);

    const afterUnban = await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', auth(troll))
      .send({
        type: 'OTHER',
        description: 'Обращение после разбана',
        targets: [{ username: bob.username }],
      })
      .expect(201);
    createdReportNumbers.push(afterUnban.body.reportNumber);
  });

  it('доступ к обращению: чужой пользователь — 403, автор и staff — 200', async () => {
    await request(app.getHttpServer())
      .get(`/reports/${reportNumber}`)
      .set('Authorization', auth(bob))
      .expect(403);

    await request(app.getHttpServer())
      .get(`/reports/${reportNumber}`)
      .set('Authorization', auth(alice))
      .expect(200);

    await request(app.getHttpServer())
      .get(`/reports/${reportNumber}`)
      .set('Authorization', auth(moderator))
      .expect(200);

    const mine = await request(app.getHttpServer())
      .get('/reports')
      .set('Authorization', auth(alice))
      .expect(200);
    expect(
      mine.body.items.some(
        (r: { reportNumber: string }) => r.reportNumber === reportNumber,
      ),
    ).toBe(true);
  });

  let authorMessageId: string;

  it('сообщения автора: создание, редактирование только автором', async () => {
    const added = await request(app.getHttpServer())
      .post(`/reports/${reportNumber}/messages`)
      .set('Authorization', auth(alice))
      .send({ content: 'Дополнительная информация по обращению' })
      .expect(201);
    const messages = added.body.messages as Array<{
      id: string;
      authorId: string;
    }>;
    authorMessageId = messages[messages.length - 1].id;

    await request(app.getHttpServer())
      .patch(`/reports/${reportNumber}/messages/${authorMessageId}`)
      .set('Authorization', auth(bob))
      .send({ content: 'чужая правка' })
      .expect(403);

    const updated = await request(app.getHttpServer())
      .patch(`/reports/${reportNumber}/messages/${authorMessageId}`)
      .set('Authorization', auth(alice))
      .send({ content: 'Отредактированное сообщение' })
      .expect(200);
    expect(
      updated.body.messages.find(
        (m: { id: string }) => m.id === authorMessageId,
      ).content,
    ).toBe('Отредактированное сообщение');
  });

  it('модерация: список, assign, status, staff-сообщение, pin/unpin, verdict', async () => {
    const list = await request(app.getHttpServer())
      .get('/moderation/reports')
      .set('Authorization', auth(moderator))
      .expect(200);
    expect(
      list.body.items.some(
        (r: { reportNumber: string }) => r.reportNumber === reportNumber,
      ),
    ).toBe(true);

    const assigned = await request(app.getHttpServer())
      .patch(`/moderation/reports/${reportNumber}/assign`)
      .set('Authorization', auth(moderator))
      .send({ assignedToId: moderator.id })
      .expect(200);
    expect(assigned.body.assignedToId).toBe(moderator.id);

    const inReview = await request(app.getHttpServer())
      .patch(`/moderation/reports/${reportNumber}/status`)
      .set('Authorization', auth(moderator))
      .send({ status: 'IN_REVIEW' })
      .expect(200);
    expect(inReview.body.status).toBe('IN_REVIEW');

    const staffMessage = await request(app.getHttpServer())
      .post(`/moderation/reports/${reportNumber}/messages`)
      .set('Authorization', auth(moderator))
      .send({ content: 'Ответ модератора' })
      .expect(201);
    const staffMessages = staffMessage.body.messages as Array<{
      id: string;
      isStaff: boolean;
      content: string;
    }>;
    const staffMsg = staffMessages.find(
      (m) => m.content === 'Ответ модератора',
    )!;
    expect(staffMsg.isStaff).toBe(true);

    const pinned = await request(app.getHttpServer())
      .patch(`/moderation/reports/${reportNumber}/messages/${staffMsg.id}/pin`)
      .set('Authorization', auth(moderator))
      .expect(200);
    expect(
      pinned.body.messages.find((m: { id: string }) => m.id === staffMsg.id)
        .isPinned,
    ).toBe(true);

    await request(app.getHttpServer())
      .patch(
        `/moderation/reports/${reportNumber}/messages/${staffMsg.id}/unpin`,
      )
      .set('Authorization', auth(moderator))
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/moderation/reports/${reportNumber}/messages/${authorMessageId}`)
      .set('Authorization', auth(moderator))
      .send({ reason: 'Не по теме' })
      .expect(200);

    const resolved = await request(app.getHttpServer())
      .patch(`/moderation/reports/${reportNumber}/verdict`)
      .set('Authorization', auth(moderator))
      .send({
        verdict: 'Нарушение подтверждено, выдано предупреждение',
        status: 'RESOLVED',
      })
      .expect(200);
    expect(resolved.body.verdict).toContain('подтверждено');
    expect(resolved.body.status).toBe('RESOLVED');
    expect(resolved.body.resolvedAt).toBeDefined();
  });

  let noteId: string;

  it('заметки модератора: CRUD и pin, недоступны автору обращения', async () => {
    const created = await request(app.getHttpServer())
      .post(`/moderation/reports/${reportNumber}/notes`)
      .set('Authorization', auth(moderator))
      .send({ content: 'Внутренняя заметка для коллег' })
      .expect(201);
    const notes = created.body.moderatorNotes as Array<{ id: string }>;
    noteId = notes[notes.length - 1].id;

    await request(app.getHttpServer())
      .patch(`/moderation/reports/${reportNumber}/notes/${noteId}`)
      .set('Authorization', auth(moderator))
      .send({ content: 'Обновлённая заметка' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/moderation/reports/${reportNumber}/notes/${noteId}/pin`)
      .set('Authorization', auth(moderator))
      .expect(200);

    const authorView = await request(app.getHttpServer())
      .get(`/reports/${reportNumber}`)
      .set('Authorization', auth(alice))
      .expect(200);
    expect(authorView.body.moderatorNotes).toBeUndefined();

    await request(app.getHttpServer())
      .delete(`/moderation/reports/${reportNumber}/notes/${noteId}`)
      .set('Authorization', auth(moderator))
      .expect(200);
  });

  it('lock: блокирует новые сообщения от автора', async () => {
    await request(app.getHttpServer())
      .post(`/moderation/reports/${reportNumber}/lock`)
      .set('Authorization', auth(admin))
      .send({ reason: 'Вопрос закрыт' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/reports/${reportNumber}/messages`)
      .set('Authorization', auth(alice))
      .send({ content: 'Ещё одно сообщение' })
      .expect(403);
  });

  it('admin: статистика, архивация/разархивация, hard-delete сообщения, удаление обращения', async () => {
    const stats = await request(app.getHttpServer())
      .get('/admin/reports/stats')
      .set('Authorization', auth(admin))
      .expect(200);
    expect(stats.body.total).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .post(`/admin/reports/${reportNumber}/archive`)
      .set('Authorization', auth(admin))
      .send({ reason: 'Завершено' })
      .expect(201);

    const archivedList = await request(app.getHttpServer())
      .get('/admin/reports/archived')
      .set('Authorization', auth(admin))
      .expect(200);
    expect(
      archivedList.body.items.some(
        (r: { reportNumber: string }) => r.reportNumber === reportNumber,
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .post(`/admin/reports/${reportNumber}/unarchive`)
      .set('Authorization', auth(admin))
      .expect(201);

    const staffMsgAgain = await request(app.getHttpServer())
      .post(`/moderation/reports/${reportNumber}/lock`)
      .set('Authorization', auth(admin))
      .send({ locked: false })
      .expect(201);
    expect(staffMsgAgain.body.isLocked).toBe(false);

    const withMessage = await request(app.getHttpServer())
      .post(`/moderation/reports/${reportNumber}/messages`)
      .set('Authorization', auth(moderator))
      .send({ content: 'Сообщение для hard-delete' })
      .expect(201);
    const toDelete = (
      withMessage.body.messages as Array<{ id: string; content: string }>
    ).find((m) => m.content === 'Сообщение для hard-delete')!;

    await request(app.getHttpServer())
      .delete(`/admin/reports/${reportNumber}/messages/${toDelete.id}`)
      .set('Authorization', auth(admin))
      .expect(200);

    const gone = await prisma.reportMessage.findUnique({
      where: { id: toDelete.id },
    });
    expect(gone).toBeNull();

    await request(app.getHttpServer())
      .delete(`/admin/reports/${reportNumber}`)
      .set('Authorization', auth(admin))
      .expect(200);
    createdReportNumbers.splice(createdReportNumbers.indexOf(reportNumber), 1);

    await request(app.getHttpServer())
      .get(`/reports/${reportNumber}`)
      .set('Authorization', auth(alice))
      .expect(404);
  });

  it('проблема с донатом: создание и просмотр администратором', async () => {
    const created = await request(app.getHttpServer())
      .post('/support/donation-problem')
      .set('Authorization', auth(alice))
      .send({
        description: 'Деньги списались, донат не зачислен',
        contactEmail: alice.email,
      })
      .expect(201);
    createdReportNumbers.push(created.body.reportNumber);
    expect(created.body.type).toBe('DONATION_PROBLEM');

    const donations = await request(app.getHttpServer())
      .get('/admin/support/donations')
      .set('Authorization', auth(admin))
      .expect(200);
    expect(
      donations.body.items.some(
        (r: { reportNumber: string }) =>
          r.reportNumber === created.body.reportNumber,
      ),
    ).toBe(true);
  });

  it('наказания: выдача/обновление администратором, список по username', async () => {
    const issued = await request(app.getHttpServer())
      .post(`/admin/users/${bob.id}/punishments`)
      .set('Authorization', auth(admin))
      .send({ punishmentType: 'WARN', reason: 'Нарушение правил чата' })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`/admin/users/${bob.username}/punishments`)
      .set('Authorization', auth(admin))
      .expect(200);
    expect(list.body.some((p: { id: string }) => p.id === issued.body.id)).toBe(
      true,
    );

    const updated = await request(app.getHttpServer())
      .patch(`/admin/users/${bob.id}/punishments/${issued.body.id}`)
      .set('Authorization', auth(admin))
      .send({ isActive: false })
      .expect(200);
    expect(updated.body.isActive).toBe(false);
  });
});
