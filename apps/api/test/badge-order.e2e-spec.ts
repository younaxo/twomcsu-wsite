import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';

jest.setTimeout(30_000);

/// J-07-6: порядок бейджей/наград и выбранный бейдж у ника.
describe('Badge order and display badge (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const unique = randomUUID().slice(0, 6);
  const password = 'Sup3rSecretPassw0rd!';
  const awardIds: string[] = [];
  const userIds: string[] = [];

  async function createUser(label: string) {
    const email = `bo-${label}-${unique}@example.com`;
    const username = `bo${label}${unique}`.slice(0, 16);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ emailOrUsername: username, password })
      .expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    userIds.push(user.id);
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
    await prisma.award.deleteMany({ where: { id: { in: awardIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('бейджи: порядок, ошибки, выбранный бейдж, публичные поля', async () => {
    const me = await createUser('a');
    const other = await createUser('b');
    const b1 = await prisma.userBadge.create({
      data: { userId: me.id, type: 'VERIFIED' },
    });
    const b2 = await prisma.userBadge.create({
      data: { userId: me.id, type: 'PROJECT_TEAM' },
    });
    const expired = await prisma.userBadge.create({
      data: {
        userId: me.id,
        type: 'LEADERSHIP',
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const foreign = await prisma.userBadge.create({
      data: { userId: other.id, type: 'VERIFIED' },
    });
    const put = (path: string, body: object) =>
      request(app.getHttpServer())
        .put(path)
        .set('Authorization', me.auth)
        .send(body);

    await put('/users/me/badges/order', { ids: [b2.id, b1.id] }).expect(200);
    const list = await request(app.getHttpServer())
      .get('/users/me/badges')
      .set('Authorization', me.auth)
      .expect(200);
    expect(list.body.map((b: { id: string }) => b.id)).toEqual([b2.id, b1.id]);

    for (const ids of [
      [b1.id],
      [b1.id, b1.id],
      [b1.id, b2.id, expired.id],
      [b1.id, foreign.id],
    ]) {
      await put('/users/me/badges/order', { ids }).expect(400);
    }
    await put('/users/me/badges/order', {}).expect(400);
    await request(app.getHttpServer())
      .put('/users/me/badges/order')
      .send({ ids: [] })
      .expect(401);
    const untouched = await prisma.userBadge.findUniqueOrThrow({
      where: { id: foreign.id },
    });
    expect(untouched.order).toBe(0);

    await put('/users/me/display-badge', { userBadgeId: foreign.id }).expect(
      400,
    );
    await put('/users/me/display-badge', { userBadgeId: expired.id }).expect(
      400,
    );
    await put('/users/me/display-badge', {}).expect(400);
    const set = await put('/users/me/display-badge', {
      userBadgeId: b1.id,
    }).expect(200);
    expect(set.body.displayBadge).toEqual({ id: b1.id, type: 'VERIFIED' });

    const pub = await request(app.getHttpServer())
      .get(`/users/${me.username}/public`)
      .expect(200);
    expect(pub.body.displayBadge).toEqual({ id: b1.id, type: 'VERIFIED' });
    const sum = await request(app.getHttpServer())
      .get(`/users/${me.username}/summary`)
      .expect(200);
    expect(sum.body.badges).toEqual(['PROJECT_TEAM', 'VERIFIED']);
    expect(sum.body.displayBadge).toEqual({ id: b1.id, type: 'VERIFIED' });

    const cleared = await put('/users/me/display-badge', {
      userBadgeId: null,
    }).expect(200);
    expect(cleared.body.displayBadge).toBeNull();
    const pub2 = await request(app.getHttpServer())
      .get(`/users/${me.username}/public`)
      .expect(200);
    expect(pub2.body.displayBadge).toBeNull();
  });

  it('награды: порядок отражается в витрине, чужие и дубли — 400', async () => {
    const me = await createUser('c');
    const other = await createUser('d');
    const mk = async (n: number) => {
      const a = await prisma.award.create({
        data: { name: `A${n}`, slug: `bo-${unique}-${n}`, iconUrl: '/x.png' },
      });
      awardIds.push(a.id);
      return a;
    };
    const a1 = await mk(1);
    const a2 = await mk(2);
    const a3 = await mk(3);
    const u1 = await prisma.userAward.create({
      data: { userId: me.id, awardId: a1.id },
    });
    const u2 = await prisma.userAward.create({
      data: { userId: me.id, awardId: a2.id },
    });
    const foreign = await prisma.userAward.create({
      data: { userId: other.id, awardId: a3.id },
    });
    const put = (ids: string[]) =>
      request(app.getHttpServer())
        .put('/users/me/awards/order')
        .set('Authorization', me.auth)
        .send({ ids });

    await put([u2.id, u1.id]).expect(200);
    const showcase = await request(app.getHttpServer())
      .get(`/users/${me.username}/showcase`)
      .expect(200);
    expect(showcase.body.awards.map((a: { id: string }) => a.id)).toEqual([
      u2.id,
      u1.id,
    ]);

    await put([u1.id]).expect(400);
    await put([u1.id, u1.id]).expect(400);
    await put([u1.id, foreign.id]).expect(400);
    const untouched = await prisma.userAward.findUniqueOrThrow({
      where: { id: foreign.id },
    });
    expect(untouched.order).toBe(0);
  });
});
