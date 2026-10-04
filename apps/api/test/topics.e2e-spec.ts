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

describe('Topics (e2e)', () => {
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
    const email = `topics-${label}-${unique}@example.com`;
    const username = `topics${label}${unique}`
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

    const role = await createRole(`topics-admin-${unique}`, 10);
    await grantRole(admin.id, role.id);
    await grantPermissions(role.id, [
      'topics.view',
      'topics.create',
      'topics.edit',
      'topics.delete',
      'topics.reorder',
      'topics.pin',
      'topics.view.admin',
    ]);
  }, 30_000);

  afterAll(async () => {
    if (alice && admin) {
      await prisma.topic.deleteMany({
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
      await prisma.user.deleteMany({
        where: { email: { in: [alice.email, admin.email] } },
      });
    }
    await app.close();
  }, 15_000);

  const auth = (user: TestUser) => `Bearer ${user.accessToken}`;
  const publicSlug = `e2e-${unique}-rules`;
  const adminSlug = `e2e-${unique}-admin-only`;
  let publicTopicId: string;
  let adminTopicId: string;

  it('admin: создание темы требует topics.create', async () => {
    await request(app.getHttpServer())
      .post('/admin/topics')
      .set('Authorization', auth(alice))
      .send({
        slug: publicSlug,
        title: 'Правила сервера',
        category: 'RULES',
        content: 'Текст правил',
      })
      .expect(403);

    const res = await request(app.getHttpServer())
      .post('/admin/topics')
      .set('Authorization', auth(admin))
      .send({
        slug: publicSlug,
        title: 'Правила сервера',
        category: 'RULES',
        visibility: 'PUBLIC',
        content: 'Текст правил',
      })
      .expect(201);
    publicTopicId = res.body.id;

    const adminRes = await request(app.getHttpServer())
      .post('/admin/topics')
      .set('Authorization', auth(admin))
      .send({
        slug: adminSlug,
        title: 'Внутренние заметки',
        category: 'ADMIN_INTERNAL',
        visibility: 'ADMIN_ONLY',
        content: 'Только для админов',
      })
      .expect(201);
    adminTopicId = adminRes.body.id;
  });

  it('PUBLIC тема видна всем, ADMIN_ONLY — 404 без permission, видна с ним', async () => {
    const got = await request(app.getHttpServer())
      .get(`/topics/${publicSlug}`)
      .expect(200);
    expect(got.body.id).toBe(publicTopicId);
    expect(got.body.views).toBeGreaterThan(0);

    await request(app.getHttpServer()).get(`/topics/${adminSlug}`).expect(404);
    await request(app.getHttpServer())
      .get(`/topics/${adminSlug}`)
      .set('Authorization', auth(alice))
      .expect(404);

    const asAdmin = await request(app.getHttpServer())
      .get(`/topics/${adminSlug}`)
      .set('Authorization', auth(admin))
      .expect(200);
    expect(asAdmin.body.id).toBe(adminTopicId);
  });

  it('список /topics скрывает ADMIN_ONLY от обычного viewer, показывает admin', async () => {
    const asAnon = await request(app.getHttpServer())
      .get('/topics')
      .expect(200);
    expect(asAnon.body.some((t: { id: string }) => t.id === adminTopicId)).toBe(
      false,
    );

    const asAdminList = await request(app.getHttpServer())
      .get('/topics')
      .set('Authorization', auth(admin))
      .expect(200);
    expect(
      asAdminList.body.some((t: { id: string }) => t.id === adminTopicId),
    ).toBe(true);
  });

  it('pin/reorder/edit работают, 404 для несуществующей темы по id', async () => {
    const pinned = await request(app.getHttpServer())
      .post(`/admin/topics/${publicTopicId}/pin`)
      .set('Authorization', auth(admin))
      .expect(201);
    expect(pinned.body.isPinned).toBe(true);

    await request(app.getHttpServer())
      .post('/admin/topics/reorder')
      .set('Authorization', auth(admin))
      .send({
        items: [
          { id: publicTopicId, order: 5 },
          { id: adminTopicId, order: 1 },
        ],
      })
      .expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/admin/topics/${publicTopicId}`)
      .set('Authorization', auth(admin))
      .send({ title: 'Правила сервера (обновлено)' })
      .expect(200);
    expect(updated.body.title).toBe('Правила сервера (обновлено)');

    await request(app.getHttpServer())
      .get('/admin/topics/non-existent-id')
      .set('Authorization', auth(admin))
      .expect(404);
  });

  it('admin: удаление темы убирает её из публичного списка', async () => {
    await request(app.getHttpServer())
      .delete(`/admin/topics/${adminTopicId}`)
      .set('Authorization', auth(admin))
      .expect(200);

    await request(app.getHttpServer())
      .get(`/topics/${adminSlug}`)
      .set('Authorization', auth(admin))
      .expect(404);
  });
});
