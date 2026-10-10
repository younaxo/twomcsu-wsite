import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';

jest.setTimeout(20_000);

/// ADR-0107: публичные ответы с автором/создателем/отправителем отдают только
/// id, ник, тег и аватар — без email, IP входа, причины бана, даты рождения.
const PRIVATE_KEYS = [
  'email',
  'password',
  'lastLoginIp',
  'lastLoginAt',
  'banReason',
  'birthDate',
  'accessLevel',
  'mustChangePassword',
  'friendRequestPolicy',
  'hideEmail',
];

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, keys));
  } else if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      keys.add(key);
      collectKeys(nested, keys);
    }
  }
  return keys;
}

function expectNoPrivateFields(body: unknown, email: string) {
  expect(JSON.stringify(body)).not.toContain(email);
  const keys = collectKeys(body);
  for (const key of PRIVATE_KEYS) {
    expect({ key, present: keys.has(key) }).toEqual({ key, present: false });
  }
}

describe('Публичные поля пользователя (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const unique = randomUUID().slice(0, 8);
  const email = `pubfields-${unique}@example.com`;
  const username = `pubf${unique}`.slice(0, 16);
  const password = 'Sup3rSecretPassw0rd!';
  let userId: string;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ emailOrUsername: username, password })
      .expect(200);
    token = login.body.accessToken;
    const row = await prisma.user.update({
      where: { email },
      data: {
        lastLoginIp: '203.0.113.7',
        banReason: 'тест',
        avatar: `users/e2e/avatar/${unique}.webp`,
      },
    });
    userId = row.id;
  });

  afterAll(async () => {
    await prisma.news.deleteMany({ where: { authorId: userId } });
    await prisma.calendarEvent.deleteMany({ where: { createdById: userId } });
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('новости: автор без приватных полей', async () => {
    const slug = `pubf-news-${unique}`;
    await prisma.news.create({
      data: {
        slug,
        title: 'Тест полей автора',
        content: 'Текст',
        category: 'UPDATE',
        status: 'PUBLISHED',
        publishedAt: new Date(),
        authorId: userId,
      },
    });
    const list = await request(app.getHttpServer()).get('/news').expect(200);
    const item = list.body.items.find(
      (news: { slug: string }) => news.slug === slug,
    );
    expect(item.author).toMatchObject({ id: userId, username });
    // ADR-0115: аватар автора — URL, а не ключ хранилища.
    expect(item.author.avatar).toMatch(/^https?:\/\//);
    expectNoPrivateFields(list.body, email);
    const one = await request(app.getHttpServer())
      .get(`/news/${slug}`)
      .expect(200);
    expect(one.body.author.username).toBe(username);
    expectNoPrivateFields(one.body, email);
  });

  it('события: создатель без приватных полей', async () => {
    const slug = `pubf-event-${unique}`;
    await prisma.calendarEvent.create({
      data: {
        slug,
        title: 'Тест полей создателя',
        description: 'Описание',
        descriptionHtml: '<p>Описание</p>',
        category: 'COMMUNITY',
        status: 'PUBLISHED',
        startsAt: new Date(Date.now() + 86_400_000),
        createdById: userId,
      },
    });
    const list = await request(app.getHttpServer()).get('/events').expect(200);
    expectNoPrivateFields(list.body, email);
    const one = await request(app.getHttpServer())
      .get(`/events/${slug}`)
      .expect(200);
    expect(one.body.createdBy.username).toBe(username);
    expectNoPrivateFields(one.body, email);
  });

  it('комментарии профиля: автор без приватных полей', async () => {
    const created = await request(app.getHttpServer())
      .post(`/users/${username}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Проверка полей автора' })
      .expect(201);
    expectNoPrivateFields(created.body, email);
    const list = await request(app.getHttpServer())
      .get(`/users/${username}/comments`)
      .expect(200);
    expect(list.body.items[0].author.username).toBe(username);
    expectNoPrivateFields(list.body, email);
  });
});
