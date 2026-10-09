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

describe('Events (e2e)', () => {
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
    const email = `events-${label}-${unique}@example.com`;
    const username = `events${label}${unique}`
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
  let bob: TestUser;
  let organizer: TestUser;

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
    bob = await createUser('bob');
    organizer = await createUser('organizer');

    const role = await createRole(`events-organizer-${unique}`, 10);
    await grantRole(organizer.id, role.id);
    await grantPermissions(role.id, [
      'events.view',
      'events.create',
      'events.edit',
      'events.publish',
      'events.cancel',
      'events.delete',
    ]);
  }, 30_000);

  afterAll(async () => {
    if (alice && bob && organizer) {
      await prisma.calendarEvent.deleteMany({
        where: { slug: { startsWith: `e2e-${unique}` } },
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
      await prisma.auditLog.deleteMany({
        where: {
          actor: { email: { in: [alice.email, bob.email, organizer.email] } },
        },
      });
      await prisma.user.deleteMany({
        where: { email: { in: [alice.email, bob.email, organizer.email] } },
      });
    }
    await app.close();
  }, 15_000);

  const auth = (user: TestUser) => `Bearer ${user.accessToken}`;
  const slug = `e2e-${unique}-lan-party`;
  let eventId: string;
  const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  it('admin: создание события требует events.create', async () => {
    await request(app.getHttpServer())
      .post('/admin/events')
      .set('Authorization', auth(alice))
      .send({
        slug,
        title: 'LAN-party',
        description: 'Сбор игроков',
        category: 'COMMUNITY',
        startsAt,
      })
      .expect(403);

    const res = await request(app.getHttpServer())
      .post('/admin/events')
      .set('Authorization', auth(organizer))
      .send({
        slug,
        title: 'LAN-party',
        description: 'Сбор игроков',
        category: 'COMMUNITY',
        startsAt,
        maxParticipants: 1,
      })
      .expect(201);
    eventId = res.body.id;
    expect(res.body.status).toBe('DRAFT');
  });

  it('DRAFT недоступен публично (404)', async () => {
    await request(app.getHttpServer()).get(`/events/${slug}`).expect(404);
  });

  it('публикация делает событие видимым, участие с лимитом работает', async () => {
    await request(app.getHttpServer())
      .post(`/admin/events/${eventId}/publish`)
      .set('Authorization', auth(organizer))
      .expect(201);

    const got = await request(app.getHttpServer())
      .get(`/events/${slug}`)
      .expect(200);
    expect(got.body.id).toBe(eventId);

    await request(app.getHttpServer())
      .post(`/events/${eventId}/attendance`)
      .set('Authorization', auth(alice))
      .send({ status: 'GOING' })
      .expect(201);

    // maxParticipants=1, alice уже GOING -> bob получает 409.
    await request(app.getHttpServer())
      .post(`/events/${eventId}/attendance`)
      .set('Authorization', auth(bob))
      .send({ status: 'GOING' })
      .expect(409);

    const mine = await request(app.getHttpServer())
      .get('/events/mine')
      .set('Authorization', auth(alice))
      .expect(200);
    expect(mine.body.some((e: { id: string }) => e.id === eventId)).toBe(true);

    await request(app.getHttpServer())
      .delete(`/events/${eventId}/attendance`)
      .set('Authorization', auth(alice))
      .expect(200);

    // После выхода alice лимит свободен — bob теперь может пойти.
    await request(app.getHttpServer())
      .post(`/events/${eventId}/attendance`)
      .set('Authorization', auth(bob))
      .send({ status: 'GOING' })
      .expect(201);
  });

  it('изменение расписания опубликованного события уведомляет участников (EVENT_UPDATED)', async () => {
    const newStartsAt = new Date(
      Date.now() + 10 * 24 * 60 * 60 * 1000,
    ).toISOString();
    await request(app.getHttpServer())
      .patch(`/admin/events/${eventId}`)
      .set('Authorization', auth(organizer))
      .send({ startsAt: newStartsAt })
      .expect(200);

    const notifications = await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', auth(bob))
      .expect(200);
    expect(
      notifications.body.items.some(
        (n: { type: string }) => n.type === 'EVENT_UPDATED',
      ),
    ).toBe(true);
  });

  it('admin: список с фильтрами, отмена и удаление', async () => {
    const list = await request(app.getHttpServer())
      .get('/admin/events')
      .set('Authorization', auth(organizer))
      .query({ status: 'PUBLISHED', category: 'COMMUNITY' })
      .expect(200);
    expect(list.body.items.some((e: { id: string }) => e.id === eventId)).toBe(
      true,
    );

    await request(app.getHttpServer())
      .post(`/admin/events/${eventId}/cancel`)
      .set('Authorization', auth(organizer))
      .expect(201);

    await request(app.getHttpServer()).get(`/events/${slug}`).expect(404);

    await request(app.getHttpServer())
      .delete(`/admin/events/${eventId}`)
      .set('Authorization', auth(organizer))
      .expect(200);
  });
});
