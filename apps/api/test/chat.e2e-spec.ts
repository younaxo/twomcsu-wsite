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
import { RedisService } from '../src/modules/redis/redis.service';
import { SiteStatusService } from '../src/modules/system/site-status.service';

// См. auth.e2e-spec.ts — риск конкуренции за ресурсы под полным сьютом; этот
// файл дополнительно поднимает реальный TCP-листенер для Socket.IO.
jest.setTimeout(20_000);

describe('Chat (e2e)', () => {
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
    const email = `chat-${label}-${unique}@example.com`;
    const username = `chat${label}${unique}`
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
      const socket = io(`${baseUrl}/chat`, {
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

  function waitForMatching<T extends Record<string, unknown>>(
    socket: Socket,
    event: string,
    predicate: (payload: T) => boolean,
  ): Promise<T> {
    return new Promise((resolve) => {
      const handler = (payload: T) => {
        if (predicate(payload)) {
          socket.off(event, handler);
          resolve(payload);
        }
      };
      socket.on(event, handler);
    });
  }

  async function joinChannel(
    socket: Socket,
    userId: string,
    channelId: string,
  ): Promise<void> {
    const joined = waitForMatching<{ userId: string }>(
      socket,
      'user:online',
      (p) => p.userId === userId,
    );
    socket.emit('join_channel', { channelId });
    await joined;
  }

  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;
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
    carol = await createUser('carol');
    moderator = await createUser('moderator');

    const role = await createRole(`chat-mod-${unique}`, 10);
    await grantRole(moderator.id, role.id);
    await grantPermissions(role.id, [
      'chat.channels.create',
      'chat.channels.edit',
      'chat.channels.delete',
      'chat.mutes.view',
      'chat.mutes.create',
      'chat.mutes.delete',
      'chat.bans.view',
      'chat.bans.create',
      'chat.bans.delete',
      'chat.messages.delete',
      'chat.messages.pin',
      'chat.messages.view',
      'chat.messages.search.view',
    ]);
  }, 30_000);

  afterAll(async () => {
    if (alice && bob && carol && moderator) {
      await prisma.chatMessage.deleteMany({
        where: { channel: { slug: { startsWith: `e2e-${unique}` } } },
      });
      await prisma.chatMute.deleteMany({
        where: { userId: { in: [alice.id, bob.id, carol.id] } },
      });
      await prisma.chatBan.deleteMany({
        where: { userId: { in: [alice.id, bob.id, carol.id] } },
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
      await prisma.role.deleteMany({
        where: { slug: { in: cleanupRoleSlugs } },
      });
      await prisma.auditLog.deleteMany({
        where: {
          actor: {
            email: {
              in: [alice.email, bob.email, carol.email, moderator.email],
            },
          },
        },
      });
      await prisma.user.deleteMany({
        where: {
          email: { in: [alice.email, bob.email, carol.email, moderator.email] },
        },
      });
    }
    await app.close();
  }, 15_000);

  const auth = (user: TestUser) => `Bearer ${user.accessToken}`;
  const slug = `e2e-${unique}-general`;
  let channelId: string;

  it('REST admin: создание канала требует chat.channels.create', async () => {
    await request(app.getHttpServer())
      .post('/admin/chat/channels')
      .set('Authorization', auth(alice))
      .send({ slug, name: 'E2E General', type: 'GENERAL' })
      .expect(403);

    const res = await request(app.getHttpServer())
      .post('/admin/chat/channels')
      .set('Authorization', auth(moderator))
      .send({ slug, name: 'E2E General', type: 'GENERAL' })
      .expect(201);
    channelId = res.body.id;
    expect(res.body.slug).toBe(slug);

    await request(app.getHttpServer())
      .patch(`/admin/chat/channels/${channelId}`)
      .set('Authorization', auth(bob))
      .send({ name: 'Hacked' })
      .expect(403);
  });

  it('REST public: список/получение канала, пустая история/онлайн/закреплённые', async () => {
    const list = await request(app.getHttpServer())
      .get('/chat/channels')
      .expect(200);
    expect(list.body.some((c: { id: string }) => c.id === channelId)).toBe(
      true,
    );

    const got = await request(app.getHttpServer())
      .get(`/chat/channels/${slug}`)
      .expect(200);
    expect(got.body.id).toBe(channelId);

    const messages = await request(app.getHttpServer())
      .get(`/chat/channels/${slug}/messages`)
      .expect(200);
    expect(messages.body.items).toEqual([]);

    const online = await request(app.getHttpServer())
      .get(`/chat/channels/${slug}/online`)
      .expect(200);
    expect(online.body.count).toBe(0);

    const pinned = await request(app.getHttpServer())
      .get(`/chat/channels/${slug}/pinned`)
      .expect(200);
    expect(pinned.body).toEqual([]);
  });

  it('несуществующий канал -> 404', async () => {
    await request(app.getHttpServer())
      .get(`/chat/channels/no-such-${unique}`)
      .expect(404);
  });

  describe('WebSocket /chat', () => {
    let aliceSocket: Socket;
    let bobSocket: Socket;
    let moderatorSocket: Socket;
    let carolSocket: Socket;

    afterEach(() => {
      aliceSocket?.disconnect();
      bobSocket?.disconnect();
      moderatorSocket?.disconnect();
      carolSocket?.disconnect();
    });

    it('ADR-0113: выключенный модуль «Чат» — WS-подключение отклоняется', async () => {
      const status = app.get(SiteStatusService);
      const spy = jest
        .spyOn(status, 'unavailable')
        .mockImplementation(async (key: string) =>
          key === 'chat' ? 'MODULE_DISABLED' : null,
        );
      try {
        await expect(connectSocket(alice)).rejects.toThrow();
      } finally {
        spy.mockRestore();
      }
      aliceSocket = await connectSocket(alice);
      expect(aliceSocket.connected).toBe(true);
    });

    it('ADR-0113: send_message отвечает ack; больше 5 сообщений за 10 с — отказ', async () => {
      const redis = app.get(RedisService);
      await redis.client.del(`chat:rate:${alice.id}`);
      aliceSocket = await connectSocket(alice);
      await joinChannel(aliceSocket, alice.id, channelId);
      const results: Array<{ ok: boolean; error?: string }> = [];
      for (let index = 0; index < 6; index += 1) {
        results.push(
          (await aliceSocket.timeout(5000).emitWithAck('send_message', {
            channelId,
            content: `флуд ${index}`,
          })) as {
            ok: boolean;
            error?: string;
          },
        );
      }
      expect(results.slice(0, 5).every((item) => item.ok)).toBe(true);
      expect(results[5]).toEqual({
        ok: false,
        error: 'Слишком часто — подождите несколько секунд.',
      });
      await redis.client.del(`chat:rate:${alice.id}`);
    });

    it('join_channel присоединяет к комнате, рассылает user:online и попадает в REST /online', async () => {
      bobSocket = await connectSocket(bob);
      await joinChannel(bobSocket, bob.id, channelId);

      const online = await request(app.getHttpServer())
        .get(`/chat/channels/${slug}/online`)
        .expect(200);
      expect(online.body.userIds).toContain(bob.id);

      const leftPromise = waitForEvent<{ userId: string }>(
        bobSocket,
        'user:offline',
      );
      bobSocket.emit('leave_channel', { channelId });
      const left = await leftPromise;
      expect(left.userId).toBe(bob.id);

      const onlineAfter = await request(app.getHttpServer())
        .get(`/chat/channels/${slug}/online`)
        .expect(200);
      expect(onlineAfter.body.userIds).not.toContain(bob.id);
    });

    let messageId: string;

    it('send_message рассылает message:new участникам канала', async () => {
      bobSocket = await connectSocket(bob);
      aliceSocket = await connectSocket(alice);
      await joinChannel(bobSocket, bob.id, channelId);
      await joinChannel(aliceSocket, alice.id, channelId);

      const newMessagePromise = waitForEvent<{ id: string; content: string }>(
        bobSocket,
        'message:new',
      );
      aliceSocket.emit('send_message', { channelId, content: 'привет, чат!' });
      const message = await newMessagePromise;
      expect(message.content).toBe('привет, чат!');
      messageId = message.id;
    });

    it('edit_message доступен только автору', async () => {
      aliceSocket = await connectSocket(alice);
      bobSocket = await connectSocket(bob);
      await joinChannel(aliceSocket, alice.id, channelId);
      await joinChannel(bobSocket, bob.id, channelId);

      bobSocket.emit('edit_message', { messageId, content: 'подмена' });
      const errorPromise = waitForEvent<{ event: string }>(bobSocket, 'error');
      const error = await errorPromise;
      expect(error.event).toBe('edit_message');

      const editedPromise = waitForEvent<{
        content: string;
        isEdited: boolean;
      }>(bobSocket, 'message:edited');
      aliceSocket.emit('edit_message', {
        messageId,
        content: 'привет, чат! (ред.)',
      });
      const edited = await editedPromise;
      expect(edited.content).toBe('привет, чат! (ред.)');
      expect(edited.isEdited).toBe(true);
    });

    it('typing_start доходит до собеседника, но не возвращается отправителю', async () => {
      aliceSocket = await connectSocket(alice);
      bobSocket = await connectSocket(bob);
      await joinChannel(aliceSocket, alice.id, channelId);
      await joinChannel(bobSocket, bob.id, channelId);

      let aliceGotOwnTyping = false;
      aliceSocket.once('user:typing', () => {
        aliceGotOwnTyping = true;
      });
      const typingPromise = waitForEvent<{ userId: string }>(
        bobSocket,
        'user:typing',
      );
      aliceSocket.emit('typing_start', { channelId });
      const typing = await typingPromise;
      expect(typing.userId).toBe(alice.id);
      expect(aliceGotOwnTyping).toBe(false);
    });

    it('pin_message требует chat.messages.pin', async () => {
      aliceSocket = await connectSocket(alice);
      moderatorSocket = await connectSocket(moderator);
      await joinChannel(aliceSocket, alice.id, channelId);
      await joinChannel(moderatorSocket, moderator.id, channelId);

      aliceSocket.emit('pin_message', { messageId });
      const errorPromise = waitForEvent<{ event: string }>(
        aliceSocket,
        'error',
      );
      const error = await errorPromise;
      expect(error.event).toBe('pin_message');

      const pinnedPromise = waitForEvent<{ isPinned: boolean }>(
        aliceSocket,
        'message:pinned',
      );
      moderatorSocket.emit('pin_message', { messageId });
      const pinned = await pinnedPromise;
      expect(pinned.isPinned).toBe(true);
    });

    it('delete_message: автор удаляет своё сообщение', async () => {
      aliceSocket = await connectSocket(alice);
      await joinChannel(aliceSocket, alice.id, channelId);

      const sendAck = waitForEvent<{ id: string }>(aliceSocket, 'message:new');
      aliceSocket.emit('send_message', { channelId, content: 'на удаление' });
      const created = await sendAck;

      const deletedPromise = waitForEvent<{ isDeleted: boolean }>(
        aliceSocket,
        'message:deleted',
      );
      aliceSocket.emit('delete_message', { messageId: created.id });
      const deleted = await deletedPromise;
      expect(deleted.isDeleted).toBe(true);
    });

    it('mute_user: публичное событие без причины, личное — с деталями, блокирует send_message', async () => {
      aliceSocket = await connectSocket(alice);
      bobSocket = await connectSocket(bob);
      moderatorSocket = await connectSocket(moderator);
      await joinChannel(aliceSocket, alice.id, channelId);
      await joinChannel(bobSocket, bob.id, channelId);
      await joinChannel(moderatorSocket, moderator.id, channelId);

      const publicMutePromise = waitForEvent<{
        userId: string;
        channelId: string | null;
      }>(bobSocket, 'user:muted');
      const privateMutePromise = waitForEvent<{
        userId: string;
        reason: string;
      }>(aliceSocket, 'user:muted');
      moderatorSocket.emit('mute_user', {
        userId: alice.id,
        channelId,
        reason: 'SPAM',
      });
      const [publicMute, privateMute] = await Promise.all([
        publicMutePromise,
        privateMutePromise,
      ]);
      expect(publicMute.userId).toBe(alice.id);
      expect(
        (publicMute as unknown as { reason?: string }).reason,
      ).toBeUndefined();
      expect(privateMute.reason).toBe('SPAM');

      const mutedErrorPromise = waitForEvent<{ event: string }>(
        aliceSocket,
        'error',
      );
      aliceSocket.emit('send_message', {
        channelId,
        content: 'попытка в муте',
      });
      const mutedError = await mutedErrorPromise;
      expect(mutedError.event).toBe('send_message');

      const listRes = await request(app.getHttpServer())
        .get('/admin/chat/mutes')
        .set('Authorization', auth(moderator))
        .expect(200);
      const muteRecord = listRes.body.find(
        (m: { userId: string }) => m.userId === alice.id,
      );
      expect(muteRecord).toBeDefined();

      await request(app.getHttpServer())
        .delete(`/admin/chat/mutes/${muteRecord.id}`)
        .set('Authorization', auth(moderator))
        .expect(200);

      const unmutedSendPromise = waitForEvent<{ content: string }>(
        aliceSocket,
        'message:new',
      );
      aliceSocket.emit('send_message', { channelId, content: 'после размута' });
      const unmutedMessage = await unmutedSendPromise;
      expect(unmutedMessage.content).toBe('после размута');
    });

    it('ban_user: личные детали, публичный минимальный payload, принудительный disconnect', async () => {
      carolSocket = await connectSocket(carol);
      moderatorSocket = await connectSocket(moderator);

      const privateBanPromise = waitForEvent<{
        userId: string;
        reason: string;
      }>(carolSocket, 'user:banned');
      const disconnectPromise = new Promise<void>((resolve) => {
        carolSocket.once('disconnect', () => resolve());
      });
      moderatorSocket.emit('ban_user', {
        userId: carol.id,
        reason: 'токсичность',
      });

      const privateBan = await privateBanPromise;
      expect(privateBan.reason).toBe('токсичность');
      await disconnectPromise;

      const listRes = await request(app.getHttpServer())
        .get('/admin/chat/bans')
        .set('Authorization', auth(moderator))
        .expect(200);
      const banRecord = listRes.body.find(
        (b: { userId: string }) => b.userId === carol.id,
      );
      expect(banRecord).toBeDefined();

      await expect(connectSocket(carol)).rejects.toBeDefined();

      await request(app.getHttpServer())
        .delete(`/admin/chat/bans/${banRecord.id}`)
        .set('Authorization', auth(moderator))
        .expect(200);

      carolSocket = await connectSocket(carol);
      expect(carolSocket.connected).toBe(true);
    });

    it('read-only канал: отправка требует chat.messages.post_readonly', async () => {
      const readonlyRes = await request(app.getHttpServer())
        .post('/admin/chat/channels')
        .set('Authorization', auth(moderator))
        .send({
          slug: `e2e-${unique}-readonly`,
          name: 'E2E Readonly',
          type: 'ANNOUNCEMENTS',
          isReadOnly: true,
        })
        .expect(201);
      const readonlyChannelId = readonlyRes.body.id;

      bobSocket = await connectSocket(bob);
      await joinChannel(bobSocket, bob.id, readonlyChannelId);

      const deniedPromise = waitForEvent<{ event: string }>(bobSocket, 'error');
      bobSocket.emit('send_message', {
        channelId: readonlyChannelId,
        content: 'нельзя',
      });
      const denied = await deniedPromise;
      expect(denied.event).toBe('send_message');

      const readonlyRole = await createRole(
        `chat-readonly-poster-${unique}`,
        5,
      );
      await grantRole(bob.id, readonlyRole.id);
      await grantPermissions(readonlyRole.id, ['chat.messages.post_readonly']);

      const allowedPromise = waitForEvent<{ content: string }>(
        bobSocket,
        'message:new',
      );
      bobSocket.emit('send_message', {
        channelId: readonlyChannelId,
        content: 'теперь можно',
      });
      const allowed = await allowedPromise;
      expect(allowed.content).toBe('теперь можно');
    });
  });
});
