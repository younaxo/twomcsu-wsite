import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';

describe('Profiles (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const unique = randomUUID().slice(0, 8);

  let user: { id: string; accessToken: string; username: string };
  const email = `profile-${unique}@example.com`;
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
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
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
      .put('/users/me/social-links/DISCORD')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ value: 'test#1234' })
      .expect(200);

    const listRes = await request(app.getHttpServer())
      .get('/users/me/social-links')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].platform).toBe('DISCORD');

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
      .delete('/users/me/social-links/DISCORD')
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
});
