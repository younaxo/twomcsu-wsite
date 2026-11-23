import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';

jest.setTimeout(60_000);

/// Q73: поиск игроков по нику — только открытые профили.
describe('Users search (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const unique = randomUUID().replace(/-/g, '').slice(0, 6);
  const ids: string[] = [];

  async function makeUser(
    label: string,
    data: {
      profileVisibility?: 'EVERYONE' | 'FRIENDS_ONLY' | 'NOBODY';
      isBanned?: boolean;
    } = {},
  ) {
    const username = `${label}${unique}`.slice(0, 16);
    const position = await prisma.position.findFirstOrThrow({
      where: { isDefault: true },
      select: { id: true },
    });
    const user = await prisma.user.create({
      data: {
        email: `srch-${label}-${unique}@example.com`,
        username,
        tag: `${username}#9999`,
        discriminator: 9999,
        positionId: position.id,
        password: 'x',
        ...data,
      },
      select: { id: true },
    });
    ids.push(user.id);
    return username;
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

  afterEach(() => {
    const storage = app.get<{ storage: Record<string, unknown> }>(
      ThrottlerStorage,
    );
    for (const key of Object.keys(storage.storage)) delete storage.storage[key];
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  const search = (q: string, extra = '') =>
    request(app.getHttpServer()).get(
      `/users/search?q=${encodeURIComponent(q)}${extra}`,
    );

  it('находит открытый профиль без учёта регистра и отдаёт только публичные поля', async () => {
    const open = await makeUser('Open');
    const res = await search(open.toUpperCase()).expect(200);
    const found = res.body.items.find(
      (i: { username: string }) => i.username === open,
    );
    expect(found).toBeDefined();
    expect(Object.keys(found).sort()).toEqual(['avatar', 'tag', 'username']);
    expect(JSON.stringify(res.body)).not.toContain('example.com');
  });

  it('не выдаёт закрытые, «только друзьям» и заблокированные профили', async () => {
    const hidden = await makeUser('Nobody', { profileVisibility: 'NOBODY' });
    const friends = await makeUser('Friend', {
      profileVisibility: 'FRIENDS_ONLY',
    });
    const banned = await makeUser('Banned', { isBanned: true });
    for (const name of [hidden, friends, banned]) {
      const res = await search(name).expect(200);
      expect(
        res.body.items.map((i: { username: string }) => i.username),
      ).not.toContain(name);
    }
  });

  it('короткий запрос (менее 2 символов) — 400, лимит выше 20 — 400', async () => {
    await search('a').expect(400);
    await search(' a ').expect(400);
    await search('ab', '&limit=21').expect(400);
  });

  it('% и _ не работают как шаблоны', async () => {
    await makeUser('Wild');
    const res = await search('%%').expect(200);
    expect(res.body.items).toEqual([]);
  });

  it('частота ограничена: после 30 запросов в минуту — 429', async () => {
    let last = 200;
    for (let i = 0; i < 32; i++) {
      last = (await search('zz')).status;
      if (last === 429) break;
    }
    expect(last).toBe(429);
  });
});
