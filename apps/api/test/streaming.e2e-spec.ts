import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';

// См. auth.e2e-spec.ts — риск конкуренции за ресурсы под полным сьютом.
jest.setTimeout(20_000);

describe('Streaming (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  const unique = randomUUID().slice(0, 8);
  const cleanupRoleSlugs: string[] = [];

  interface TestUser {
    id: string;
    accessToken: string;
    username: string;
    email: string;
  }

  async function createUser(label: string): Promise<TestUser> {
    const email = `stream-${label}-${unique}@example.com`;
    const username = `stream${label}${unique}`
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

  async function createRole(slug: string, priority: number) {
    cleanupRoleSlugs.push(slug);
    return prisma.role.create({
      data: {
        name: slug,
        slug,
        displayName: slug,
        priority,
        isSystem: false,
        isAssignable: true,
      },
    });
  }

  async function grantRole(userId: string, roleId: string) {
    await prisma.userRole.create({ data: { userId, roleId } });
    await permissions.invalidateUser(userId);
  }

  async function grantPermissions(roleId: string, keys: string[]) {
    const records = await prisma.permission.findMany({
      where: { key: { in: keys } },
    });
    await prisma.rolePermission.createMany({
      data: records.map((p) => ({ roleId, permissionId: p.id })),
    });
    await permissions.invalidateRole(roleId);
  }

  let alice: TestUser;
  let admin: TestUser;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    permissions = app.get(PermissionService);

    alice = await createUser('alice');
    admin = await createUser('admin');

    const role = await createRole(`streams-admin-${unique}`, 10);
    await grantRole(admin.id, role.id);
    await grantPermissions(role.id, [
      'streams.view',
      'streams.create',
      'streams.edit',
      'streams.delete',
      'streams.refresh',
    ]);
  }, 30_000);

  afterAll(async () => {
    if (alice && admin) {
      await prisma.streamChannel.deleteMany({
        where: { channelKey: { startsWith: `e2e-${unique}` } },
      });
      await prisma.userRole.deleteMany({
        where: { role: { slug: { in: cleanupRoleSlugs } } },
      });
      await prisma.rolePermission.deleteMany({
        where: { role: { slug: { in: cleanupRoleSlugs } } },
      });
      await prisma.role.deleteMany({
        where: { slug: { in: cleanupRoleSlugs } },
      });
      await prisma.user.deleteMany({
        where: { email: { in: [alice.email, admin.email] } },
      });
    }
    await app.close();
  }, 15_000);

  const auth = (user: TestUser) => `Bearer ${user.accessToken}`;
  const channelKey = `e2e-${unique}-channel`;
  let channelId: string;

  it('admin: создание канала требует streams.create', async () => {
    await request(app.getHttpServer())
      .post('/admin/streams')
      .set('Authorization', auth(alice))
      .send({
        platform: 'TWITCH',
        channelKey,
        channelUrl: 'https://twitch.tv/example',
        displayName: 'Example Streamer',
      })
      .expect(403);

    const res = await request(app.getHttpServer())
      .post('/admin/streams')
      .set('Authorization', auth(admin))
      .send({
        platform: 'TWITCH',
        channelKey,
        channelUrl: 'https://twitch.tv/example',
        displayName: 'Example Streamer',
        isPartner: true,
      })
      .expect(201);
    channelId = res.body.id;
    expect(res.body.isLive).toBe(false);
  });

  it('публичный список отдаёт активный канал', async () => {
    const list = await request(app.getHttpServer()).get('/streams').expect(200);
    expect(list.body.some((c: { id: string }) => c.id === channelId)).toBe(
      true,
    );
  });

  it('update не позволяет руками выставить isLive (ValidationPipe отклоняет поле вне DTO)', async () => {
    // isLive/viewerCount намеренно отсутствуют в UpdateStreamChannelDto —
    // глобальный forbidNonWhitelisted отклоняет попытку их передать (400),
    // а не молча игнорирует — так клиент явно видит, что поле недоступно.
    await request(app.getHttpServer())
      .patch(`/admin/streams/${channelId}`)
      .set('Authorization', auth(admin))
      .send({
        displayName: 'Renamed Streamer',
        isLive: true,
        viewerCount: 9999,
      })
      .expect(400);

    const updated = await request(app.getHttpServer())
      .patch(`/admin/streams/${channelId}`)
      .set('Authorization', auth(admin))
      .send({ displayName: 'Renamed Streamer' })
      .expect(200);
    expect(updated.body.displayName).toBe('Renamed Streamer');
    expect(updated.body.isLive).toBe(false);
  });

  it('refresh честно сообщает об отсутствии Twitch/YouTube credentials в этом окружении', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/streams/refresh')
      .set('Authorization', auth(admin))
      .expect(201);
    expect(res.body.refreshed).toBe(false);
    expect(typeof res.body.reason).toBe('string');
  });

  it('admin: список и удаление', async () => {
    const list = await request(app.getHttpServer())
      .get('/admin/streams')
      .set('Authorization', auth(admin))
      .expect(200);
    expect(list.body.some((c: { id: string }) => c.id === channelId)).toBe(
      true,
    );

    await request(app.getHttpServer())
      .delete(`/admin/streams/${channelId}`)
      .set('Authorization', auth(admin))
      .expect(200);

    const after = await request(app.getHttpServer())
      .get('/streams')
      .expect(200);
    expect(after.body.some((c: { id: string }) => c.id === channelId)).toBe(
      false,
    );
  });
});
