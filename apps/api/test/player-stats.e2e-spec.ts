import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { LeaderboardsService } from '../src/modules/leaderboards/leaderboards.service';

jest.setTimeout(30_000);

/// Срез 0.14: статистика игроков. Приватность (закрытый профиль, hideStatistics),
/// скрытый рейтинг «Покупки» (Q66), сброс кэша при смене приватности.
/// Флаг публичного раздела здесь только ВКЛЮЧАЕТСЯ и не сбрасывается: другие
/// наборы идут параллельно на той же БД. Состояние «выключен» покрыто юнитами.
describe('Player stats (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const unique = randomUUID().slice(0, 6);
  const password = 'Sup3rSecretPassw0rd!';
  const ids: string[] = [];

  async function createUser(label: string) {
    const email = `st-${label}-${unique}@example.com`;
    const username = `st${label}${unique}`.slice(0, 16);
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

  const board = async (key: string) =>
    (await request(app.getHttpServer()).get('/leaderboards').expect(200)).body[
      key
    ] as Array<{ userId: string; username: string }>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.siteSetting.upsert({
      where: { key: 'stats.public.enabled' },
      create: { key: 'stats.public.enabled', value: 'true' },
      update: { value: 'true' },
    });
  });

  afterAll(async () => {
    if (ids.length > 0) {
      await prisma.playerStatistics.deleteMany({
        where: { userId: { in: ids } },
      });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    if (app) await app.close();
  });

  it('GET /leaderboards: раздел включён, «Покупок» в ответе нет', async () => {
    const res = await request(app.getHttpServer())
      .get('/leaderboards')
      .expect(200);
    expect(res.body.enabled).toBe(true);
    expect(Object.keys(res.body).sort()).toEqual([
      'achievements',
      'coins',
      'enabled',
      'kills',
      'playtime',
    ]);
    expect(res.body).not.toHaveProperty('purchases');
  });

  it('смена приватности через API сразу убирает игрока из рейтинга (кэш сброшен)', async () => {
    const player = await createUser('rank');
    await prisma.playerStatistics.create({
      // Ниже, чем 2_000_000_000 в gamification: тот набор ждёт первое место.
      data: { userId: player.id, kills: 1_900_000_000, playTime: 5 },
    });
    app.get(LeaderboardsService).invalidate();
    expect((await board('kills')).some((e) => e.userId === player.id)).toBe(
      true,
    );
    // Повторный запрос — из кэша, результат тот же.
    expect((await board('kills')).some((e) => e.userId === player.id)).toBe(
      true,
    );

    await request(app.getHttpServer())
      .patch('/users/me/profile')
      .set('Authorization', player.auth)
      .send({ hideStatistics: true })
      .expect(200);
    expect((await board('kills')).some((e) => e.userId === player.id)).toBe(
      false,
    );

    await request(app.getHttpServer())
      .patch('/users/me/profile')
      .set('Authorization', player.auth)
      .send({ hideStatistics: false, profileVisibility: 'NOBODY' })
      .expect(200);
    expect((await board('kills')).some((e) => e.userId === player.id)).toBe(
      false,
    );
  });

  it('профиль: открытый — статистика с монетами, скрытая — null, закрытый — только hidden', async () => {
    const player = await createUser('prof');
    const viewer = await createUser('view');
    await prisma.playerStatistics.create({
      data: {
        userId: player.id,
        playTime: 125,
        kills: 7,
        deaths: 3,
        killDeathRatio: 2.33,
        coins: 11,
        lastServer: 'secret-lobby',
      },
    });
    const open = await request(app.getHttpServer())
      .get(`/users/${player.username}/summary`)
      .expect(200);
    expect(open.body.statisticsEnabled).toBe(true);
    expect(open.body.statistics).toMatchObject({ kills: 7, coins: 11 });
    expect(JSON.stringify(open.body)).not.toContain('secret-lobby');

    await request(app.getHttpServer())
      .patch('/users/me/profile')
      .set('Authorization', player.auth)
      .send({ hideStatistics: true })
      .expect(200);
    const hidden = await request(app.getHttpServer())
      .get(`/users/${player.username}/summary`)
      .set('Authorization', viewer.auth)
      .expect(200);
    expect(hidden.body).toMatchObject({
      statistics: null,
      statisticsHidden: true,
    });
    expect(JSON.stringify(hidden.body)).not.toContain('"kills"');

    await request(app.getHttpServer())
      .patch('/users/me/profile')
      .set('Authorization', player.auth)
      .send({ hideStatistics: false, profileVisibility: 'NOBODY' })
      .expect(200);
    const closed = await request(app.getHttpServer())
      .get(`/users/${player.username}/summary`)
      .set('Authorization', viewer.auth)
      .expect(200);
    expect(closed.body).toEqual({ username: player.username, hidden: true });
  });
});
