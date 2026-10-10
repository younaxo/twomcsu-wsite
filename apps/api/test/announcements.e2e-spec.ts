import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { AnnouncementsService } from '../src/modules/communications/announcements.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';

jest.setTimeout(30_000);

/// ADR-0081: объявления — черновик → публикация → показ по месту, аудитории и
/// расписанию; уведомления — один раз. Рассылка уведомлений проверяется только
/// на аудитории-роли: параллельные наборы не получают чужих уведомлений.
describe('Announcements (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  let service: AnnouncementsService;
  const unique = randomUUID().slice(0, 8);
  const password = 'Sup3rSecretPassw0rd!';
  const userIds: string[] = [];
  const roleIds: string[] = [];
  const announcementIds: string[] = [];
  const http = () => request(app.getHttpServer());
  const base = '/admin/communications/announcements';

  async function createUser(label: string) {
    const email = `an-${label}-${unique}@example.com`;
    const username = `an${label}${unique}`.slice(0, 16);
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

  async function createRole(keys: string[]) {
    const slug = `an-${unique}-${roleIds.length}`;
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
    return role;
  }

  async function grant(userId: string, keys: string[]) {
    const role = await createRole(keys);
    await prisma.userRole.create({ data: { userId, roleId: role.id } });
    await permissions.invalidateUser(userId);
  }

  async function publicIds(placement: string, auth?: string) {
    const req = http().get('/site/announcements').query({ placement });
    if (auth) req.set('Authorization', auth);
    const res = await req.expect(200);
    return (res.body as Array<{ id: string }>).map((item) => item.id);
  }

  async function announcementsOf(auth: string, id: string) {
    const res = await http()
      .get('/notifications')
      .set('Authorization', auth)
      .expect(200);
    return (
      res.body.items as Array<{
        type: string;
        metadata: { announcementId?: string } | null;
      }>
    ).filter((item) => item.metadata?.announcementId === id);
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
    service = app.get(AnnouncementsService);
  });

  afterAll(async () => {
    await prisma.announcement.deleteMany({
      where: { id: { in: announcementIds } },
    });
    await prisma.notification.deleteMany({
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

  it('права, валидация, черновик → публикация → баннер и дашборд; снятие и удаление; аудит', async () => {
    const plain = await createUser('p');
    const viewer = await createUser('v');
    const manager = await createUser('m');
    await grant(viewer.id, ['announcements.view']);
    await grant(manager.id, ['announcements.view', 'announcements.manage']);
    const draft = {
      title: 'Обновление 1.21',
      message: 'Сервер обновлён до 1.21.',
      kind: 'update',
      link: '/news',
    };

    await http().get(base).set('Authorization', plain.auth).expect(403);
    await http().get(base).set('Authorization', viewer.auth).expect(200);
    await http()
      .post(base)
      .set('Authorization', viewer.auth)
      .send(draft)
      .expect(403);
    for (const bad of [
      { ...draft, kind: 'party' },
      { ...draft, link: 'javascript:alert(1)' },
      { ...draft, placements: ['popup'] },
      { ...draft, audience: 'role' },
      { ...draft, audience: 'role', targetRole: `missing-${unique}` },
      {
        ...draft,
        showFrom: '2030-01-02T00:00:00Z',
        showUntil: '2030-01-01T00:00:00Z',
      },
    ]) {
      await http()
        .post(base)
        .set('Authorization', manager.auth)
        .send(bad)
        .expect(400);
    }

    const created = await http()
      .post(base)
      .set('Authorization', manager.auth)
      .send(draft)
      .expect(201);
    const id = created.body.id as string;
    announcementIds.push(id);
    expect(created.body).toMatchObject({
      status: 'draft',
      kind: 'update',
      placements: [],
    });
    expect(await publicIds('banner')).not.toContain(id);
    // Без мест показа опубликовать нельзя.
    await http()
      .post(`${base}/${id}/publish`)
      .set('Authorization', manager.auth)
      .expect(400);

    await http()
      .patch(`${base}/${id}`)
      .set('Authorization', manager.auth)
      .send({ ...draft, placements: ['banner', 'dashboard'] })
      .expect(200);
    const published = await http()
      .post(`${base}/${id}/publish`)
      .set('Authorization', manager.auth)
      .expect(200);
    expect(published.body.status).toBe('active');
    expect(await publicIds('banner')).toContain(id);
    expect(await publicIds('dashboard', plain.auth)).toContain(id);

    // Опубликованное нельзя удалить; снятое — можно.
    await http()
      .delete(`${base}/${id}`)
      .set('Authorization', manager.auth)
      .expect(409);
    const unpublished = await http()
      .post(`${base}/${id}/unpublish`)
      .set('Authorization', manager.auth)
      .expect(200);
    expect(unpublished.body.status).toBe('unpublished');
    expect(await publicIds('banner')).not.toContain(id);
    await http()
      .delete(`${base}/${id}`)
      .set('Authorization', manager.auth)
      .expect(200);

    const actions = (
      await prisma.auditLog.findMany({
        where: { actorId: manager.id, targetId: id },
        select: { action: true },
      })
    ).map((row) => row.action);
    expect(actions.sort()).toEqual(
      [
        'announcements.create',
        'announcements.delete',
        'announcements.publish',
        'announcements.unpublish',
        'announcements.update',
      ].sort(),
    );
    const update = await prisma.auditLog.findFirst({
      where: { targetId: id, action: 'announcements.update' },
    });
    expect(update?.changes).toEqual({
      placements: { from: [], to: ['banner', 'dashboard'] },
    });
  });

  it('аудитория и расписание; уведомления — один раз и только при наступлении начала', async () => {
    const manager = await createUser('rm');
    const member = await createUser('rr');
    const outsider = await createUser('ro');
    await grant(manager.id, ['announcements.view', 'announcements.manage']);
    const audienceRole = await createRole([]);
    await prisma.userRole.create({
      data: { userId: member.id, roleId: audienceRole.id },
    });

    // Только для вошедших.
    const forUsers = await http()
      .post(base)
      .set('Authorization', manager.auth)
      .send({
        title: 'Для игроков',
        message: 'Видно только после входа.',
        kind: 'info',
        audience: 'users',
        placements: ['banner'],
      })
      .expect(201);
    announcementIds.push(forUsers.body.id);
    await http()
      .post(`${base}/${forUsers.body.id}/publish`)
      .set('Authorization', manager.auth)
      .expect(200);
    expect(await publicIds('banner')).not.toContain(forUsers.body.id);
    expect(await publicIds('banner', outsider.auth)).toContain(
      forUsers.body.id,
    );

    // Для роли, запланировано на будущее, с уведомлениями.
    const scheduled = await http()
      .post(base)
      .set('Authorization', manager.auth)
      .send({
        title: 'Технические работы',
        message: 'Завтра с 03:00 до 04:00.',
        kind: 'maintenance',
        audience: 'role',
        targetRole: audienceRole.name,
        placements: ['banner', 'notifications'],
        showFrom: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .expect(201);
    const id = scheduled.body.id as string;
    announcementIds.push(id);
    const published = await http()
      .post(`${base}/${id}/publish`)
      .set('Authorization', manager.auth)
      .expect(200);
    expect(published.body).toMatchObject({
      status: 'scheduled',
      notifiedAt: null,
    });
    expect(await publicIds('banner', member.auth)).not.toContain(id);
    expect(await announcementsOf(member.auth, id)).toHaveLength(0);

    // Начало наступило — фоновый обработчик рассылает уведомления.
    await prisma.announcement.update({
      where: { id },
      data: { showFrom: new Date(Date.now() - 1_000) },
    });
    await service.dispatchDue();
    const delivered = await announcementsOf(member.auth, id);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.type).toBe('MAINTENANCE');
    expect(await announcementsOf(outsider.auth, id)).toHaveLength(0);
    expect(await publicIds('banner', member.auth)).toContain(id);
    expect(await publicIds('banner', outsider.auth)).not.toContain(id);

    // Повторная публикация и повторный проход обработчика — без дублей.
    await http()
      .post(`${base}/${id}/unpublish`)
      .set('Authorization', manager.auth)
      .expect(200);
    await http()
      .post(`${base}/${id}/publish`)
      .set('Authorization', manager.auth)
      .expect(200);
    await service.dispatchDue();
    expect(await announcementsOf(member.auth, id)).toHaveLength(1);
  });
});
