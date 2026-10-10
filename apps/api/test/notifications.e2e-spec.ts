import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';
import { EmailService } from '../src/modules/email/email.service';

// См. auth.e2e-spec.ts — риск конкуренции за ресурсы под полным сьютом; этот
// файл дополнительно поднимает реальный TCP-листенер для Socket.IO.
jest.setTimeout(20_000);

describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  let baseUrl: string;
  const unique = randomUUID().slice(0, 8);
  const cleanupRoleSlugs: string[] = [];

  interface TestUser {
    id: string;
    accessToken: string;
    username: string;
    email: string;
  }

  async function createUser(label: string): Promise<TestUser> {
    const email = `notif-${label}-${unique}@example.com`;
    const username = `notif${label}${unique}`
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

  function connectSocket(user: TestUser): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(`${baseUrl}/notifications`, {
        auth: { token: user.accessToken },
        transports: ['websocket'],
        forceNew: true,
      });
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });
  }

  function waitForEvent<T = unknown>(
    socket: Socket,
    event: string,
  ): Promise<T> {
    return new Promise((resolve) => {
      socket.once(event, (payload: T) => resolve(payload));
    });
  }

  let alice: TestUser;
  let bob: TestUser;
  let moderator: TestUser;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    await app.listen(0);

    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    prisma = app.get(PrismaService);
    permissions = app.get(PermissionService);

    alice = await createUser('alice');
    bob = await createUser('bob');
    moderator = await createUser('moderator');

    const role = await createRole(`notif-mod-${unique}`, 10);
    await grantRole(moderator.id, role.id);
    await grantPermissions(role.id, [
      'notifications.webhooks.view',
      'notifications.webhooks.create',
      'notifications.webhooks.edit',
      'notifications.webhooks.delete',
      'notifications.broadcast',
      'notifications.stats.view',
    ]);
  }, 30_000);

  afterAll(async () => {
    if (alice && bob && moderator) {
      await prisma.notification.deleteMany({
        where: { userId: { in: [alice.id, bob.id, moderator.id] } },
      });
      await prisma.discordWebhook.deleteMany({
        where: { createdBy: moderator.id },
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
        where: {
          actor: { email: { in: [alice.email, bob.email, moderator.email] } },
        },
      });
      await prisma.user.deleteMany({
        where: { email: { in: [alice.email, bob.email, moderator.email] } },
      });
    }
    await app.close();
  }, 15_000);

  const auth = (user: TestUser) => `Bearer ${user.accessToken}`;

  it('заявка в друзья создаёт FRIEND_REQUEST уведомление получателю', async () => {
    await request(app.getHttpServer())
      .post(`/friends/requests/${bob.username}`)
      .set('Authorization', auth(alice))
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', auth(bob))
      .expect(200);
    const notification = list.body.items.find(
      (n: { type: string; fromUserId: string }) =>
        n.type === 'FRIEND_REQUEST' && n.fromUserId === alice.id,
    );
    expect(notification).toBeDefined();

    const unread = await request(app.getHttpServer())
      .get('/notifications/unread-count')
      .set('Authorization', auth(bob))
      .expect(200);
    expect(unread.body.count).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .patch(`/notifications/${notification.id}/read`)
      .set('Authorization', auth(bob))
      .expect(200);

    await prisma.friendship.deleteMany({
      where: { requesterId: alice.id, addresseeId: bob.id },
    });
  });

  it('комментарий с упоминанием создаёт COMMENT_MENTION уведомление', async () => {
    await request(app.getHttpServer())
      .post(`/users/${bob.username}/comments`)
      .set('Authorization', auth(alice))
      .send({ content: `Привет @${bob.username}, смотри кто зашёл!` })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', auth(bob))
      .expect(200);
    const mention = list.body.items.find(
      (n: { type: string }) => n.type === 'COMMENT_MENTION',
    );
    expect(mention).toBeDefined();
  });

  it('typeSettings отключает создание уведомления конкретного типа', async () => {
    // Защита от остаточного состояния, если предыдущий тест упал до своего
    // cleanup — не полагаемся на порядок/успех соседних тестов.
    await prisma.friendship.deleteMany({
      where: { requesterId: alice.id, addresseeId: bob.id },
    });
    const before = await prisma.notification.count({
      where: { userId: bob.id, type: 'FRIEND_REQUEST' },
    });

    await request(app.getHttpServer())
      .patch('/notifications/settings/type/FRIEND_REQUEST')
      .set('Authorization', auth(bob))
      .send({ enabled: false })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/friends/requests/${bob.username}`)
      .set('Authorization', auth(alice))
      .expect(201);

    const after = await prisma.notification.count({
      where: { userId: bob.id, type: 'FRIEND_REQUEST' },
    });
    expect(after).toBe(before);

    await request(app.getHttpServer())
      .patch('/notifications/settings/type/FRIEND_REQUEST')
      .set('Authorization', auth(bob))
      .send({ enabled: true })
      .expect(200);
    await prisma.friendship.deleteMany({
      where: { requesterId: alice.id, addresseeId: bob.id },
    });
  });

  it('settings: get/update/reset', async () => {
    const got = await request(app.getHttpServer())
      .get('/notifications/settings')
      .set('Authorization', auth(alice))
      .expect(200);
    expect(got.body.emailEnabled).toBe(true);

    const updated = await request(app.getHttpServer())
      .patch('/notifications/settings')
      .set('Authorization', auth(alice))
      .send({
        emailEnabled: false,
        quietHoursEnabled: true,
        quietHoursStart: '23:00',
        quietHoursEnd: '07:00',
      })
      .expect(200);
    expect(updated.body.emailEnabled).toBe(false);
    expect(updated.body.quietHoursStart).toBe('23:00');

    const reset = await request(app.getHttpServer())
      .post('/notifications/settings/reset')
      .set('Authorization', auth(alice))
      .expect(201);
    expect(reset.body.emailEnabled).toBe(true);
    expect(reset.body.quietHoursEnabled).toBe(false);
  });

  it('push: vapid-key сообщает об отсутствии ключей в тестовом окружении, subscribe/unsubscribe работают', async () => {
    const vapid = await request(app.getHttpServer())
      .get('/notifications/push/vapid-key')
      .set('Authorization', auth(alice))
      .expect(200);
    expect(vapid.body.configured).toBe(false);
    expect(vapid.body.publicKey).toBeNull();

    const sub = await request(app.getHttpServer())
      .post('/notifications/push/subscribe')
      .set('Authorization', auth(alice))
      .send({
        endpoint: `https://push.example.com/${unique}`,
        keys: { p256dh: 'p256dh-test-key', auth: 'auth-test-key' },
      })
      .expect(201);
    expect(sub.body.endpoint).toBe(`https://push.example.com/${unique}`);

    await request(app.getHttpServer())
      .delete(`/notifications/push/subscribe/${sub.body.id}`)
      .set('Authorization', auth(alice))
      .expect(200);
  });

  it('push (ADR-0097): несколько устройств, отписка по endpoint, смена аккаунта на том же браузере', async () => {
    const subscribe = (user: TestUser, endpoint: string) =>
      request(app.getHttpServer())
        .post('/notifications/push/subscribe')
        .set('Authorization', auth(user))
        .send({
          endpoint,
          keys: { p256dh: 'p256dh-test-key', auth: 'auth-test-key' },
        })
        .expect(201);
    const pc = `https://push.example.com/pc-${unique}`;
    const laptop = `https://push.example.com/laptop-${unique}`;
    await subscribe(alice, pc);
    await subscribe(alice, laptop);
    const list = await request(app.getHttpServer())
      .get('/notifications/push/subscriptions')
      .set('Authorization', auth(alice))
      .expect(200);
    expect(list.body).toHaveLength(2);
    expect(JSON.stringify(list.body)).not.toContain('p256dh-test-key');

    // Вход другим аккаунтом в том же браузере: подписка переходит к нему,
    // прошлому пользователю push сюда больше не уходит.
    await subscribe(bob, pc);
    const aliceAfter = await request(app.getHttpServer())
      .get('/notifications/push/subscriptions')
      .set('Authorization', auth(alice))
      .expect(200);
    expect(aliceAfter.body).toHaveLength(1);

    // Выход из аккаунта: отписка этого браузера по endpoint.
    await request(app.getHttpServer())
      .post('/notifications/push/unsubscribe')
      .set('Authorization', auth(alice))
      .send({ endpoint: laptop })
      .expect(200);
    await request(app.getHttpServer())
      .post('/notifications/push/unsubscribe')
      .set('Authorization', auth(alice))
      .send({ endpoint: 'javascript:alert(1)' })
      .expect(400);
    const aliceEnd = await request(app.getHttpServer())
      .get('/notifications/push/subscriptions')
      .set('Authorization', auth(alice))
      .expect(200);
    expect(aliceEnd.body).toHaveLength(0);
    await request(app.getHttpServer())
      .post('/notifications/push/unsubscribe')
      .set('Authorization', auth(bob))
      .send({ endpoint: pc })
      .expect(200);
  });

  it('настройки: превью push и уведомления при открытом сайте', async () => {
    const updated = await request(app.getHttpServer())
      .patch('/notifications/settings')
      .set('Authorization', auth(alice))
      .send({ pushPreview: false, foregroundEnabled: false })
      .expect(200);
    expect(updated.body.pushPreview).toBe(false);
    expect(updated.body.foregroundEnabled).toBe(false);
    await request(app.getHttpServer())
      .patch('/notifications/settings')
      .set('Authorization', auth(alice))
      .send({ pushPreview: true, foregroundEnabled: true })
      .expect(200);
  });

  it('discord personal webhook: невалидный URL отклоняется, валидный сохраняется и удаляется', async () => {
    await request(app.getHttpServer())
      .post('/notifications/discord/webhook')
      .set('Authorization', auth(alice))
      .send({ url: 'https://evil.example.com/steal' })
      .expect(400);

    const saved = await request(app.getHttpServer())
      .post('/notifications/discord/webhook')
      .set('Authorization', auth(alice))
      .send({
        url: `https://discord.com/api/webhooks/123456789/${unique}-token`,
      })
      .expect(201);
    expect(saved.body.discordEnabled).toBe(true);
    // ADR-0110: токен вебхука в ответ не уходит — только маска.
    expect(JSON.stringify(saved.body)).not.toContain(`${unique}-token`);
    expect(saved.body.discordWebhookHint).toBe(
      'discord.com/api/webhooks/123456789/••••',
    );
    expect(saved.body.userId).toBeUndefined();

    // Отправка: без упоминаний (@everyone из чужого текста не пингует), без редиректов.
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const tested = await request(app.getHttpServer())
      .post('/notifications/discord/webhook/test')
      .set('Authorization', auth(alice))
      .expect(201);
    expect(tested.body.sent).toBe(true);
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toMatchObject({
      allowed_mentions: { parse: [] },
    });
    expect(init?.redirect).toBe('error');
    fetchSpy.mockRestore();

    await request(app.getHttpServer())
      .delete('/notifications/discord/webhook')
      .set('Authorization', auth(alice))
      .expect(200);
  });

  it('digest: без SMTP — честный 503; без непрочитанных не шлёт; с непрочитанными — шлёт с экранированием', async () => {
    const email = app.get(EmailService);
    const configured = jest
      .spyOn(email, 'configured', 'get')
      .mockReturnValue(false);
    await request(app.getHttpServer())
      .post('/notifications/digest/test')
      .set('Authorization', auth(alice))
      .expect(503)
      .expect((res) => expect(res.body.code).toBe('email_unavailable'));
    configured.mockReturnValue(true);
    const sendSpy = jest.spyOn(email, 'send').mockResolvedValue(undefined);
    await prisma.friendship.deleteMany({
      where: { requesterId: bob.id, addresseeId: alice.id },
    });
    await request(app.getHttpServer())
      .patch('/notifications/read-all')
      .set('Authorization', auth(alice))
      .expect(200);
    const emptyDigest = await request(app.getHttpServer())
      .post('/notifications/digest/test')
      .set('Authorization', auth(alice))
      .expect(201);
    expect(emptyDigest.body.sent).toBe(false);

    await request(app.getHttpServer())
      .post(`/friends/requests/${alice.username}`)
      .set('Authorization', auth(bob))
      .expect(201);

    const digest = await request(app.getHttpServer())
      .post('/notifications/digest/test')
      .set('Authorization', auth(alice))
      .expect(201);
    expect(digest.body.sent).toBe(true);
    expect(digest.body.count).toBeGreaterThan(0);

    // Пользовательский текст в письме — только экранированный.
    await prisma.notification.create({
      data: {
        userId: alice.id,
        type: 'SYSTEM',
        title: 'Тест <b>заголовка</b>',
        message: '<script>alert(1)</script>',
      },
    });
    sendSpy.mockClear();
    await request(app.getHttpServer())
      .post('/notifications/digest/test')
      .set('Authorization', auth(alice))
      .expect(201);
    const html = String(sendSpy.mock.calls[0]?.[0]?.html);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Тест &lt;b&gt;заголовка&lt;/b&gt;');
    configured.mockRestore();
    sendSpy.mockRestore();

    // Сводки по расписанию пока нет — такой режим не сохраняется (ADR-0110).
    await request(app.getHttpServer())
      .patch('/notifications/digest')
      .set('Authorization', auth(alice))
      .send({ digestMode: 'DAILY', digestTime: '09:00' })
      .expect(400);
    const instant = await request(app.getHttpServer())
      .patch('/notifications/digest')
      .set('Authorization', auth(alice))
      .send({ digestMode: 'INSTANT' })
      .expect(200);
    expect(instant.body.digestMode).toBe('INSTANT');

    await prisma.friendship.deleteMany({
      where: { requesterId: bob.id, addresseeId: alice.id },
    });
  });

  it('admin: webhooks CRUD требует permission, broadcast и stats доступны модератору', async () => {
    await request(app.getHttpServer())
      .post('/admin/notifications/webhooks')
      .set('Authorization', auth(alice))
      .send({
        name: 'Test',
        url: `https://discord.com/api/webhooks/1/${unique}`,
        eventTypes: ['ANNOUNCEMENT'],
      })
      .expect(403);

    const created = await request(app.getHttpServer())
      .post('/admin/notifications/webhooks')
      .set('Authorization', auth(moderator))
      .send({
        name: 'Community announcements',
        url: `https://discord.com/api/webhooks/1/${unique}`,
        eventTypes: ['MAINTENANCE'],
      })
      .expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/admin/notifications/webhooks/${created.body.id}`)
      .set('Authorization', auth(moderator))
      .send({ isActive: false })
      .expect(200);
    expect(updated.body.isActive).toBe(false);

    const broadcastRes = await request(app.getHttpServer())
      .post('/admin/notifications/broadcast')
      .set('Authorization', auth(moderator))
      .send({
        title: 'Технические работы',
        type: 'MAINTENANCE',
        userIds: [alice.id, bob.id],
      })
      .expect(201);
    expect(broadcastRes.body.count).toBe(2);

    const list = await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', auth(alice))
      .expect(200);
    expect(
      list.body.items.some((n: { type: string }) => n.type === 'MAINTENANCE'),
    ).toBe(true);

    const stats = await request(app.getHttpServer())
      .get('/admin/notifications/stats')
      .set('Authorization', auth(moderator))
      .expect(200);
    expect(stats.body.total).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .delete(`/admin/notifications/webhooks/${created.body.id}`)
      .set('Authorization', auth(moderator))
      .expect(200);
  });

  describe('WebSocket /notifications', () => {
    let aliceSocket: Socket;
    let bobSocket: Socket;

    afterEach(() => {
      aliceSocket?.disconnect();
      bobSocket?.disconnect();
    });

    it('без токена соединение разрывается', async () => {
      const socket = io(`${baseUrl}/notifications`, {
        transports: ['websocket'],
        forceNew: true,
      });
      await new Promise<void>((resolve) => {
        socket.once('disconnect', () => resolve());
        socket.once('connect_error', () => resolve());
      });
      socket.disconnect();
    });

    it('реальное событие (заявка в друзья) доходит до получателя в реальном времени', async () => {
      await prisma.friendship.deleteMany({
        where: { requesterId: alice.id, addresseeId: bob.id },
      });
      bobSocket = await connectSocket(bob);
      aliceSocket = await connectSocket(alice);

      const notificationPromise = waitForEvent<{
        type: string;
        fromUserId: string;
      }>(bobSocket, 'notification:new');
      await request(app.getHttpServer())
        .post(`/friends/requests/${bob.username}`)
        .set('Authorization', auth(alice))
        .expect(201);

      const notification = await notificationPromise;
      expect(notification.type).toBe('FRIEND_REQUEST');
      expect(notification.fromUserId).toBe(alice.id);

      await prisma.friendship.deleteMany({
        where: { requesterId: alice.id, addresseeId: bob.id },
      });
    });
  });
});
