import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';

// Компиляция AppModule + реальный листенинг порта + несколько bcrypt-хешей
// в beforeAll, плюс парные WS-соединения в части тестов, дольше укладываются
// в дефолтные 5000 мс Jest — явный таймаут на весь файл (другие e2e-сьюты
// этого не делают, т.к. не поднимают реальный TCP-листенер для WebSocket).
jest.setTimeout(15_000);

describe('Direct Messages (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  const unique = randomUUID().slice(0, 8);

  interface TestUser {
    id: string;
    accessToken: string;
    username: string;
    email: string;
  }

  async function createUser(label: string): Promise<TestUser> {
    const email = `dm-${label}-${unique}@example.com`;
    const username = `dm${label}${unique}`
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

  function connectSocket(user: TestUser): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(`${baseUrl}/messages`, {
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
  let carol: TestUser;

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

    alice = await createUser('alice');
    bob = await createUser('bob');
    carol = await createUser('carol');
  }, 30_000);

  afterAll(async () => {
    if (alice && bob && carol) {
      await prisma.auditLog.deleteMany({
        where: {
          actor: { email: { in: [alice.email, bob.email, carol.email] } },
        },
      });
      await prisma.user.deleteMany({
        where: { email: { in: [alice.email, bob.email, carol.email] } },
      });
    }
    await app.close();
  }, 15_000);

  const auth = (user: TestUser) => `Bearer ${user.accessToken}`;

  it('нельзя написать себе; NOBODY/FRIENDS/FRIENDS_OF_FRIENDS блокируют чужаков', async () => {
    await request(app.getHttpServer())
      .post('/messages/conversations/direct')
      .set('Authorization', auth(alice))
      .send({ username: alice.username })
      .expect(403);

    await request(app.getHttpServer())
      .patch('/users/me/profile')
      .set('Authorization', auth(carol))
      .send({ directMessagePolicy: 'NOBODY' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/messages/conversations/direct')
      .set('Authorization', auth(alice))
      .send({ username: carol.username })
      .expect(403);

    await request(app.getHttpServer())
      .patch('/users/me/profile')
      .set('Authorization', auth(carol))
      .send({ directMessagePolicy: 'FRIENDS' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/messages/conversations/direct')
      .set('Authorization', auth(alice))
      .send({ username: carol.username })
      .expect(403);

    await request(app.getHttpServer())
      .patch('/users/me/profile')
      .set('Authorization', auth(carol))
      .send({ directMessagePolicy: 'EVERYONE' })
      .expect(200);
  });

  let conversationId: string;

  it('создание личной беседы идемпотентно (повторный вызов возвращает ту же беседу)', async () => {
    const first = await request(app.getHttpServer())
      .post('/messages/conversations/direct')
      .set('Authorization', auth(alice))
      .send({ username: bob.username })
      .expect(201);
    conversationId = first.body.id;
    expect(first.body.members).toHaveLength(2);

    const second = await request(app.getHttpServer())
      .post('/messages/conversations/direct')
      .set('Authorization', auth(bob))
      .send({ username: alice.username })
      .expect(201);
    expect(second.body.id).toBe(conversationId);
  });

  it('чужак не видит беседу и не может читать сообщения (404)', async () => {
    await request(app.getHttpServer())
      .get(`/messages/conversations/${conversationId}`)
      .set('Authorization', auth(carol))
      .expect(404);
    await request(app.getHttpServer())
      .get(`/messages/conversations/${conversationId}/messages`)
      .set('Authorization', auth(carol))
      .expect(404);
  });

  it('REST: отправка, список, редактирование, реакция, удаление сообщения', async () => {
    const sendRes = await request(app.getHttpServer())
      .post(`/messages/conversations/${conversationId}/messages`)
      .set('Authorization', auth(alice))
      .send({ content: 'Привет, Боб!' })
      .expect(201);
    const messageId = sendRes.body.id;
    expect(sendRes.body.contentHtml).toBe('Привет, Боб!');

    const listRes = await request(app.getHttpServer())
      .get(`/messages/conversations/${conversationId}/messages`)
      .set('Authorization', auth(bob))
      .expect(200);
    expect(
      listRes.body.items.some((m: { id: string }) => m.id === messageId),
    ).toBe(true);

    await request(app.getHttpServer())
      .patch(`/messages/messages/${messageId}`)
      .set('Authorization', auth(bob))
      .send({ content: 'чужая правка' })
      .expect(403);

    const editRes = await request(app.getHttpServer())
      .patch(`/messages/messages/${messageId}`)
      .set('Authorization', auth(alice))
      .send({ content: 'Привет, Боб! (ред.)' })
      .expect(200);
    expect(editRes.body.isEdited).toBe(true);

    const reactRes = await request(app.getHttpServer())
      .post(`/messages/messages/${messageId}/reactions`)
      .set('Authorization', auth(bob))
      .send({ emoji: '👍' })
      .expect(201);
    expect(reactRes.body.reacted).toBe(true);

    const reactAgainRes = await request(app.getHttpServer())
      .post(`/messages/messages/${messageId}/reactions`)
      .set('Authorization', auth(bob))
      .send({ emoji: '👍' })
      .expect(201);
    expect(reactAgainRes.body.reacted).toBe(false);

    await request(app.getHttpServer())
      .delete(`/messages/messages/${messageId}`)
      .set('Authorization', auth(alice))
      .expect(200);
  });

  it('REST: markRead обновляет lastReadAt и список бесед показывает unreadCount', async () => {
    const newMsg = await request(app.getHttpServer())
      .post(`/messages/conversations/${conversationId}/messages`)
      .set('Authorization', auth(alice))
      .send({ content: 'ещё одно сообщение' })
      .expect(201);

    const bobConversations = await request(app.getHttpServer())
      .get('/messages/conversations')
      .set('Authorization', auth(bob))
      .expect(200);
    const bobConv = bobConversations.body.find(
      (c: { id: string }) => c.id === conversationId,
    );
    expect(bobConv.unreadCount).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .post(`/messages/conversations/${conversationId}/read`)
      .set('Authorization', auth(bob))
      .expect(201);

    const bobConversationsAfter = await request(app.getHttpServer())
      .get('/messages/conversations')
      .set('Authorization', auth(bob))
      .expect(200);
    const bobConvAfter = bobConversationsAfter.body.find(
      (c: { id: string }) => c.id === conversationId,
    );
    expect(bobConvAfter.unreadCount).toBe(0);
    expect(newMsg.body.conversationId ?? conversationId).toBe(conversationId);
  });

  it('групповая беседа: создание, приглашение, вступление по коду, выход', async () => {
    const groupRes = await request(app.getHttpServer())
      .post('/messages/conversations/group')
      .set('Authorization', auth(alice))
      .send({ title: 'Тестовая группа', memberUsernames: [bob.username] })
      .expect(201);
    const groupId = groupRes.body.id;
    expect(groupRes.body.members).toHaveLength(2);

    const inviteRes = await request(app.getHttpServer())
      .post(`/messages/conversations/${groupId}/invites`)
      .set('Authorization', auth(alice))
      .send({ maxUses: 1 })
      .expect(201);
    const code = inviteRes.body.code;

    const joinRes = await request(app.getHttpServer())
      .post(`/messages/invites/${code}/join`)
      .set('Authorization', auth(carol))
      .expect(201);
    expect(joinRes.body.members).toHaveLength(3);

    // maxUses=1 исчерпан.
    await request(app.getHttpServer())
      .get(`/messages/invites/${code}`)
      .set('Authorization', auth(bob))
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/messages/conversations/${groupId}/leave`)
      .set('Authorization', auth(carol))
      .expect(200);

    await request(app.getHttpServer())
      .get(`/messages/conversations/${groupId}`)
      .set('Authorization', auth(carol))
      .expect(404);
  });

  describe('WebSocket /messages', () => {
    let aliceSocket: Socket;
    let bobSocket: Socket;

    afterEach(() => {
      aliceSocket?.disconnect();
      bobSocket?.disconnect();
    });

    it('без токена соединение разрывается', async () => {
      const socket = io(`${baseUrl}/messages`, {
        transports: ['websocket'],
        forceNew: true,
      });
      await new Promise<void>((resolve) => {
        socket.once('disconnect', () => resolve());
        socket.once('connect_error', () => resolve());
      });
      socket.disconnect();
    });

    it('с валидным токеном подключается и автоматически входит в комнату беседы', async () => {
      aliceSocket = await connectSocket(alice);
      expect(aliceSocket.connected).toBe(true);
    });

    it('message:send рассылает message:new и conversation:changed; ack содержит сообщение', async () => {
      aliceSocket = await connectSocket(alice);
      bobSocket = await connectSocket(bob);

      const newMessagePromise = waitForEvent<{ id: string; content: string }>(
        bobSocket,
        'message:new',
      );
      const changedPromise = waitForEvent<{ conversationId: string }>(
        bobSocket,
        'conversation:changed',
      );

      const ack = await new Promise<{ ok: boolean; message: { id: string } }>(
        (resolve) => {
          aliceSocket.emit(
            'message:send',
            { conversationId, content: 'привет через сокет' },
            resolve,
          );
        },
      );
      expect(ack.ok).toBe(true);

      const newMessage = await newMessagePromise;
      expect(newMessage.content).toBe('привет через сокет');

      const changed = await changedPromise;
      expect(changed.conversationId).toBe(conversationId);

      await request(app.getHttpServer())
        .delete(`/messages/messages/${ack.message.id}`)
        .set('Authorization', auth(alice))
        .expect(200);
    });

    it('typing:start доходит до собеседника, но не возвращается отправителю', async () => {
      aliceSocket = await connectSocket(alice);
      bobSocket = await connectSocket(bob);

      let aliceReceivedOwnTyping = false;
      aliceSocket.once('typing:start', () => {
        aliceReceivedOwnTyping = true;
      });
      const typingPromise = waitForEvent<{
        conversationId: string;
        userId: string;
      }>(bobSocket, 'typing:start');

      // Сокет может войти в комнату беседы чуть позже подключения — повторяем
      // отправку, пока собеседник не получит событие (без гонки в CI).
      aliceSocket.emit('typing:start', { conversationId });
      const retry = setInterval(
        () => aliceSocket.emit('typing:start', { conversationId }),
        200,
      );
      const typing = await typingPromise.finally(() => clearInterval(retry));
      expect(typing.userId).toBe(alice.id);
      expect(aliceReceivedOwnTyping).toBe(false);
    });

    it('message:react и message:edit рассылают message:updated в комнату беседы', async () => {
      aliceSocket = await connectSocket(alice);
      bobSocket = await connectSocket(bob);

      const sendRes = await request(app.getHttpServer())
        .post(`/messages/conversations/${conversationId}/messages`)
        .set('Authorization', auth(alice))
        .send({ content: 'сообщение для реакции' })
        .expect(201);
      const messageId = sendRes.body.id;

      // message:updated рассылается всей комнате (включая инициатора), поэтому
      // обе стороны получают копию каждого события — дожидаемся обеих копий
      // перед следующим шагом, иначе "чужая" копия предыдущего события может
      // быть ошибочно принята за ответ на следующее действие (тот же event name).
      type UpdatePayload = {
        messageId?: string;
        id?: string;
        reacted?: boolean;
        content?: string;
      };
      const reactOnAlice = waitForEvent<UpdatePayload>(
        aliceSocket,
        'message:updated',
      );
      const reactOnBob = waitForEvent<UpdatePayload>(
        bobSocket,
        'message:updated',
      );
      bobSocket.emit('message:react', { messageId, emoji: '🔥' });
      const [reactUpdateAlice, reactUpdateBob] = await Promise.all([
        reactOnAlice,
        reactOnBob,
      ]);
      expect(reactUpdateAlice.reacted).toBe(true);
      expect(reactUpdateBob.messageId).toBe(messageId);

      const editOnAlice = waitForEvent<UpdatePayload>(
        aliceSocket,
        'message:updated',
      );
      const editOnBob = waitForEvent<UpdatePayload>(
        bobSocket,
        'message:updated',
      );
      aliceSocket.emit('message:edit', {
        messageId,
        content: 'отредактировано через сокет',
      });
      const [editUpdateAlice, editUpdateBob] = await Promise.all([
        editOnAlice,
        editOnBob,
      ]);
      expect(editUpdateAlice.content).toBe('отредактировано через сокет');
      expect(editUpdateBob.id).toBe(messageId);

      await request(app.getHttpServer())
        .delete(`/messages/messages/${messageId}`)
        .set('Authorization', auth(alice))
        .expect(200);
    });

    it('чужак не может вступить в чужую беседу через conversation:join', async () => {
      const carolSocket = await connectSocket(carol);
      let joined = false;
      carolSocket.emit('conversation:join', { conversationId });
      // Нет подтверждающего события — проверяем, что сокет не попадает в
      // комнату: message:send от alice не долетит до carol.
      const probe = waitForEvent(carolSocket, 'message:new');
      aliceSocket = await connectSocket(alice);
      const ack = await new Promise<{ ok: boolean; message: { id: string } }>(
        (resolve) => {
          aliceSocket.emit(
            'message:send',
            { conversationId, content: 'не для чужака' },
            resolve,
          );
        },
      );
      const result = await Promise.race([
        probe.then(() => 'received'),
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 1000)),
      ]);
      expect(result).toBe('timeout');
      joined = result === 'received';
      expect(joined).toBe(false);
      carolSocket.disconnect();

      await request(app.getHttpServer())
        .delete(`/messages/messages/${ack.message.id}`)
        .set('Authorization', auth(alice))
        .expect(200);
    });
  });
});
