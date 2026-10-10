import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';

jest.setTimeout(30_000);

/// ADR-0080: системные сообщения от имени twomc.su — личные и массовые.
/// Лимиты маршрутов (send 20/мин, bulk 3/мин) — тест укладывается в них.
describe('Communications: system messages (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  const unique = randomUUID().slice(0, 8);
  const password = 'Sup3rSecretPassw0rd!';
  const userIds: string[] = [];
  const roleIds: string[] = [];
  const http = () => request(app.getHttpServer());

  async function createUser(label: string) {
    const email = `cm-${label}-${unique}@example.com`;
    const username = `cm${label}${unique}`.slice(0, 16);
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
    return {
      id: user.id,
      username,
      auth: `Bearer ${login.body.accessToken}`,
    };
  }

  async function createRole(keys: string[]) {
    const slug = `cm-${unique}-${roleIds.length}`;
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
    return role.id;
  }

  async function grant(userId: string, keys: string[]) {
    const roleId = await createRole(keys);
    await prisma.userRole.create({ data: { userId, roleId } });
    await permissions.invalidateUser(userId);
  }

  async function systemMessages(auth: string) {
    const list = await http()
      .get('/notifications')
      .query({ type: 'system' })
      .set('Authorization', auth)
      .expect(200);
    // Фильтр «От twomc.su» отдаёт только системные сообщения.
    expect(
      (list.body.items as Array<{ type: string }>).every(
        (item) => item.type === 'SYSTEM',
      ),
    ).toBe(true);
    return (
      list.body.items as Array<{
        type: string;
        title: string;
        message: string;
        priority: string;
        metadata: { sender?: string } | null;
        fromUser: unknown;
      }>
    ).filter((item) => item.type === 'SYSTEM');
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
  });

  afterAll(async () => {
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

  it('личное сообщение: права, поиск, валидация, защищённый отправитель, доставка вопреки настройкам, аудит', async () => {
    const plain = await createUser('p');
    const sender = await createUser('s');
    const target = await createUser('t');
    const banned = await createUser('b');
    await prisma.user.update({
      where: { id: banned.id },
      data: { isBanned: true },
    });
    await grant(sender.id, ['communications.messages.send']);
    // Получатель отключил системные уведомления — сообщение сайта всё равно доходит.
    await prisma.notificationSettings.upsert({
      where: { userId: target.id },
      create: { userId: target.id, typeSettings: { SYSTEM: false } },
      update: { typeSettings: { SYSTEM: false } },
    });

    const body = {
      userId: target.id,
      title: 'Проверка аккаунта',
      message: 'Здравствуйте! Это сообщение от администрации twomc.su.',
      link: '/account',
    };
    await http()
      .post('/admin/communications/messages')
      .set('Authorization', plain.auth)
      .send(body)
      .expect(403);

    const found = await http()
      .get('/admin/communications/recipients')
      .query({ q: target.username })
      .set('Authorization', sender.auth)
      .expect(200);
    expect(found.body).toEqual([
      expect.objectContaining({ id: target.id, username: target.username }),
    ]);
    const bannedSearch = await http()
      .get('/admin/communications/recipients')
      .query({ q: banned.username })
      .set('Authorization', sender.auth)
      .expect(200);
    expect(bannedSearch.body).toEqual([]);

    for (const bad of [
      { ...body, link: 'javascript:alert(1)' },
      { ...body, link: '//evil.example' },
      { ...body, title: '' },
      { ...body, message: 'x'.repeat(2001) },
    ]) {
      await http()
        .post('/admin/communications/messages')
        .set('Authorization', sender.auth)
        .send(bad)
        .expect(400);
    }
    await http()
      .post('/admin/communications/messages')
      .set('Authorization', sender.auth)
      .send({ ...body, userId: banned.id })
      .expect(404);

    const sent = await http()
      .post('/admin/communications/messages')
      .set('Authorization', sender.auth)
      .send(body)
      .expect(201);
    expect(sent.body.id).toEqual(expect.any(String));

    const inbox = await systemMessages(target.auth);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({
      title: body.title,
      message: body.message,
      priority: 'HIGH',
      metadata: { sender: 'system' },
      fromUser: null,
    });

    const audit = await prisma.auditLog.findFirst({
      where: { actorId: sender.id, action: 'communications.message.send' },
    });
    expect(audit).toMatchObject({ targetType: 'User', targetId: target.id });
    expect(audit?.changes).toMatchObject({
      title: body.title,
      messageLength: body.message.length,
    });
    // Полный текст сообщения в аудит не пишется.
    expect(JSON.stringify(audit?.changes)).not.toContain(body.message);
  });

  it('массовая рассылка: отдельное право, предпросмотр, подтверждение числа, роль, аудит', async () => {
    const sender = await createUser('ms');
    const bulker = await createUser('mb');
    const a = await createUser('ma');
    const b = await createUser('mc');
    await grant(sender.id, ['communications.messages.send']);
    await grant(bulker.id, ['communications.messages.bulk']);
    const audienceRole = await createRole([]);
    await prisma.userRole.createMany({
      data: [a.id, b.id].map((userId) => ({ userId, roleId: audienceRole })),
    });

    // Право массовой рассылки само по себе даёт поиск получателей.
    const search = await http()
      .get('/admin/communications/recipients')
      .query({ q: a.username })
      .set('Authorization', bulker.auth)
      .expect(200);
    expect(search.body.map((item: { id: string }) => item.id)).toEqual([a.id]);
    await http()
      .get('/admin/communications/recipients')
      .set('Authorization', a.auth)
      .expect(403);

    const users = { kind: 'users', userIds: [a.id, b.id] };
    await http()
      .post('/admin/communications/messages/bulk/preview')
      .set('Authorization', sender.auth)
      .send({ audience: users })
      .expect(403);
    await http()
      .post('/admin/communications/messages/bulk/preview')
      .set('Authorization', bulker.auth)
      .send({ audience: { kind: 'role' } })
      .expect(400);
    const preview = await http()
      .post('/admin/communications/messages/bulk/preview')
      .set('Authorization', bulker.auth)
      .send({ audience: users })
      .expect(200);
    expect(preview.body).toEqual({ recipients: 2 });
    const all = await http()
      .post('/admin/communications/messages/bulk/preview')
      .set('Authorization', bulker.auth)
      .send({ audience: { kind: 'all' } })
      .expect(200);
    expect(all.body.recipients).toBeGreaterThanOrEqual(4);

    const content = {
      title: 'Обновление сервера',
      message: 'Сегодня в 20:00 — обновление.',
    };
    await http()
      .post('/admin/communications/messages/bulk')
      .set('Authorization', bulker.auth)
      .send({ ...content, audience: users, confirmCount: 3 })
      .expect(409);
    const sent = await http()
      .post('/admin/communications/messages/bulk')
      .set('Authorization', bulker.auth)
      .send({ ...content, audience: users, confirmCount: 2 })
      .expect(201);
    expect(sent.body).toEqual({ recipients: 2, delivered: 2 });
    const byRole = await http()
      .post('/admin/communications/messages/bulk')
      .set('Authorization', bulker.auth)
      .send({
        ...content,
        audience: { kind: 'role', roleId: audienceRole },
        confirmCount: 2,
      })
      .expect(201);
    expect(byRole.body).toEqual({ recipients: 2, delivered: 2 });

    expect(await systemMessages(a.auth)).toHaveLength(2);
    expect(await systemMessages(b.auth)).toHaveLength(2);
    const audits = await prisma.auditLog.findMany({
      where: { actorId: bulker.id, action: 'communications.message.bulk' },
    });
    expect(audits).toHaveLength(2);
    expect(audits.every((row) => row.severity === 'warning')).toBe(true);
    expect(audits.map((row) => row.targetType).sort()).toEqual([
      'Audience',
      'Role',
    ]);
  });
});
