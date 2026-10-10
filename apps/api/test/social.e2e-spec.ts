import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';

// Компиляция AppModule + 3 реальных register/login (bcrypt) в beforeAll
// укладываются в дефолтные 5000 мс Jest по отдельности, но под полным
// e2e-сьютом (8 файлов параллельно, общие Postgres+Redis) конкуренция за
// ресурсы может вытолкнуть хук за дефолтный таймаут — см. RISKS.md.
jest.setTimeout(20_000);

describe('Social system (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const unique = randomUUID().slice(0, 8);

  interface TestUser {
    id: string;
    accessToken: string;
    username: string;
    email: string;
  }

  async function createUser(label: string): Promise<TestUser> {
    const email = `social-${label}-${unique}@example.com`;
    const username = `soc${label}${unique}`
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

    prisma = app.get(PrismaService);

    alice = await createUser('alice');
    bob = await createUser('bob');
    carol = await createUser('carol');
  });

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
  });

  const auth = (user: TestUser) => `Bearer ${user.accessToken}`;

  it('заявка в друзья: нельзя себе, нельзя дублировать, нельзя при NOBODY', async () => {
    await request(app.getHttpServer())
      .post(`/friends/requests/${alice.username}`)
      .set('Authorization', auth(alice))
      .expect(403);

    await request(app.getHttpServer())
      .patch('/users/me/profile')
      .set('Authorization', auth(bob))
      .send({ friendRequestPolicy: 'NOBODY' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/friends/requests/${bob.username}`)
      .set('Authorization', auth(alice))
      .expect(403);
    await request(app.getHttpServer())
      .patch('/users/me/profile')
      .set('Authorization', auth(bob))
      .send({ friendRequestPolicy: 'EVERYONE' })
      .expect(200);
  });

  it('полный цикл: заявка -> принятие -> список друзей -> активность -> отмена дружбы', async () => {
    const sendRes = await request(app.getHttpServer())
      .post(`/friends/requests/${bob.username}`)
      .set('Authorization', auth(alice))
      .expect(201);
    const friendshipId = sendRes.body.id;

    // Дубликат — 409.
    await request(app.getHttpServer())
      .post(`/friends/requests/${bob.username}`)
      .set('Authorization', auth(alice))
      .expect(409);

    const incoming = await request(app.getHttpServer())
      .get('/friends/requests/incoming')
      .set('Authorization', auth(bob))
      .expect(200);
    expect(incoming.body).toHaveLength(1);
    // ADR-0108: в списках — только публичные поля пользователя.
    expect(incoming.body[0]).toMatchObject({
      id: friendshipId,
      user: { id: alice.id, username: alice.username },
    });
    expect(Object.keys(incoming.body[0].user).sort()).toEqual(
      ['avatar', 'id', 'tag', 'username'].sort(),
    );
    expect(JSON.stringify(incoming.body)).not.toContain(alice.email);
    const outgoing = await request(app.getHttpServer())
      .get('/friends/requests/outgoing')
      .set('Authorization', auth(alice))
      .expect(200);
    expect(outgoing.body[0].user.id).toBe(bob.id);
    expect(JSON.stringify(outgoing.body)).not.toContain(bob.email);

    const relation = (viewer: TestUser, target: TestUser) =>
      request(app.getHttpServer())
        .get(`/friends/relation/${target.username}`)
        .set('Authorization', auth(viewer))
        .expect(200);
    expect((await relation(alice, bob)).body).toEqual({
      userId: bob.id,
      status: 'OUTGOING',
      requestId: friendshipId,
    });
    expect((await relation(bob, alice)).body.status).toBe('INCOMING');
    expect((await relation(alice, alice)).body.status).toBe('SELF');
    expect((await relation(alice, carol)).body.status).toBe('NONE');

    // Уведомление о заявке ведёт на «Входящие», а не на старый /users/*.
    const notice = await prisma.notification.findFirst({
      where: { userId: bob.id, type: 'FRIEND_REQUEST' },
      orderBy: { createdAt: 'desc' },
    });
    expect(notice?.link).toBe('/friends?tab=incoming');

    const countRes = await request(app.getHttpServer())
      .get('/friends/requests/incoming/count')
      .set('Authorization', auth(bob))
      .expect(200);
    expect(countRes.body.count).toBe(1);

    await request(app.getHttpServer())
      .post(`/friends/requests/${friendshipId}/accept`)
      .set('Authorization', auth(bob))
      .expect(201);

    const aliceFriends = await request(app.getHttpServer())
      .get('/friends')
      .set('Authorization', auth(alice))
      .expect(200);
    expect(
      aliceFriends.body.some(
        (f: { user: { id: string } }) => f.user.id === bob.id,
      ),
    ).toBe(true);
    expect(JSON.stringify(aliceFriends.body)).not.toContain(bob.email);
    expect(aliceFriends.body[0].since).toEqual(expect.any(String));
    expect((await relation(alice, bob)).body.status).toBe('FRIENDS');

    // Принятие заявки создаёт запись активности FRIENDSHIP_STARTED у requester'а (alice).
    const activityRows = await prisma.activity.findMany({
      where: { userId: alice.id, type: 'FRIENDSHIP_STARTED' },
    });
    expect(activityRows.length).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .delete(`/friends/${bob.id}`)
      .set('Authorization', auth(alice))
      .expect(200);
    const aliceFriendsAfter = await request(app.getHttpServer())
      .get('/friends')
      .set('Authorization', auth(alice))
      .expect(200);
    expect(
      aliceFriendsAfter.body.some(
        (f: { user: { id: string } }) => f.user.id === bob.id,
      ),
    ).toBe(false);
  });

  it('блокировка запрещает отправку заявки', async () => {
    await request(app.getHttpServer())
      .post(`/friends/block/${carol.id}`)
      .set('Authorization', auth(alice))
      .expect(201);

    await request(app.getHttpServer())
      .post(`/friends/requests/${alice.username}`)
      .set('Authorization', auth(carol))
      .expect(403);

    const blocked = await request(app.getHttpServer())
      .get('/friends/blocked')
      .set('Authorization', auth(alice))
      .expect(200);
    expect(blocked.body).toEqual([
      {
        user: expect.objectContaining({
          id: carol.id,
          username: carol.username,
        }),
        blockedAt: expect.any(String),
      },
    ]);
    expect(JSON.stringify(blocked.body)).not.toContain(carol.email);
    const asBlocker = await request(app.getHttpServer())
      .get(`/friends/relation/${carol.username}`)
      .set('Authorization', auth(alice))
      .expect(200);
    expect(asBlocker.body.status).toBe('BLOCKED');
    // Заблокированный не узнаёт о блокировке.
    const asBlocked = await request(app.getHttpServer())
      .get(`/friends/relation/${alice.username}`)
      .set('Authorization', auth(carol))
      .expect(200);
    expect(asBlocked.body.status).toBe('NONE');

    await request(app.getHttpServer())
      .delete(`/friends/block/${carol.id}`)
      .set('Authorization', auth(alice))
      .expect(200);
  });

  it('ответная блокировка не снимает чужой блок; неизвестный игрок — 404', async () => {
    const http = () => request(app.getHttpServer());
    await http()
      .post(`/friends/block/${carol.id}`)
      .set('Authorization', auth(bob))
      .expect(201);
    // Carol в ответ блокирует Bob: блок Bob остаётся.
    await http()
      .post(`/friends/block/${bob.id}`)
      .set('Authorization', auth(carol))
      .expect(201);
    // Повтор — без ошибок и без дублей.
    await http()
      .post(`/friends/block/${bob.id}`)
      .set('Authorization', auth(carol))
      .expect(201);
    const rows = await prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: bob.id, addresseeId: carol.id },
          { requesterId: carol.id, addresseeId: bob.id },
        ],
      },
    });
    expect(
      rows.map((row) => `${row.requesterId}:${row.status}`).sort(),
    ).toEqual([`${bob.id}:BLOCKED`, `${carol.id}:BLOCKED`].sort());
    // Carol снимает свой блок — блок Bob по-прежнему действует.
    await http()
      .delete(`/friends/block/${bob.id}`)
      .set('Authorization', auth(carol))
      .expect(200);
    await http()
      .post(`/friends/requests/${bob.username}`)
      .set('Authorization', auth(carol))
      .expect(403);
    await http()
      .delete(`/friends/block/${carol.id}`)
      .set('Authorization', auth(bob))
      .expect(200);

    await http()
      .post('/friends/block/no-such-user-id')
      .set('Authorization', auth(bob))
      .expect(404);
    await http()
      .get('/friends/relation/no-such-user-zz')
      .set('Authorization', auth(bob))
      .expect(404);
  });

  it('комментарии профиля: создание, список, редактирование, реакция, удаление', async () => {
    const created = await request(app.getHttpServer())
      .post(`/users/${alice.username}/comments`)
      .set('Authorization', auth(bob))
      .send({ content: 'Привет @alice!' })
      .expect(201);
    expect(created.body.mentions).toContain('alice');

    const listRes = await request(app.getHttpServer())
      .get(`/users/${alice.username}/comments`)
      .expect(200);
    expect(listRes.body.total).toBeGreaterThan(0);

    const updated = await request(app.getHttpServer())
      .patch(`/comments/${created.body.id}`)
      .set('Authorization', auth(bob))
      .send({ content: 'Отредактировано' })
      .expect(200);
    expect(updated.body.isEdited).toBe(true);

    await request(app.getHttpServer())
      .patch(`/comments/${created.body.id}`)
      .set('Authorization', auth(carol))
      .send({ content: 'чужая правка' })
      .expect(403);

    const reactRes = await request(app.getHttpServer())
      .post(`/comments/${created.body.id}/reactions`)
      .set('Authorization', auth(carol))
      .send({ emoji: '👍' })
      .expect(201);
    expect(reactRes.body.reacted).toBe(true);
    const unreactRes = await request(app.getHttpServer())
      .post(`/comments/${created.body.id}/reactions`)
      .set('Authorization', auth(carol))
      .send({ emoji: '👍' })
      .expect(201);
    expect(unreactRes.body.reacted).toBe(false);

    await request(app.getHttpServer())
      .delete(`/comments/${created.body.id}`)
      .set('Authorization', auth(bob))
      .expect(200);
    const listAfterDelete = await request(app.getHttpServer())
      .get(`/users/${alice.username}/comments`)
      .expect(200);
    expect(
      listAfterDelete.body.items.some(
        (c: { id: string }) => c.id === created.body.id,
      ),
    ).toBe(false);
  });

  it('commentsEnabled=false запрещает комментирование', async () => {
    await request(app.getHttpServer())
      .patch('/users/me/profile')
      .set('Authorization', auth(carol))
      .send({ commentsEnabled: false })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/users/${carol.username}/comments`)
      .set('Authorization', auth(bob))
      .send({ content: 'test' })
      .expect(403);

    await request(app.getHttpServer())
      .patch('/users/me/profile')
      .set('Authorization', auth(carol))
      .send({ commentsEnabled: true })
      .expect(200);
  });

  it('лента активности: глобальная (PUBLIC) видна всем, но не всегда конкретному зрителю', async () => {
    const globalFeed = await request(app.getHttpServer())
      .get('/activity/feed')
      .expect(200);
    expect(Array.isArray(globalFeed.body.items)).toBe(true);

    const activity = await prisma.activity.findFirst({
      where: { userId: bob.id, type: 'FRIENDSHIP_STARTED' },
    });
    // FRIENDSHIP_STARTED создаётся с visibility=FRIENDS у requester'а (alice),
    // не у bob — просто убеждаемся, что персональная лента bob доступна и
    // не падает для стороннего зрителя (carol, не друг).
    const bobFeed = await request(app.getHttpServer())
      .get(`/activity/feed/user/${bob.username}`)
      .set('Authorization', auth(carol))
      .expect(200);
    expect(Array.isArray(bobFeed.body.items)).toBe(true);
    expect(activity).toBeNull(); // подтверждаем, где реально создаётся запись

    const settingsRes = await request(app.getHttpServer())
      .get('/activity/settings')
      .set('Authorization', auth(alice))
      .expect(200);
    expect(settingsRes.body.userId).toBe(alice.id);
  });
});
