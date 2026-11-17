import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { markStaffTwoFactorEnabled } from './helpers/staff-two-factor';
import { AuthService } from '../src/modules/auth/auth.service';
import { PermissionService } from '../src/modules/roles/permission.service';
import { REPORT_MESSAGE_LIMIT } from '../src/modules/reports/report-constants';

// См. auth.e2e-spec.ts — риск конкуренции за ресурсы под полным сьютом.
jest.setTimeout(20_000);

/// Служебные поля персонала: игрок не должен получать их ни в каком ответе.
const STAFF_ONLY_FIELDS = [
  'internalNote',
  'assignedToId',
  'assignedTo',
  'lockedBy',
  'isArchived',
  'archivedAt',
  'archivedBy',
  'archiveReason',
  'moderatorNotes',
  'priority',
];

/// Система обращений, этап 01: обжалование наказаний, фильтры очереди,
/// приоритет, история действий, приватность и RBAC.
describe('Reports support (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  const unique = randomUUID().slice(0, 8);
  const cleanupRoleSlugs: string[] = [];
  const createdReportNumbers: string[] = [];
  const createdEmails: string[] = [];
  let authService: AuthService;

  interface TestUser {
    id: string;
    accessToken: string;
    username: string;
    email: string;
  }

  async function createUser(label: string): Promise<TestUser> {
    const email = `sup-${label}-${unique}@example.com`;
    const username = `sup${label}${unique}`
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 16);
    const password = 'Sup3rSecretPassw0rd!';
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);
    createdEmails.push(email);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    // Токен выдаёт тот же AuthService.issueSessionForUser, что и вход через
    // внешний аккаунт: та же пара access/refresh, но без HTTP-лимита
    // POST /auth/login (10/мин с IP) — 12 входов подряд упирались в 429.
    const session = await authService.issueSessionForUser(user.id, {
      ip: '127.0.0.1',
      userAgent: 'reports-support-e2e',
    });
    return {
      id: user.id,
      accessToken: session.accessToken,
      username,
      email,
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
    await markStaffTwoFactorEnabled(prisma, userId);
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

  /// Ограниченный по времени опрос условия: каждая итерация — запрос к БД,
  /// между итерациями — короткая пауза 25 мс, общий дедлайн — 5 с.
  async function waitFor(
    condition: () => Promise<boolean>,
    what: string,
    timeoutMs = 5_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!(await condition())) {
      if (Date.now() > deadline) {
        throw new Error(`Не дождались: ${what}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  const auth = (user: TestUser) => `Bearer ${user.accessToken}`;

  let moderator: TestUser;
  let otherModerator: TestUser;
  let alice: TestUser;
  let bob: TestUser;
  let outsider: TestUser;
  let senior: TestUser;
  let viewerOnly: TestUser;
  let pinOnly: TestUser;
  let unpinOnly: TestUser;
  let msgSpammer: TestUser;
  let filterUser: TestUser;
  let typeFilterUser: TestUser;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    permissions = app.get(PermissionService);
    authService = app.get(AuthService);

    moderator = await createUser('mod');
    otherModerator = await createUser('mod2');
    alice = await createUser('alice');
    bob = await createUser('bob');
    outsider = await createUser('out');
    senior = await createUser('sen');
    viewerOnly = await createUser('view');
    pinOnly = await createUser('pin');
    unpinOnly = await createUser('unp');
    msgSpammer = await createUser('msp');
    filterUser = await createUser('flt');
    typeFilterUser = await createUser('typ');

    const role = await createRole(`support-mod-${unique}`, 10);
    await grantRole(moderator.id, role.id);
    await grantRole(otherModerator.id, role.id);
    await grantPermissions(role.id, [
      'reports.view',
      'reports.assign',
      'reports.status',
      'reports.verdict',
      'reports.messages',
      'reports.notes',
    ]);
    // Срез 2: «старший» (правка чужих заметок, pin, unpin) и сотрудник только с view.
    const seniorRole = await createRole(`support-senior-${unique}`, 20);
    await grantRole(senior.id, seniorRole.id);
    await grantPermissions(seniorRole.id, [
      'reports.view',
      'reports.notes',
      'reports.notes.pin',
      'reports.notes.unpin',
      'reports.notes.edit',
    ]);
    // Разделение прав: pin без unpin и unpin без pin (M1).
    const pinRole = await createRole(`support-pin-${unique}`, 6);
    await grantRole(pinOnly.id, pinRole.id);
    await grantPermissions(pinRole.id, [
      'reports.view',
      'reports.notes',
      'reports.notes.pin',
    ]);
    const unpinRole = await createRole(`support-unpin-${unique}`, 7);
    await grantRole(unpinOnly.id, unpinRole.id);
    await grantPermissions(unpinRole.id, [
      'reports.view',
      'reports.notes',
      'reports.notes.unpin',
    ]);
    const viewRole = await createRole(`support-view-${unique}`, 5);
    await grantRole(viewerOnly.id, viewRole.id);
    await grantPermissions(viewRole.id, ['reports.view']);
  }, 30_000);

  afterAll(async () => {
    // app/prisma могут быть не созданы, если beforeAll упал раньше; приложение
    // закрываем всегда, иначе jest не завершится (висят соединения).
    try {
      if (prisma) {
        const emails = createdEmails;
        await prisma.report.deleteMany({
          where: { reportNumber: { in: createdReportNumbers } },
        });
        await prisma.userPunishment.deleteMany({
          where: { user: { email: { in: emails } } },
        });
        await prisma.userRole.deleteMany({
          where: { role: { slug: { in: cleanupRoleSlugs } } },
        });
        await prisma.rolePermission.deleteMany({
          where: { role: { slug: { in: cleanupRoleSlugs } } },
        });
        await prisma.role.deleteMany({
          where: { slug: { in: cleanupRoleSlugs } },
        });
        await prisma.auditLog.deleteMany({
          where: { actor: { email: { in: emails } } },
        });
        await prisma.notification.deleteMany({
          where: { user: { email: { in: emails } } },
        });
        await prisma.user.deleteMany({ where: { email: { in: emails } } });
      }
    } finally {
      if (app) {
        await app.close();
      }
    }
  }, 20_000);

  async function createPunishment(userId: string, isAppealable = true) {
    return prisma.userPunishment.create({
      data: {
        userId,
        punishmentType: 'MUTE',
        reason: 'Нарушение правил чата',
        issuedBy: moderator.id,
        isAppealable,
      },
    });
  }

  async function createAppeal(user: TestUser, punishmentId: string) {
    return request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', auth(user))
      .send({
        type: 'PUNISHMENT_APPEAL',
        description: 'Прошу пересмотреть наказание',
        appealedPunishmentId: punishmentId,
      });
  }

  let appealNumber: string;
  let appealId: string;
  let punishmentId: string;

  it('обжалование: успех, обязательное поле, чужое/необжалуемое/дубль/другой тип', async () => {
    const punishment = await createPunishment(alice.id);
    punishmentId = punishment.id;

    const created = await createAppeal(alice, punishment.id);
    expect(created.status).toBe(201);
    appealNumber = created.body.reportNumber;
    appealId = created.body.id;
    createdReportNumbers.push(appealNumber);
    expect(created.body.appealedPunishmentId).toBe(punishment.id);
    expect(created.body.appealedPunishment.issuedBy).toBeUndefined();
    expect(created.body.targets).toHaveLength(0);
    for (const field of STAFF_ONLY_FIELDS) {
      expect(created.body).not.toHaveProperty(field);
    }

    // Без наказания.
    await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', auth(alice))
      .send({ type: 'PUNISHMENT_APPEAL', description: 'Без наказания' })
      .expect(400);

    // Чужое наказание — 404 (не раскрываем существование).
    await createAppeal(bob, punishment.id).then((r) =>
      expect(r.status).toBe(404),
    );

    // Необжалуемое.
    const locked = await createPunishment(alice.id, false);
    const notAppealable = await createAppeal(alice, locked.id);
    expect(notAppealable.status).toBe(400);

    // Дубль при открытом обращении.
    const duplicate = await createAppeal(alice, punishment.id);
    expect(duplicate.status).toBe(409);

    // Поле запрещено для других типов.
    await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', auth(alice))
      .send({
        type: 'TECHNICAL_ISSUE',
        description: 'Не по теме',
        appealedPunishmentId: punishment.id,
      })
      .expect(400);
  });

  it('гонка: два параллельных обжалования одного наказания — ровно один 201, второй 409', async () => {
    const racePunishment = await createPunishment(bob.id);
    const results = await Promise.all([
      createAppeal(bob, racePunishment.id),
      createAppeal(bob, racePunishment.id),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
    for (const r of results.filter((x) => x.status === 201)) {
      createdReportNumbers.push(r.body.reportNumber);
    }
    expect(
      await prisma.report.count({
        where: {
          appealedPunishmentId: racePunishment.id,
          status: { notIn: ['RESOLVED', 'REJECTED', 'CLOSED'] },
        },
      }),
    ).toBe(1);
  });

  it('пагинация: page выше верхней границы — 400', async () => {
    await request(app.getHttpServer())
      .get('/reports?page=10001')
      .set('Authorization', auth(alice))
      .expect(400);
    await request(app.getHttpServer())
      .get('/moderation/reports?page=10001')
      .set('Authorization', auth(moderator))
      .expect(400);
    await request(app.getHttpServer())
      .get(`/moderation/reports/${appealNumber}/history?page=10001`)
      .set('Authorization', auth(moderator))
      .expect(400);
  });

  it('очередь: priority, assignedToId, q; игроку очередь недоступна (403)', async () => {
    const technical = await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', auth(bob))
      .send({ type: 'TECHNICAL_ISSUE', description: 'Не грузится карта' })
      .expect(201);
    createdReportNumbers.push(technical.body.reportNumber);

    const high = await request(app.getHttpServer())
      .get('/moderation/reports?priority=HIGH&limit=100')
      .set('Authorization', auth(moderator))
      .expect(200);
    const highNumbers = high.body.items.map(
      (r: { reportNumber: string }) => r.reportNumber,
    );
    expect(highNumbers).toContain(appealNumber);
    expect(highNumbers).not.toContain(technical.body.reportNumber);
    expect(
      high.body.items.every((r: { priority: string }) => r.priority === 'HIGH'),
    ).toBe(true);

    const bySearch = await request(app.getHttpServer())
      .get(`/moderation/reports?q=${appealNumber.toLowerCase()}`)
      .set('Authorization', auth(moderator))
      .expect(200);
    expect(bySearch.body.total).toBe(1);

    const byAuthor = await request(app.getHttpServer())
      .get(`/moderation/reports?q=${alice.username.toUpperCase()}`)
      .set('Authorization', auth(moderator))
      .expect(200);
    expect(byAuthor.body.items[0].reportNumber).toBe(appealNumber);

    const unassigned = await request(app.getHttpServer())
      .get('/moderation/reports?assignedToId=unassigned&limit=100')
      .set('Authorization', auth(moderator))
      .expect(200);
    expect(
      unassigned.body.items.some(
        (r: { reportNumber: string }) => r.reportNumber === appealNumber,
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .patch(`/moderation/reports/${appealNumber}/assign`)
      .set('Authorization', auth(moderator))
      .send({ assignedToId: moderator.id })
      .expect(200);

    const mine = await request(app.getHttpServer())
      .get('/moderation/reports?assignedToId=me')
      .set('Authorization', auth(moderator))
      .expect(200);
    expect(mine.body.items.map((r: { id: string }) => r.id)).toEqual([
      appealId,
    ]);

    await request(app.getHttpServer())
      .get('/moderation/reports?priority=URGENT')
      .set('Authorization', auth(otherModerator))
      .expect(200)
      .expect((res) => expect(res.body.items).toHaveLength(0));

    await request(app.getHttpServer())
      .get('/moderation/reports')
      .set('Authorization', auth(outsider))
      .expect(403);
    // Игрок не может подставить staff-фильтры в свой список.
    await request(app.getHttpServer())
      .get('/reports?q=test')
      .set('Authorization', auth(alice))
      .expect(400);
  });

  it('передача: исполнитель без reports.view или несуществующий — 400/404', async () => {
    await request(app.getHttpServer())
      .patch(`/moderation/reports/${appealNumber}/assign`)
      .set('Authorization', auth(moderator))
      .send({ assignedToId: outsider.id })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/moderation/reports/${appealNumber}/assign`)
      .set('Authorization', auth(moderator))
      .send({ assignedToId: 'does-not-exist' })
      .expect(404);
    const reassigned = await request(app.getHttpServer())
      .patch(`/moderation/reports/${appealNumber}/assign`)
      .set('Authorization', auth(moderator))
      .send({ assignedToId: otherModerator.id })
      .expect(200);
    expect(reassigned.body.assignedToId).toBe(otherModerator.id);
  });

  it('приватность: автор не видит заметки/internalNote/priority, персонал — видит', async () => {
    await request(app.getHttpServer())
      .post(`/moderation/reports/${appealNumber}/notes`)
      .set('Authorization', auth(moderator))
      .send({ content: 'Секретная заметка коллег' })
      .expect(201);
    await prisma.report.update({
      where: { reportNumber: appealNumber },
      data: { internalNote: 'внутреннее-примечание' },
    });

    // Вложение сообщения с uploadedBy — игрок не должен его увидеть.
    // Создание обращения хранит текст в report.description и не создаёт
    // ReportMessage, поэтому сообщение заводим явно.
    const anyMessage = await prisma.reportMessage.create({
      data: {
        reportId: appealId,
        authorId: alice.id,
        content: 'Сообщение автора для проверки приватности',
        isStaff: false,
      },
    });
    await prisma.reportMessageAttachment.create({
      data: {
        messageId: anyMessage.id,
        fileName: 'proof.png',
        fileUrl: 'https://example.com/proof.png',
        fileSize: 1024,
        mimeType: 'image/png',
        uploadedBy: moderator.id,
      },
    });

    const authorView = await request(app.getHttpServer())
      .get(`/reports/${appealNumber}`)
      .set('Authorization', auth(alice))
      .expect(200);
    const text = JSON.stringify(authorView.body);
    expect(text).not.toContain('uploadedBy');
    expect(text).not.toContain('deletedBy');
    const messages: Array<Record<string, unknown>> = authorView.body.messages;
    expect(messages.length).toBeGreaterThan(0);
    let seenMessageAttachment = false;
    for (const message of messages) {
      expect(message).not.toHaveProperty('deletedBy');
      for (const att of (message.attachments ?? []) as object[]) {
        seenMessageAttachment = true;
        expect(att).not.toHaveProperty('uploadedBy');
      }
    }
    expect(seenMessageAttachment).toBe(true);
    for (const target of authorView.body.targets as object[]) {
      expect(target).not.toHaveProperty('userId');
    }
    expect(text).not.toContain('внутреннее-примечание');
    expect(text).not.toContain('Секретная заметка коллег');
    expect(authorView.body.priority).toBeUndefined();
    expect(authorView.body.appealedPunishment.id).toBe(punishmentId);
    expect(authorView.body.appealedPunishment.issuedBy).toBeUndefined();
    for (const field of STAFF_ONLY_FIELDS) {
      expect(authorView.body).not.toHaveProperty(field);
    }

    const mine = await request(app.getHttpServer())
      .get('/reports')
      .set('Authorization', auth(alice))
      .expect(200);
    expect(JSON.stringify(mine.body)).not.toContain('внутреннее-примечание');
    expect(JSON.stringify(mine.body)).not.toContain('"priority"');
    expect(mine.body.items.length).toBeGreaterThan(0);
    for (const item of mine.body.items) {
      for (const field of STAFF_ONLY_FIELDS) {
        expect(item).not.toHaveProperty(field);
      }
    }

    const staffView = await request(app.getHttpServer())
      .get(`/reports/${appealNumber}`)
      .set('Authorization', auth(moderator))
      .expect(200);
    expect(staffView.body.priority).toBe('HIGH');
    expect(staffView.body.internalNote).toBe('внутреннее-примечание');
    expect(staffView.body.moderatorNotes).toHaveLength(1);
    // Персонал служебные поля видит (исполнитель назначен ранее).
    expect(staffView.body.assignedToId).toBe(otherModerator.id);

    // Ответ на сообщение автора тоже без заметок.
    const added = await request(app.getHttpServer())
      .post(`/reports/${appealNumber}/messages`)
      .set('Authorization', auth(alice))
      .send({ content: 'Дополнение от автора' })
      .expect(201);
    expect(JSON.stringify(added.body)).not.toContain('внутреннее-примечание');

    // Чужой игрок не видит обращение.
    await request(app.getHttpServer())
      .get(`/reports/${appealNumber}`)
      .set('Authorization', auth(bob))
      .expect(403);
  });

  it('история: события staff-мутаций привязаны к обращению, без IP/UA; игроку — 403', async () => {
    await request(app.getHttpServer())
      .patch(`/moderation/reports/${appealNumber}/status`)
      .set('Authorization', auth(moderator))
      .send({ status: 'IN_REVIEW' })
      .expect(200);

    // AuditInterceptor пишет событие без ожидания ответа: опрашиваем саму
    // запись аудита (без фиксированных пауз) и только потом читаем историю.
    await waitFor(
      async () =>
        (await prisma.auditLog.count({
          where: { targetId: appealId, action: 'reports.status' },
        })) > 0,
      'запись аудита reports.status',
    );
    const res = await request(app.getHttpServer())
      .get(`/moderation/reports/${appealNumber}/history`)
      .set('Authorization', auth(moderator))
      .expect(200);
    const items: Array<Record<string, unknown>> = res.body.items;
    const actions = items.map((i) => i.action);
    expect(actions).toContain('reports.status');
    expect(actions).toContain('reports.assign');
    const first = items[0];
    expect(first.ipAddress).toBeUndefined();
    expect(first.userAgent).toBeUndefined();
    expect(Object.keys(first.actor as object).sort()).toEqual([
      'avatar',
      'id',
      'tag',
      'username',
    ]);

    await request(app.getHttpServer())
      .get(`/moderation/reports/${appealNumber}/history`)
      .set('Authorization', auth(alice))
      .expect(403);
    await request(app.getHttpServer())
      .get('/moderation/reports/R-00000000-NOPE00/history')
      .set('Authorization', auth(moderator))
      .expect(404);
  });

  it('RBAC: игрок не может назначать, менять статус и выносить вердикт', async () => {
    for (const [path, body] of [
      ['assign', { assignedToId: alice.id }],
      ['status', { status: 'CLOSED' }],
      ['verdict', { verdict: 'x' }],
    ] as const) {
      await request(app.getHttpServer())
        .patch(`/moderation/reports/${appealNumber}/${path}`)
        .set('Authorization', auth(alice))
        .send(body)
        .expect(403);
    }
  });

  it('завершённое обращение: автор не пишет и не правит, после вердикта можно подать новое обжалование', async () => {
    const message = await request(app.getHttpServer())
      .post(`/reports/${appealNumber}/messages`)
      .set('Authorization', auth(alice))
      .send({ content: 'Сообщение до вердикта' })
      .expect(201);
    const own = (
      message.body.messages as Array<{ id: string; content: string }>
    ).find((m) => m.content === 'Сообщение до вердикта')!;

    await request(app.getHttpServer())
      .patch(`/moderation/reports/${appealNumber}/verdict`)
      .set('Authorization', auth(moderator))
      .send({ verdict: 'Наказание сохранено', status: 'REJECTED' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/reports/${appealNumber}/messages`)
      .set('Authorization', auth(alice))
      .send({ content: 'Пишу после закрытия' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/reports/${appealNumber}/messages/${own.id}`)
      .set('Authorization', auth(alice))
      .send({ content: 'Правка после закрытия' })
      .expect(403);

    // Автор получил уведомление о вердикте.
    const notification = await prisma.notification.findFirst({
      where: { userId: alice.id, type: 'REPORT_VERDICT' },
    });
    expect(notification?.link).toBe(`/support/${appealNumber}`);

    const again = await createAppeal(alice, punishmentId);
    expect(again.status).toBe(201);
    createdReportNumbers.push(again.body.reportNumber);
  });

  // ---------- Срез 2 ----------

  async function createReportAs(
    user: TestUser,
    type = 'TECHNICAL_ISSUE',
    description = 'Срез 2: тестовое обращение',
  ): Promise<{ id: string; reportNumber: string }> {
    const res = await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', auth(user))
      .send({ type, description })
      .expect(201);
    createdReportNumbers.push(res.body.reportNumber);
    return { id: res.body.id, reportNumber: res.body.reportNumber };
  }

  it('лимит сообщений игрока: 21-е за минуту — 429, персонал не ограничен', async () => {
    const report = await createReportAs(msgSpammer);
    for (let i = 0; i < REPORT_MESSAGE_LIMIT; i += 1) {
      await request(app.getHttpServer())
        .post(`/reports/${report.reportNumber}/messages`)
        .set('Authorization', auth(msgSpammer))
        .send({ content: `Сообщение ${i}` })
        .expect(201);
    }
    await request(app.getHttpServer())
      .post(`/reports/${report.reportNumber}/messages`)
      .set('Authorization', auth(msgSpammer))
      .send({ content: 'Сообщение сверх лимита' })
      .expect(429);
    // Сообщения персонала в лимит игрока не входят и сами не ограничены.
    for (let i = 0; i < 3; i += 1) {
      await request(app.getHttpServer())
        .post(`/moderation/reports/${report.reportNumber}/messages`)
        .set('Authorization', auth(moderator))
        .send({ content: `Ответ персонала ${i}` })
        .expect(201);
    }
  });

  it('assignable-staff: права, фильтр q, лимит, только публичные поля', async () => {
    // Игрок и сотрудник без reports.assign — 403.
    await request(app.getHttpServer())
      .get('/moderation/reports/assignable-staff')
      .set('Authorization', auth(alice))
      .expect(403);
    await request(app.getHttpServer())
      .get('/moderation/reports/assignable-staff')
      .set('Authorization', auth(viewerOnly))
      .expect(403);

    const res = await request(app.getHttpServer())
      .get(`/moderation/reports/assignable-staff?q=${unique}&limit=50`)
      .set('Authorization', auth(moderator))
      .expect(200);
    const items: Array<Record<string, unknown>> = res.body.items;
    const ids = items.map((i) => i.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        moderator.id,
        otherModerator.id,
        senior.id,
        viewerOnly.id,
      ]),
    );
    // Без reports.view (игроки) — не попадают.
    expect(ids).not.toContain(alice.id);
    expect(ids).not.toContain(outsider.id);
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual([
        'avatar',
        'id',
        'tag',
        'username',
      ]);
    }
    expect(JSON.stringify(res.body)).not.toContain('@example.com');

    // Заблокированный исключается.
    await prisma.user.update({
      where: { id: otherModerator.id },
      data: { isBanned: true },
    });
    try {
      const banned = await request(app.getHttpServer())
        .get(`/moderation/reports/assignable-staff?q=${unique}`)
        .set('Authorization', auth(moderator))
        .expect(200);
      expect(banned.body.items.map((i: { id: string }) => i.id)).not.toContain(
        otherModerator.id,
      );
    } finally {
      await prisma.user.update({
        where: { id: otherModerator.id },
        data: { isBanned: false },
      });
    }

    // Фильтр q по нику без учёта регистра, ограничение limit.
    const byQ = await request(app.getHttpServer())
      .get(
        `/moderation/reports/assignable-staff?q=${viewerOnly.username.toUpperCase()}`,
      )
      .set('Authorization', auth(moderator))
      .expect(200);
    expect(byQ.body.items.map((i: { id: string }) => i.id)).toEqual([
      viewerOnly.id,
    ]);
    const limited = await request(app.getHttpServer())
      .get(`/moderation/reports/assignable-staff?q=${unique}&limit=2`)
      .set('Authorization', auth(moderator))
      .expect(200);
    expect(limited.body.items).toHaveLength(2);
    await request(app.getHttpServer())
      .get('/moderation/reports/assignable-staff?limit=51')
      .set('Authorization', auth(moderator))
      .expect(400);
  });

  it('заметки: чужую без reports.notes.edit править нельзя (403), автор и reports.notes.edit — 200; pin/unpin и порядок', async () => {
    const report = await createReportAs(filterUser);
    const base = `/moderation/reports/${report.reportNumber}`;
    const first = await request(app.getHttpServer())
      .post(`${base}/notes`)
      .set('Authorization', auth(moderator))
      .send({ content: 'Первая заметка' })
      .expect(201);
    const noteId: string = first.body.moderatorNotes[0].id;
    const second = await request(app.getHttpServer())
      .post(`${base}/notes`)
      .set('Authorization', auth(moderator))
      .send({ content: 'Вторая заметка' })
      .expect(201);
    expect(second.body.moderatorNotes).toHaveLength(2);

    // Другой сотрудник с reports.notes, но без reports.notes.edit.
    await request(app.getHttpServer())
      .patch(`${base}/notes/${noteId}`)
      .set('Authorization', auth(otherModerator))
      .send({ content: 'Чужая правка' })
      .expect(403);
    // Игрок — 403 на уровне права.
    await request(app.getHttpServer())
      .patch(`${base}/notes/${noteId}`)
      .set('Authorization', auth(alice))
      .send({ content: 'Игрок' })
      .expect(403);
    expect(
      (
        await prisma.reportModeratorNote.findUniqueOrThrow({
          where: { id: noteId },
        })
      ).content,
    ).toBe('Первая заметка');

    // Автор.
    const byAuthor = await request(app.getHttpServer())
      .patch(`${base}/notes/${noteId}`)
      .set('Authorization', auth(moderator))
      .send({ content: 'Правка автора' })
      .expect(200);
    expect(
      byAuthor.body.moderatorNotes.find((n: { id: string }) => n.id === noteId)
        .content,
    ).toBe('Правка автора');
    // Актёр с reports.notes.edit.
    const bySenior = await request(app.getHttpServer())
      .patch(`${base}/notes/${noteId}`)
      .set('Authorization', auth(senior))
      .send({ content: 'Правка старшего' })
      .expect(200);
    expect(
      bySenior.body.moderatorNotes.find((n: { id: string }) => n.id === noteId)
        .content,
    ).toBe('Правка старшего');

    // Закрепление: reports.notes.pin и reports.notes.unpin у senior; закреплённая — первой.
    const secondId: string = second.body.moderatorNotes[1].id;
    await request(app.getHttpServer())
      .patch(`${base}/notes/${secondId}/pin`)
      .set('Authorization', auth(otherModerator))
      .expect(403);
    const pinned = await request(app.getHttpServer())
      .patch(`${base}/notes/${secondId}/pin`)
      .set('Authorization', auth(senior))
      .expect(200);
    expect(pinned.body.moderatorNotes.map((n: { id: string }) => n.id)).toEqual(
      [secondId, noteId],
    );
    // Открепление требует reports.notes.unpin (у otherModerator его нет).
    await request(app.getHttpServer())
      .delete(`${base}/notes/${secondId}/pin`)
      .set('Authorization', auth(otherModerator))
      .expect(403);
    const unpinned = await request(app.getHttpServer())
      .delete(`${base}/notes/${secondId}/pin`)
      .set('Authorization', auth(senior))
      .expect(200);
    expect(
      unpinned.body.moderatorNotes.map((n: { id: string }) => n.id),
    ).toEqual([noteId, secondId]);
    // PATCH только закрепляет: pinned:false отвергается (400), состояние не меняется.
    const viaBody = await request(app.getHttpServer())
      .patch(`${base}/notes/${secondId}/pin`)
      .set('Authorization', auth(senior))
      .send({ pinned: false })
      .expect(400);
    expect(JSON.stringify(viaBody.body)).toContain('DELETE');
    expect(
      (
        await prisma.reportModeratorNote.findUniqueOrThrow({
          where: { id: secondId },
        })
      ).isPinned,
    ).toBe(false);

    // Ответ GET для персонала тоже отсортирован (закреплённые первыми).
    await request(app.getHttpServer())
      .patch(`${base}/notes/${secondId}/pin`)
      .set('Authorization', auth(senior))
      .expect(200);
    const view = await request(app.getHttpServer())
      .get(`/reports/${report.reportNumber}`)
      .set('Authorization', auth(moderator))
      .expect(200);
    expect(view.body.moderatorNotes[0].id).toBe(secondId);
  });

  it('приватность: игрок не видит authorId сообщений персонала, свои сохраняются', async () => {
    const report = await createReportAs(filterUser);
    await request(app.getHttpServer())
      .post(`/moderation/reports/${report.reportNumber}/messages`)
      .set('Authorization', auth(moderator))
      .send({ content: 'Ответ сотрудника' })
      .expect(201);
    const posted = await request(app.getHttpServer())
      .post(`/reports/${report.reportNumber}/messages`)
      .set('Authorization', auth(filterUser))
      .send({ content: 'Ответ игрока' })
      .expect(201);

    for (const body of [
      posted.body,
      (
        await request(app.getHttpServer())
          .get(`/reports/${report.reportNumber}`)
          .set('Authorization', auth(filterUser))
          .expect(200)
      ).body,
    ]) {
      const messages: Array<{
        isStaff: boolean;
        authorId: string | null;
        content: string;
      }> = body.messages;
      const staffMsg = messages.find((m) => m.isStaff)!;
      const ownMsg = messages.find((m) => m.content === 'Ответ игрока')!;
      expect(staffMsg.authorId).toBeNull();
      expect(ownMsg.authorId).toBe(filterUser.id);
      expect(JSON.stringify(body)).not.toContain(moderator.id);
    }
    // Персонал видит authorId.
    const staffView = await request(app.getHttpServer())
      .get(`/reports/${report.reportNumber}`)
      .set('Authorization', auth(moderator))
      .expect(200);
    expect(
      staffView.body.messages.find((m: { isStaff: boolean }) => m.isStaff)
        .authorId,
    ).toBe(moderator.id);
  });

  it('заметки: pin без unpin только закрепляет, unpin без pin только открепляет (M1)', async () => {
    const report = await createReportAs(filterUser);
    const base = `/moderation/reports/${report.reportNumber}`;
    const created = await request(app.getHttpServer())
      .post(`${base}/notes`)
      .set('Authorization', auth(moderator))
      .send({ content: 'Заметка для pin/unpin' })
      .expect(201);
    const noteId: string = created.body.moderatorNotes[0].id;
    const isPinned = async () =>
      (
        await prisma.reportModeratorNote.findUniqueOrThrow({
          where: { id: noteId },
        })
      ).isPinned;

    // unpin без pin: закрепить нельзя.
    await request(app.getHttpServer())
      .patch(`${base}/notes/${noteId}/pin`)
      .set('Authorization', auth(unpinOnly))
      .expect(403);
    expect(await isPinned()).toBe(false);

    // pin без unpin: закрепляет, но открепить ни через DELETE, ни через PATCH нельзя.
    await request(app.getHttpServer())
      .patch(`${base}/notes/${noteId}/pin`)
      .set('Authorization', auth(pinOnly))
      .expect(200);
    expect(await isPinned()).toBe(true);
    await request(app.getHttpServer())
      .delete(`${base}/notes/${noteId}/pin`)
      .set('Authorization', auth(pinOnly))
      .expect(403);
    await request(app.getHttpServer())
      .patch(`${base}/notes/${noteId}/pin`)
      .set('Authorization', auth(pinOnly))
      .send({ pinned: false })
      .expect(400);
    expect(await isPinned()).toBe(true);

    // unpin без pin: DELETE работает.
    await request(app.getHttpServer())
      .delete(`${base}/notes/${noteId}/pin`)
      .set('Authorization', auth(unpinOnly))
      .expect(200);
    expect(await isPinned()).toBe(false);
  });

  it('смена статуса создаёт уведомление REPORT_STATUS_CHANGED автору обращения', async () => {
    const report = await createReportAs(filterUser);
    await request(app.getHttpServer())
      .patch(`/moderation/reports/${report.reportNumber}/status`)
      .set('Authorization', auth(moderator))
      .send({ status: 'IN_REVIEW' })
      .expect(200);
    await waitFor(
      async () =>
        (await prisma.notification.count({
          where: {
            userId: filterUser.id,
            type: 'REPORT_STATUS_CHANGED',
            link: `/support/${report.reportNumber}`,
          },
        })) >= 1,
      'уведомление REPORT_STATUS_CHANGED автору',
    );
    const notification = await prisma.notification.findFirstOrThrow({
      where: {
        userId: filterUser.id,
        type: 'REPORT_STATUS_CHANGED',
        link: `/support/${report.reportNumber}`,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(notification.metadata).toMatchObject({
      reportNumber: report.reportNumber,
    });
  });

  it('история для игрока: санитизированная лента автора; чужой игрок — 403', async () => {
    const report = await createReportAs(filterUser);
    await request(app.getHttpServer())
      .patch(`/moderation/reports/${report.reportNumber}/status`)
      .set('Authorization', auth(moderator))
      .send({ status: 'IN_REVIEW' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/moderation/reports/${report.reportNumber}/notes`)
      .set('Authorization', auth(moderator))
      .send({ content: 'Закрытая заметка истории' })
      .expect(201);
    await waitFor(
      async () =>
        (await prisma.auditLog.count({
          where: {
            targetId: report.id,
            action: { in: ['reports.status', 'reports.notes'] },
          },
        })) >= 2,
      'записи аудита reports.status и reports.notes',
    );

    const res = await request(app.getHttpServer())
      .get(`/reports/${report.reportNumber}/history`)
      .set('Authorization', auth(filterUser))
      .expect(200);
    const items: Array<Record<string, unknown>> = res.body.items;
    expect(items.map((i) => i.kind)).toEqual(['STATUS_CHANGED', 'CREATED']);
    expect(items[0].status).toBe('IN_REVIEW');
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual([
        'createdAt',
        'id',
        'kind',
        'status',
      ]);
    }
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(moderator.id);
    expect(text).not.toContain('Закрытая заметка истории');
    for (const forbidden of ['actor', 'ipAddress', 'userAgent', 'changes']) {
      expect(text).not.toContain(`"${forbidden}"`);
    }
    expect(res.body).toMatchObject({ total: 2, page: 1, limit: 30 });

    await request(app.getHttpServer())
      .get(`/reports/${report.reportNumber}/history`)
      .set('Authorization', auth(alice))
      .expect(403);
    await request(app.getHttpServer())
      .get('/reports/R-00000000-NOPE00/history')
      .set('Authorization', auth(filterUser))
      .expect(404);
    await request(app.getHttpServer())
      .get(`/reports/${report.reportNumber}/history?page=10001`)
      .set('Authorization', auth(filterUser))
      .expect(400);
  });

  it('GET /reports: фильтры status и type, неверное значение — 400', async () => {
    const other = await createReportAs(typeFilterUser, 'OTHER', 'Тип OTHER');
    const tech = await createReportAs(
      typeFilterUser,
      'TECHNICAL_ISSUE',
      'Тип TECHNICAL_ISSUE',
    );
    await prisma.report.update({
      where: { id: tech.id },
      data: { status: 'IN_REVIEW' },
    });
    const numbersOf = (body: { items: Array<{ reportNumber: string }> }) =>
      body.items.map((r) => r.reportNumber).sort();
    const get = (qs: string) =>
      request(app.getHttpServer())
        .get(`/reports${qs}`)
        .set('Authorization', auth(typeFilterUser));

    expect(numbersOf((await get('').expect(200)).body)).toEqual(
      [other.reportNumber, tech.reportNumber].sort(),
    );
    expect(
      numbersOf((await get('?status=IN_REVIEW').expect(200)).body),
    ).toEqual([tech.reportNumber]);
    expect(numbersOf((await get('?status=PENDING').expect(200)).body)).toEqual([
      other.reportNumber,
    ]);
    expect(numbersOf((await get('?type=OTHER').expect(200)).body)).toEqual([
      other.reportNumber,
    ]);
    const both = await get('?type=TECHNICAL_ISSUE&status=IN_REVIEW').expect(
      200,
    );
    expect(numbersOf(both.body)).toEqual([tech.reportNumber]);
    expect(both.body.total).toBe(1);
    expect(
      (await get('?type=OTHER&status=IN_REVIEW').expect(200)).body.total,
    ).toBe(0);
    await get('?status=NOPE').expect(400);
    await get('?type=NOPE').expect(400);
  });
});
