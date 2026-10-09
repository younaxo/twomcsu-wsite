import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';

jest.setTimeout(30_000);

/// ADR-0073: карточка превью профиля — реальные данные или null, те же правила
/// видимости, что у публичного профиля.
describe('Profile summary (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const unique = randomUUID().slice(0, 6);
  const password = 'Sup3rSecretPassw0rd!';
  const ids: string[] = [];

  async function createUser(label: string) {
    const email = `ps-${label}-${unique}@example.com`;
    const username = `ps${label}${unique}`.slice(0, 16);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ emailOrUsername: username, password })
      .expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    ids.push(user.id);
    return { id: user.id, username, auth: `Bearer ${login.body.accessToken}` };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.playerStatistics.deleteMany({
      where: { userId: { in: ids } },
    });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  it('открытый профиль: роли, счётчики, статистики нет — null, а не нули', async () => {
    const user = await createUser('open');
    const res = await request(app.getHttpServer())
      .get(`/users/${user.username.toUpperCase()}/summary`)
      .expect(200);
    expect(res.body).toMatchObject({
      username: user.username,
      hidden: false,
      online: false,
      currentServer: null,
      statistics: null,
      statisticsHidden: false,
      friendsCount: 0,
      achievementsCompleted: 0,
      system: false,
    });
    expect(Array.isArray(res.body.roles)).toBe(true);
    expect(res.body).not.toHaveProperty('email');
  });

  it('статистика скрыта игроком — посторонние не видят, владелец видит', async () => {
    const owner = await createUser('stat');
    await prisma.playerStatistics.create({
      data: {
        userId: owner.id,
        playTime: 125,
        kills: 7,
        deaths: 3,
        killDeathRatio: 2.33,
      },
    });
    const visible = await request(app.getHttpServer())
      .get(`/users/${owner.username}/summary`)
      .expect(200);
    expect(visible.body.statistics).toEqual({
      playTimeMinutes: 125,
      kills: 7,
      deaths: 3,
      killDeathRatio: 2.33,
    });
    await prisma.user.update({
      where: { id: owner.id },
      data: { hideStatistics: true },
    });
    const hidden = await request(app.getHttpServer())
      .get(`/users/${owner.username}/summary`)
      .expect(200);
    expect(hidden.body).toMatchObject({
      statistics: null,
      statisticsHidden: true,
    });
    const own = await request(app.getHttpServer())
      .get(`/users/${owner.username}/summary`)
      .set('Authorization', owner.auth)
      .expect(200);
    expect(own.body.statistics?.kills).toBe(7);
  });

  it('закрытый профиль: посторонним только hidden, достижения тоже скрыты; владельцу — всё', async () => {
    const owner = await createUser('priv');
    const other = await createUser('oth');
    await prisma.user.update({
      where: { id: owner.id },
      data: { profileVisibility: 'NOBODY' },
    });
    const res = await request(app.getHttpServer())
      .get(`/users/${owner.username}/summary`)
      .set('Authorization', other.auth)
      .expect(200);
    expect(res.body).toEqual({ username: owner.username, hidden: true });
    await request(app.getHttpServer())
      .get(`/users/${owner.username}/achievements`)
      .set('Authorization', other.auth)
      .expect(404);
    const own = await request(app.getHttpServer())
      .get(`/users/${owner.username}/summary`)
      .set('Authorization', owner.auth)
      .expect(200);
    expect(own.body.hidden).toBe(false);
    await request(app.getHttpServer())
      .get(`/users/${owner.username}/achievements`)
      .set('Authorization', owner.auth)
      .expect(200);
  });

  it('несуществующий ник — 404', async () => {
    await request(app.getHttpServer())
      .get(`/users/no_user_${unique}/summary`)
      .expect(404);
  });
});
