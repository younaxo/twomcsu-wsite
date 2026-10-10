import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';

// См. auth.e2e-spec.ts — тот же риск конкуренции за ресурсы под полным сьютом.
jest.setTimeout(20_000);

describe('Profiles (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const unique = randomUUID().slice(0, 8);

  let user: { id: string; accessToken: string; username: string };
  const email = `profile-${unique}@example.com`;
  const otherEmail = `profile-other-${unique}@example.com`;
  let other: { id: string; accessToken: string; username: string };
  const password = 'Sup3rSecretPassw0rd!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);

    const username = `profile${unique}`.slice(0, 16);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ emailOrUsername: email, password })
      .expect(200);
    const dbUser = await prisma.user.findUniqueOrThrow({ where: { email } });
    user = { id: dbUser.id, accessToken: loginRes.body.accessToken, username };

    const otherName = `pother${unique}`.slice(0, 16);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: otherEmail, username: otherName, password })
      .expect(201);
    const otherLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ emailOrUsername: otherEmail, password })
      .expect(200);
    const otherDb = await prisma.user.findUniqueOrThrow({
      where: { email: otherEmail },
    });
    other = {
      id: otherDb.id,
      accessToken: otherLogin.body.accessToken,
      username: otherName,
    };
  });

  afterAll(async () => {
    // Только по известным e-mail этого набора (const) — без undefined-фильтров.
    const emails = [email, otherEmail];
    await prisma.auditLog.deleteMany({
      where: { actor: { email: { in: emails } } },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app?.close();
  });

  it('PATCH /users/me/profile обновляет поля профиля', async () => {
    const res = await request(app.getHttpServer())
      .patch('/users/me/profile')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ bio: 'Привет, это тестовый bio', country: 'RU', city: 'Moscow' })
      .expect(200);

    expect(res.body.bio).toBe('Привет, это тестовый bio');
    expect(res.body.country).toBe('RU');
    expect(res.body.city).toBe('Moscow');
  });

  it('дату рождения можно задать и очистить (null — не 1970-01-01)', async () => {
    const http = () =>
      request(app.getHttpServer())
        .patch('/users/me/profile')
        .set('Authorization', `Bearer ${user.accessToken}`);
    const set = await http().send({ birthDate: '2001-05-20' }).expect(200);
    expect(set.body.birthDate).toMatch(/^2001-05-20/);
    const cleared = await http()
      .send({ birthDate: null, statusText: null })
      .expect(200);
    expect(cleared.body.birthDate).toBeNull();
    expect(cleared.body.statusText).toBeNull();
  });

  it('GET /users/:username/public скрывает country при hideCountry=true', async () => {
    await request(app.getHttpServer())
      .patch('/users/me/profile')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ hideCountry: true })
      .expect(200);

    const publicRes = await request(app.getHttpServer())
      .get(`/users/${user.username}/public`)
      .expect(200);
    expect(publicRes.body.country).toBeUndefined();
    expect(publicRes.body.bio).toBe('Привет, это тестовый bio');

    // Владелец при этом по-прежнему видит своё собственное поле.
    const ownRes = await request(app.getHttpServer())
      .get('/users/me/profile')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    expect(ownRes.body.country).toBe('RU');

    await request(app.getHttpServer())
      .patch('/users/me/profile')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ hideCountry: false })
      .expect(200);
  });

  it('FRIENDS_ONLY виден друзьям; блокировка в любую сторону скрывает профиль', async () => {
    const http = () => request(app.getHttpServer());
    const extra: string[] = [];
    const make = async (label: string) => {
      const mail = `profile-${label}-${unique}@example.com`;
      const name = `pf${label}${unique}`.slice(0, 16);
      await http()
        .post('/auth/register')
        .send({ email: mail, username: name, password })
        .expect(201);
      const login = await http()
        .post('/auth/login')
        .send({ emailOrUsername: name, password })
        .expect(200);
      const row = await prisma.user.findUniqueOrThrow({
        where: { email: mail },
      });
      extra.push(row.id);
      return { id: row.id, auth: `Bearer ${login.body.accessToken}` };
    };
    try {
      const friend = await make('f');
      const stranger = await make('s');
      await prisma.friendship.create({
        data: {
          requesterId: user.id,
          addresseeId: friend.id,
          status: 'ACCEPTED',
        },
      });
      await http()
        .patch('/users/me/profile')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ profileVisibility: 'FRIENDS_ONLY' })
        .expect(200);
      const path = `/users/${user.username}/public`;
      await http().get(path).set('Authorization', friend.auth).expect(200);
      await http().get(path).set('Authorization', stranger.auth).expect(404);
      await http().get(path).expect(404);
      const summary = await http()
        .get(`/users/${user.username}/summary`)
        .set('Authorization', friend.auth)
        .expect(200);
      expect(summary.body.hidden).toBe(false);

      await http()
        .patch('/users/me/profile')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ profileVisibility: 'EVERYONE' })
        .expect(200);
      await http().get(path).set('Authorization', stranger.auth).expect(200);
      // Владелец заблокировал постороннего — профиль скрыт для него.
      await prisma.friendship.create({
        data: {
          requesterId: user.id,
          addresseeId: stranger.id,
          status: 'BLOCKED',
        },
      });
      await http().get(path).set('Authorization', stranger.auth).expect(404);
      const hidden = await http()
        .get(`/users/${user.username}/summary`)
        .set('Authorization', stranger.auth)
        .expect(200);
      expect(hidden.body.hidden).toBe(true);
    } finally {
      await prisma.refreshToken.deleteMany({
        where: { userId: { in: extra } },
      });
      await prisma.user.deleteMany({ where: { id: { in: extra } } });
    }
  });

  it('profileVisibility=NOBODY скрывает профиль от посторонних, но не от владельца', async () => {
    await request(app.getHttpServer())
      .patch('/users/me/profile')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ profileVisibility: 'NOBODY' })
      .expect(200);

    await request(app.getHttpServer())
      .get(`/users/${user.username}/public`)
      .expect(404);

    const ownView = await request(app.getHttpServer())
      .get(`/users/${user.username}/public`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    expect(ownView.body.username).toBe(user.username);

    await request(app.getHttpServer())
      .patch('/users/me/profile')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ profileVisibility: 'EVERYONE' })
      .expect(200);
  });

  it('социальные ссылки: добавление/список/скрытие/удаление', async () => {
    await request(app.getHttpServer())
      .put('/users/me/social-links/YOUTUBE')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ value: 'https://youtube.com/@test' })
      .expect(200);

    const listRes = await request(app.getHttpServer())
      .get('/users/me/social-links')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].platform).toBe('YOUTUBE');

    const publicWithSocial = await request(app.getHttpServer())
      .get(`/users/${user.username}/public`)
      .expect(200);
    expect(publicWithSocial.body.socialLinks).toHaveLength(1);

    await request(app.getHttpServer())
      .patch('/users/me/profile')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ hideSocials: true })
      .expect(200);
    const publicHidden = await request(app.getHttpServer())
      .get(`/users/${user.username}/public`)
      .expect(200);
    expect(publicHidden.body.socialLinks).toBeUndefined();

    await request(app.getHttpServer())
      .delete('/users/me/social-links/YOUTUBE')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    const listAfterDelete = await request(app.getHttpServer())
      .get('/users/me/social-links')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    expect(listAfterDelete.body).toHaveLength(0);
  });

  it('декорации: нельзя выбрать чужую, можно — свою, можно снять', async () => {
    const foreignDecoration = await prisma.profileDecoration.create({
      data: {
        slug: `foreign-${unique}`,
        name: 'Foreign',
        imageUrl: 'https://example.com/d.png',
        availability: 'ADMIN_ONLY',
      },
    });
    await request(app.getHttpServer())
      .patch('/users/me/decoration')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ decorationId: foreignDecoration.id })
      .expect(403);

    const ownedDecoration = await prisma.profileDecoration.create({
      data: {
        slug: `owned-${unique}`,
        name: 'Owned',
        imageUrl: 'https://example.com/d2.png',
        availability: 'ADMIN_ONLY',
      },
    });
    await prisma.userDecoration.create({
      data: {
        userId: user.id,
        decorationId: ownedDecoration.id,
        source: 'ADMIN',
      },
    });

    await request(app.getHttpServer())
      .patch('/users/me/decoration')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ decorationId: ownedDecoration.id })
      .expect(200);

    const afterSelect = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(afterSelect.selectedDecorationId).toBe(ownedDecoration.id);

    await request(app.getHttpServer())
      .patch('/users/me/decoration')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({})
      .expect(200);
    const afterUnset = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(afterUnset.selectedDecorationId).toBeNull();

    await prisma.userDecoration.deleteMany({ where: { userId: user.id } });
    await prisma.profileDecoration.deleteMany({
      where: { id: { in: [foreignDecoration.id, ownedDecoration.id] } },
    });
  });

  it('B5: профиль по нику Minecraft-привязки; просмотры без self-view и без дублей', async () => {
    const mcName = `mc_${unique}`.slice(0, 16);
    await prisma.minecraftAccount.create({
      data: { userId: user.id, uuid: randomUUID(), name: mcName },
    });
    const byMinecraft = await request(app.getHttpServer())
      .get(`/users/${mcName.toUpperCase()}/public`)
      .expect(200);
    expect(byMinecraft.body.username).toBe(user.username);
    expect(byMinecraft.body.minecraftName).toBe(mcName);

    const view = (token: string) =>
      request(app.getHttpServer())
        .post(`/users/${user.username}/view`)
        .set('Authorization', `Bearer ${token}`);
    expect((await view(user.accessToken).expect(201)).body.views).toBe(0);
    expect((await view(other.accessToken).expect(201)).body.views).toBe(1);
    expect((await view(other.accessToken).expect(201)).body.views).toBe(1);
    await request(app.getHttpServer())
      .post(`/users/${user.username}/view`)
      .expect(401);
  });

  it('B5: лайк/дизлайк — одна реакция на пару, смена и снятие; себе нельзя', async () => {
    const react = (token: string, type: string | null) =>
      request(app.getHttpServer())
        .put(`/users/${user.username}/reaction`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type });
    const liked = await react(other.accessToken, 'LIKE').expect(200);
    expect(liked.body).toMatchObject({
      likes: 1,
      dislikes: 0,
      myReaction: 'LIKE',
    });
    const disliked = await react(other.accessToken, 'DISLIKE').expect(200);
    expect(disliked.body).toMatchObject({
      likes: 0,
      dislikes: 1,
      myReaction: 'DISLIKE',
    });
    const cleared = await react(other.accessToken, null).expect(200);
    expect(cleared.body).toMatchObject({
      likes: 0,
      dislikes: 0,
      myReaction: null,
    });
    await react(other.accessToken, 'LOVE').expect(400);
    await react(user.accessToken, 'LIKE').expect(403);
  });

  it('B5: Connected Accounts — провайдер и имя без внешних ID; соцсети — отдельно и с проверкой ссылок', async () => {
    await prisma.userExternalAccount.create({
      data: {
        userId: user.id,
        provider: 'discord',
        providerUserId: `snowflake-${unique}`,
        username: 'steve_discord',
      },
    });
    const put = (platform: string, value: string) =>
      request(app.getHttpServer())
        .put(`/users/me/social-links/${platform}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ value });
    await put('WEBSITE', 'http://example.com').expect(400);
    await put('WEBSITE', 'javascript:alert(1)').expect(400);
    await put('WEBSITE', 'https://example.com/me').expect(200);
    const github = await put('GITHUB', 'octocat').expect(200);
    expect(github.body.value).toBe('https://github.com/octocat');
    await put('DISCORD', 'old#tag').expect(200);

    const pub = await request(app.getHttpServer())
      .get(`/users/${user.username}/public`)
      .expect(200);
    expect(pub.body.connectedAccounts).toEqual([
      { provider: 'discord', name: 'steve_discord' },
    ]);
    expect(JSON.stringify(pub.body)).not.toContain(`snowflake-${unique}`);
    const platforms = pub.body.socialLinks.map(
      (link: { platform: string }) => link.platform,
    );
    expect(platforms).toEqual(expect.arrayContaining(['WEBSITE', 'GITHUB']));
    expect(platforms).not.toContain('DISCORD');

    await request(app.getHttpServer())
      .patch('/users/me/profile')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ hideSocials: true })
      .expect(200);
    const hidden = await request(app.getHttpServer())
      .get(`/users/${user.username}/public`)
      .expect(200);
    expect(hidden.body.connectedAccounts).toBeUndefined();
    expect(hidden.body.socialLinks).toBeUndefined();
    await request(app.getHttpServer())
      .patch('/users/me/profile')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ hideSocials: false })
      .expect(200);
  });
});
