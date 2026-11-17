import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';

jest.setTimeout(30_000);

/// ADR-0168/ADR-0179, срез 2: свой инвентарь и приватность. Приёмника Bridge
/// нет, поэтому данные игрока в этой спеке отсутствуют: проверяются доступ,
/// пустой ответ, приватность по умолчанию и fail-closed без BRIDGE_ENABLED.
/// Спека статическая: в срезе 2 не запускалась.
describe('Inventory (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const unique = randomUUID().slice(0, 8);
  const password = 'Sup3rSecretPassw0rd!';
  const userIds: string[] = [];
  const http = () => request(app.getHttpServer());
  const previousBridge = process.env.BRIDGE_ENABLED;

  async function createUser(label: string) {
    const email = `inv-${label}-${unique}@example.com`;
    const username = `inv${label}${unique}`.slice(0, 16);
    await http()
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);
    const login = await http()
      .post('/auth/login')
      .send({ emailOrUsername: username, password })
      .expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    userIds.push(user.id);
    return { id: user.id, auth: `Bearer ${login.body.accessToken}` };
  }

  async function boot(bridge: string | undefined) {
    if (bridge === undefined) delete process.env.BRIDGE_ENABLED;
    else process.env.BRIDGE_ENABLED = bridge;
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  }

  afterEach(async () => {
    if (userIds.length > 0 && prisma) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      userIds.length = 0;
    }
    if (app) await app.close();
    if (previousBridge === undefined) delete process.env.BRIDGE_ENABLED;
    else process.env.BRIDGE_ENABLED = previousBridge;
  });

  describe('BRIDGE_ENABLED не задан', () => {
    it('отвечает 503 inventory_unavailable', async () => {
      await boot(undefined);
      const user = await createUser('off');
      const res = await http()
        .get('/inventory/me')
        .set('Authorization', user.auth)
        .expect(503);
      expect(JSON.stringify(res.body)).toContain('inventory_unavailable');
    });
  });

  describe('BRIDGE_ENABLED=true', () => {
    it('без токена: 401', async () => {
      await boot('true');
      await http().get('/inventory/me').expect(401);
      await http().get('/inventory/me/privacy').expect(401);
      await http().patch('/inventory/me/privacy').send({}).expect(401);
    });

    it('приватность по умолчанию «приватно»', async () => {
      await boot('true');
      const user = await createUser('priv');
      const res = await http()
        .get('/inventory/me/privacy')
        .set('Authorization', user.auth)
        .expect(200);
      expect(res.body).toMatchObject({
        inventoryPublic: false,
        enderPublic: false,
      });
      expect(res.headers['cache-control']).toContain('private');
    });

    it('Ender Chest публичен только при публичном основном инвентаре', async () => {
      await boot('true');
      const user = await createUser('ender');
      await http()
        .patch('/inventory/me/privacy')
        .set('Authorization', user.auth)
        .send({ enderPublic: true, inventoryPublic: false })
        .expect(422);
      const res = await http()
        .patch('/inventory/me/privacy')
        .set('Authorization', user.auth)
        .send({ inventoryPublic: true, enderPublic: true })
        .expect(200);
      expect(res.body).toMatchObject({
        inventoryPublic: true,
        enderPublic: true,
      });
    });

    it('нет привязки Minecraft: 404 not_found', async () => {
      await boot('true');
      const user = await createUser('nolink');
      const res = await http()
        .get('/inventory/me')
        .set('Authorization', user.auth)
        .expect(404);
      expect(JSON.stringify(res.body)).toContain('not_found');
    });

    it('привязка есть, снимков нет: 200 no_data, ETag и 304 по If-None-Match', async () => {
      await boot('true');
      const user = await createUser('me');
      await prisma.minecraftAccount.create({
        data: {
          userId: user.id,
          uuid: randomUUID(),
          name: `P${unique}`.slice(0, 16),
        },
      });
      const first = await http()
        .get('/inventory/me')
        .set('Authorization', user.auth)
        .expect(200);
      expect(first.body).toMatchObject({ state: 'no_data' });
      expect(first.headers.etag).toBeDefined();
      expect(first.headers.vary).toContain('Authorization');
      await http()
        .get('/inventory/me')
        .set('Authorization', user.auth)
        .set('If-None-Match', first.headers.etag)
        .expect(304);
    });

    it('неверный параметр server: 422 invalid_param', async () => {
      await boot('true');
      const user = await createUser('qs');
      await http()
        .get('/inventory/me?server=BAD%20SLUG!')
        .set('Authorization', user.auth)
        .expect(422);
    });
  });
});
