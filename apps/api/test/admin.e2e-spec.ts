import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { RedisService } from '../src/modules/redis/redis.service';
import { PermissionService } from '../src/modules/roles/permission.service';

jest.setTimeout(20_000);

describe('Admin backend (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  let redis: RedisService;
  const unique = randomUUID().slice(0, 8);
  const cleanupRoleSlugs: string[] = [];

  interface TestUser {
    id: string;
    accessToken: string;
    username: string;
    email: string;
  }

  async function createUser(label: string): Promise<TestUser> {
    const email = `ab-${label}-${unique}@example.com`;
    const username = `ab${label}${unique}`
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
  let audienceRoleName: string;

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

    admin = await createUser('admin');
    alice = await createUser('alice');
    bob = await createUser('bob');

    const adminRole = await createRole(`admin-backend-${unique}`, 50);
    await grantRole(admin.id, adminRole.id);

    // Отдельная безобидная роль-метка (без permissions) — чтобы broadcast
    // с targetRole бил только по alice/bob, не по всем пользователям БД
    // (параллельно идут другие e2e-сьюты на той же базе).
    const audienceRole = await createRole(`broadcast-audience-${unique}`, 1);
    audienceRoleName = audienceRole.name;
    await grantRole(alice.id, audienceRole.id);
    await grantRole(bob.id, audienceRole.id);

    await grantPermissions(adminRole.id, [
      'dashboard.view',
      'audit_log.view',
      'audit_log.stats',
      'audit_log.export',
      'broadcast.create',
      'settings.view',
      'settings.edit',
      'settings.site.view',
      'settings.site.edit',
      'saved_filters.view',
      'saved_filters.create',
      'saved_filters.edit',
      'saved_filters.delete',
      'bookmarks.view',
      'bookmarks.create',
      'bookmarks.edit',
      'bookmarks.delete',
      'bookmarks.reorder',
      'exports.scheduled.view',
      'exports.scheduled.create',
      'exports.scheduled.edit',
      'exports.scheduled.delete',
      'security.sessions.view',
      'security.suspicious.view',
      'security.logins.view',
      'security.ip_whitelist.create',
      'content.view',
      'finance.overview.view',
      'finance.transactions.view',
      'finance.refunds.view',
      'finance.export',
      'users.bulk.edit',
      'users.export',
      'orders.export',
      'reports.export',
      'news.export',
    ]);
  }, 30_000);

  afterAll(async () => {
    await prisma.savedFilter.deleteMany({ where: { userId: admin.id } });
    await prisma.adminBookmark.deleteMany({ where: { userId: admin.id } });
    await prisma.scheduledExport.deleteMany({ where: { userId: admin.id } });
    await prisma.auditLog.deleteMany({ where: { actorId: admin.id } });
    await prisma.announcement.deleteMany({ where: { createdBy: admin.id } });
    await prisma.notification.deleteMany({
      where: { userId: { in: [alice.id, bob.id] }, type: 'ANNOUNCEMENT' },
    });
    await prisma.userPunishment.deleteMany({
      where: { userId: bob.id, issuedBy: admin.id },
    });
    await prisma.userRole.deleteMany({
      where: { role: { slug: { in: cleanupRoleSlugs } } },
    });
    await prisma.rolePermission.deleteMany({
      where: { role: { slug: { in: cleanupRoleSlugs } } },
    });
    await prisma.role.deleteMany({ where: { slug: { in: cleanupRoleSlugs } } });
    await prisma.user.deleteMany({
      where: { email: { in: [admin.email, alice.email, bob.email] } },
    });
    await app.close();
  }, 20_000);

  it('без нужного permission доступ к admin-эндпоинтам запрещён (403)', async () => {
    await request(app.getHttpServer())
      .get('/admin/dashboard')
      .set('Authorization', auth(alice))
      .expect(403);
    await request(app.getHttpServer())
      .get('/admin/audit-log')
      .set('Authorization', auth(alice))
      .expect(403);
    await request(app.getHttpServer())
      .post('/admin/broadcast')
      .set('Authorization', auth(alice))
      .send({ title: 'x', message: 'y' })
      .expect(403);
    await request(app.getHttpServer())
      .patch('/admin/users/bulk')
      .set('Authorization', auth(alice))
      .send({ userIds: [bob.id], action: 'BAN' })
      .expect(403);
  });

  it('dashboard: возвращает реальные агрегаты по пользователям и модерации', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/dashboard')
      .set('Authorization', auth(admin))
      .expect(200);
    expect(res.body.users.total).toBeGreaterThanOrEqual(3);
    expect(typeof res.body.users.online).toBe('number');
    expect(typeof res.body.moderation.pendingReports).toBe('number');
    expect(Array.isArray(res.body.recentAuditLog)).toBe(true);
  });

  it('settings (KV): PATCH сохраняет, GET возвращает актуальные значения', async () => {
    const key = `e2e-flag-${unique}`;
    await request(app.getHttpServer())
      .patch('/admin/settings')
      .set('Authorization', auth(admin))
      .send({ settings: { [key]: 'on' } })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/admin/settings')
      .set('Authorization', auth(admin))
      .expect(200);
    expect(res.body[key]).toBe('on');
  });

  it('settings/site: singleton создаётся по первому GET, PATCH пишет audit-лог с diff', async () => {
    const before = await request(app.getHttpServer())
      .get('/admin/settings/site')
      .set('Authorization', auth(admin))
      .expect(200);
    expect(before.body.id).toBeTruthy();

    const newName = `TWOMC-e2e-${unique}`;
    await request(app.getHttpServer())
      .patch('/admin/settings/site')
      .set('Authorization', auth(admin))
      .send({ siteName: newName })
      .expect(200);

    const after = await request(app.getHttpServer())
      .get('/admin/settings/site')
      .set('Authorization', auth(admin))
      .expect(200);
    expect(after.body.siteName).toBe(newName);

    const logs = await prisma.auditLog.findMany({
      where: { actorId: admin.id, action: 'settings.site.update' },
    });
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it('broadcast: создаёт Announcement и доставляет уведомления целевым пользователям', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/broadcast')
      .set('Authorization', auth(admin))
      .send({
        title: `E2E ${unique}`,
        message: 'Проверка рассылки',
        targetRole: audienceRoleName,
      })
      .expect(201);
    expect(res.body.usersTargeted).toBe(2);
    expect(res.body.delivered).toBe(2);

    const notification = await prisma.notification.findFirst({
      where: { userId: alice.id, type: 'ANNOUNCEMENT', title: `E2E ${unique}` },
    });
    expect(notification).not.toBeNull();
  });

  it('audit-log: GET возвращает записи, stats — ненулевую сводку', async () => {
    const list = await request(app.getHttpServer())
      .get('/admin/audit-log')
      .query({ actorId: admin.id })
      .set('Authorization', auth(admin))
      .expect(200);
    expect(list.body.total).toBeGreaterThanOrEqual(1);

    const stats = await request(app.getHttpServer())
      .get('/admin/audit-log/stats')
      .set('Authorization', auth(admin))
      .expect(200);
    expect(stats.body.total).toBeGreaterThanOrEqual(1);
    expect(typeof stats.body.bySeverity).toBe('object');
  });

  let savedFilterId: string;

  it('saved-filters: CRUD + изоляция по владельцу', async () => {
    const created = await request(app.getHttpServer())
      .post('/admin/saved-filters')
      .set('Authorization', auth(admin))
      .send({
        name: 'Забаненные',
        page: 'users',
        filters: { isBanned: true },
      })
      .expect(201);
    savedFilterId = created.body.id;

    const list = await request(app.getHttpServer())
      .get('/admin/saved-filters')
      .query({ page: 'users' })
      .set('Authorization', auth(admin))
      .expect(200);
    expect(list.body.some((f: { id: string }) => f.id === savedFilterId)).toBe(
      true,
    );

    await request(app.getHttpServer())
      .patch(`/admin/saved-filters/${savedFilterId}`)
      .set('Authorization', auth(admin))
      .send({ name: 'Забаненные (обновлено)' })
      .expect(200);

    // bob не имеет permission вообще — ожидаем 403 раньше проверки владения.
    await request(app.getHttpServer())
      .delete(`/admin/saved-filters/${savedFilterId}`)
      .set('Authorization', auth(bob))
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/admin/saved-filters/${savedFilterId}`)
      .set('Authorization', auth(admin))
      .expect(200);
  });

  let bookmarkId: string;
  let bookmarkId2: string;

  it('bookmarks: CRUD + reorder', async () => {
    const b1 = await request(app.getHttpServer())
      .post('/admin/bookmarks')
      .set('Authorization', auth(admin))
      .send({ url: '/admin/store/products', title: 'Товары' })
      .expect(201);
    bookmarkId = b1.body.id;

    const b2 = await request(app.getHttpServer())
      .post('/admin/bookmarks')
      .set('Authorization', auth(admin))
      .send({ url: '/admin/users', title: 'Пользователи' })
      .expect(201);
    bookmarkId2 = b2.body.id;

    const reordered = await request(app.getHttpServer())
      .post('/admin/bookmarks/reorder')
      .set('Authorization', auth(admin))
      .send({ ids: [bookmarkId2, bookmarkId] })
      .expect(201);
    expect(reordered.body[0].id).toBe(bookmarkId2);
    expect(reordered.body[0].order).toBe(0);

    await request(app.getHttpServer())
      .delete(`/admin/bookmarks/${bookmarkId}`)
      .set('Authorization', auth(admin))
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/admin/bookmarks/${bookmarkId2}`)
      .set('Authorization', auth(admin))
      .expect(200);
  });

  it('scheduled-exports: CRUD (хранение, без выполнения по расписанию — PHASE 29)', async () => {
    const created = await request(app.getHttpServer())
      .post('/admin/exports/scheduled')
      .set('Authorization', auth(admin))
      .send({
        name: 'Еженедельный экспорт пользователей',
        page: 'users',
        format: 'csv',
        schedule: '0 4 * * 1',
      })
      .expect(201);
    const id = created.body.id;
    expect(created.body.isActive).toBe(true);

    await request(app.getHttpServer())
      .patch(`/admin/exports/scheduled/${id}`)
      .set('Authorization', auth(admin))
      .send({ isActive: false })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/admin/exports/scheduled/${id}`)
      .set('Authorization', auth(admin))
      .expect(200);
  });

  it('security/sessions и /security/logins: реальные RefreshToken текущих пользователей', async () => {
    const sessions = await request(app.getHttpServer())
      .get('/admin/security/sessions')
      .query({ userId: admin.id })
      .set('Authorization', auth(admin))
      .expect(200);
    expect(sessions.body.length).toBeGreaterThanOrEqual(1);

    const logins = await request(app.getHttpServer())
      .get('/admin/security/logins')
      .query({ userId: admin.id })
      .set('Authorization', auth(admin))
      .expect(200);
    expect(logins.body.length).toBeGreaterThanOrEqual(1);
  });

  it('security/suspicious: читает реальное состояние brute-force из Redis (без реальной блокировки 127.0.0.1)', async () => {
    const fakeIp = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    await redis.client.set(`bruteforce:login:${fakeIp}`, '5', 'EX', 60);
    await redis.client.set(`bruteforce:blocked:${fakeIp}`, '1', 'EX', 60);

    const res = await request(app.getHttpServer())
      .get('/admin/security/suspicious')
      .set('Authorization', auth(admin))
      .expect(200);
    const entry = res.body.find((e: { ip: string }) => e.ip === fakeIp);
    expect(entry).toBeTruthy();
    expect(entry.isBlocked).toBe(true);
    expect(entry.failedAttempts).toBe(5);

    await redis.client.del(
      `bruteforce:login:${fakeIp}`,
      `bruteforce:blocked:${fakeIp}`,
    );
  });

  it('security/ip-whitelist: обновляет singleton SiteSettings', async () => {
    await request(app.getHttpServer())
      .post('/admin/security/ip-whitelist')
      .set('Authorization', auth(admin))
      .send({ ips: ['127.0.0.1', '203.0.113.5'] })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/admin/settings/site')
      .set('Authorization', auth(admin))
      .expect(200);
    expect(res.body.ipWhitelist).toEqual(['127.0.0.1', '203.0.113.5']);
  });

  it('content/dashboard и finance/*: реальные агрегаты по News/Form/Order', async () => {
    const content = await request(app.getHttpServer())
      .get('/admin/content/dashboard')
      .set('Authorization', auth(admin))
      .expect(200);
    expect(typeof content.body.news).toBe('object');
    expect(typeof content.body.totalUsers).toBe('number');

    const overview = await request(app.getHttpServer())
      .get('/admin/finance/overview')
      .set('Authorization', auth(admin))
      .expect(200);
    expect(overview.body.overview).toBeDefined();
    expect(overview.body.overview.totalOrders).toBeDefined();

    const transactions = await request(app.getHttpServer())
      .get('/admin/finance/transactions')
      .set('Authorization', auth(admin))
      .expect(200);
    expect(Array.isArray(transactions.body.items)).toBe(true);

    const refunds = await request(app.getHttpServer())
      .get('/admin/finance/refunds')
      .set('Authorization', auth(admin))
      .expect(200);
    expect(Array.isArray(refunds.body.items)).toBe(true);
  });

  it('export: 5 CSV-эндпоинтов отдают text/csv с заголовком', async () => {
    const endpoints: [string, Record<string, unknown>][] = [
      ['/admin/users/export', {}],
      ['/admin/orders/export', {}],
      ['/admin/reports/export', {}],
      ['/admin/news/export', {}],
      ['/admin/audit-log/export', {}],
    ];
    for (const [url, body] of endpoints) {
      const res = await request(app.getHttpServer())
        .post(url)
        .set('Authorization', auth(admin))
        .send(body)
        .expect(201);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text.split('\r\n')[0].length).toBeGreaterThan(0);
    }
  });

  it('finance/export: делегирует в тот же ExportService.exportOrders', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/finance/export')
      .set('Authorization', auth(admin))
      .send({})
      .expect(201);
    expect(res.headers['content-type']).toContain('text/csv');
  });

  it('users/bulk: BAN/UNBAN с priority-проверкой и audit-логом на каждого пользователя', async () => {
    // Самого себя (тот же priority) — canActOn должен отклонить, не 500.
    const selfBan = await request(app.getHttpServer())
      .patch('/admin/users/bulk')
      .set('Authorization', auth(admin))
      .send({ userIds: [admin.id], action: 'BAN', reason: 'test' })
      .expect(200);
    expect(selfBan.body.failed).toHaveLength(1);
    expect(selfBan.body.succeeded).toHaveLength(0);

    const ban = await request(app.getHttpServer())
      .patch('/admin/users/bulk')
      .set('Authorization', auth(admin))
      .send({ userIds: [bob.id], action: 'BAN', reason: 'Массовый тест' })
      .expect(200);
    expect(ban.body.succeeded).toEqual([bob.id]);

    const bannedBob = await prisma.user.findUniqueOrThrow({
      where: { id: bob.id },
    });
    expect(bannedBob.isBanned).toBe(true);

    const banLog = await prisma.auditLog.findFirst({
      where: { actorId: admin.id, action: 'user.ban', targetId: bob.id },
    });
    expect(banLog).not.toBeNull();

    const unban = await request(app.getHttpServer())
      .patch('/admin/users/bulk')
      .set('Authorization', auth(admin))
      .send({ userIds: [bob.id], action: 'UNBAN' })
      .expect(200);
    expect(unban.body.succeeded).toEqual([bob.id]);

    const unbannedBob = await prisma.user.findUniqueOrThrow({
      where: { id: bob.id },
    });
    expect(unbannedBob.isBanned).toBe(false);
  });
});
