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

describe('News (e2e)', () => {
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
    const email = `news-${label}-${unique}@example.com`;
    const username = `news${label}${unique}`
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
  let editor: TestUser;

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
    editor = await createUser('editor');

    const role = await createRole(`news-editor-${unique}`, 10);
    await grantRole(editor.id, role.id);
    await grantPermissions(role.id, [
      'news.view',
      'news.create',
      'news.edit',
      'news.delete',
      'news.pin',
      'news.feature',
      'news.comments.pin',
      'news.comments.delete',
    ]);
  }, 30_000);

  afterAll(async () => {
    if (alice && bob && editor) {
      await prisma.news.deleteMany({
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
          actor: { email: { in: [alice.email, bob.email, editor.email] } },
        },
      });
      await prisma.user.deleteMany({
        where: { email: { in: [alice.email, bob.email, editor.email] } },
      });
    }
    await app.close();
  }, 15_000);

  const auth = (user: TestUser) => `Bearer ${user.accessToken}`;
  const slug = `e2e-${unique}-patch-1-0`;
  let newsId: string;

  it('admin: создание новости требует news.create', async () => {
    await request(app.getHttpServer())
      .post('/admin/news')
      .set('Authorization', auth(alice))
      .send({
        slug,
        title: 'Патч 1.0',
        content: 'Содержимое новости',
        category: 'PATCH_NOTES',
      })
      .expect(403);

    const res = await request(app.getHttpServer())
      .post('/admin/news')
      .set('Authorization', auth(editor))
      .send({
        slug,
        title: 'Патч 1.0',
        content: 'Содержимое новости версии 1.0',
        category: 'PATCH_NOTES',
        status: 'DRAFT',
        tags: ['patch', 'release'],
      })
      .expect(201);
    newsId = res.body.id;
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.tags).toHaveLength(2);
  });

  it('черновик недоступен публично (404), виден админу по id', async () => {
    await request(app.getHttpServer()).get(`/news/${slug}`).expect(404);

    await request(app.getHttpServer())
      .get(`/admin/news/${newsId}`)
      .set('Authorization', auth(editor))
      .expect(200);
  });

  it('публикация через PATCH делает новость видимой публично', async () => {
    const updated = await request(app.getHttpServer())
      .patch(`/admin/news/${newsId}`)
      .set('Authorization', auth(editor))
      .send({ status: 'PUBLISHED' })
      .expect(200);
    expect(updated.body.status).toBe('PUBLISHED');
    expect(updated.body.publishedAt).toBeDefined();

    const got = await request(app.getHttpServer())
      .get(`/news/${slug}`)
      .expect(200);
    expect(got.body.id).toBe(newsId);
    expect(got.body.viewsCount).toBeGreaterThan(0);
    expect(got.body.liked).toBe(false);
  });

  it('REST public: список/featured/latest/popular/categories/tags/rss отражают опубликованную новость', async () => {
    const list = await request(app.getHttpServer()).get('/news').expect(200);
    expect(list.body.items.some((n: { id: string }) => n.id === newsId)).toBe(
      true,
    );

    const latest = await request(app.getHttpServer())
      .get('/news/latest')
      .expect(200);
    expect(latest.body.some((n: { id: string }) => n.id === newsId)).toBe(true);

    const categories = await request(app.getHttpServer())
      .get('/news/categories')
      .expect(200);
    expect(
      categories.body.some(
        (c: { category: string }) => c.category === 'PATCH_NOTES',
      ),
    ).toBe(true);

    const tags = await request(app.getHttpServer())
      .get('/news/tags')
      .query({ search: 'patch' })
      .expect(200);
    expect(tags.body.some((t: { tag: string }) => t.tag === 'patch')).toBe(
      true,
    );

    const rss = await request(app.getHttpServer()).get('/rss/news').expect(200);
    expect(rss.text).toContain('<rss version="2.0">');
    expect(rss.text).toContain('Патч 1.0');
  });

  it('pin/feature переключают флаги, видны в публичном списке первыми', async () => {
    const pinned = await request(app.getHttpServer())
      .post(`/admin/news/${newsId}/pin`)
      .set('Authorization', auth(editor))
      .expect(201);
    expect(pinned.body.isPinned).toBe(true);

    const featured = await request(app.getHttpServer())
      .post(`/admin/news/${newsId}/feature`)
      .set('Authorization', auth(editor))
      .expect(201);
    expect(featured.body.isFeatured).toBe(true);

    const featuredList = await request(app.getHttpServer())
      .get('/news/featured')
      .expect(200);
    expect(featuredList.body.some((n: { id: string }) => n.id === newsId)).toBe(
      true,
    );

    await request(app.getHttpServer())
      .post(`/admin/news/${newsId}/unpin`)
      .set('Authorization', auth(editor))
      .expect(201);
    await request(app.getHttpServer())
      .post(`/admin/news/${newsId}/unfeature`)
      .set('Authorization', auth(editor))
      .expect(201);
  });

  it('like: toggle и уведомление автору (editor) от alice', async () => {
    const liked = await request(app.getHttpServer())
      .post(`/news/${newsId}/like`)
      .set('Authorization', auth(alice))
      .expect(201);
    expect(liked.body.liked).toBe(true);

    const notifications = await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', auth(editor))
      .expect(200);
    expect(
      notifications.body.items.some(
        (n: { type: string; fromUserId: string }) =>
          n.type === 'NEWS_LIKED' && n.fromUserId === alice.id,
      ),
    ).toBe(true);

    const unliked = await request(app.getHttpServer())
      .post(`/news/${newsId}/like`)
      .set('Authorization', auth(alice))
      .expect(201);
    expect(unliked.body.liked).toBe(false);
  });

  let commentId: string;
  let replyId: string;

  it('комментарии: создание, список, редактирование (только автор), ответ создаёт NEWS_COMMENT_REPLY', async () => {
    const created = await request(app.getHttpServer())
      .post(`/news/${slug}/comments`)
      .set('Authorization', auth(alice))
      .send({ content: `Отличный патч, @${editor.username}!` })
      .expect(201);
    commentId = created.body.id;

    const list = await request(app.getHttpServer())
      .get(`/news/${slug}/comments`)
      .expect(200);
    expect(
      list.body.items.some((c: { id: string }) => c.id === commentId),
    ).toBe(true);

    await request(app.getHttpServer())
      .patch(`/news/${slug}/comments/${commentId}`)
      .set('Authorization', auth(bob))
      .send({ content: 'чужая правка' })
      .expect(403);

    const updated = await request(app.getHttpServer())
      .patch(`/news/${slug}/comments/${commentId}`)
      .set('Authorization', auth(alice))
      .send({ content: 'Отличный патч! (ред.)' })
      .expect(200);
    expect(updated.body.isEdited).toBe(true);

    const reply = await request(app.getHttpServer())
      .post(`/news/${slug}/comments`)
      .set('Authorization', auth(bob))
      .send({ content: 'Согласен!', parentId: commentId })
      .expect(201);
    replyId = reply.body.id;

    const aliceNotifications = await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', auth(alice))
      .expect(200);
    expect(
      aliceNotifications.body.items.some(
        (n: { type: string }) => n.type === 'NEWS_COMMENT_REPLY',
      ),
    ).toBe(true);

    const editorNotifications = await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', auth(editor))
      .expect(200);
    expect(
      editorNotifications.body.items.some(
        (n: { type: string }) => n.type === 'NEWS_COMMENT_MENTION',
      ),
    ).toBe(true);
  });

  it('реакция на комментарий переключается (toggle)', async () => {
    const reacted = await request(app.getHttpServer())
      .post(`/news/${slug}/comments/${commentId}/reactions`)
      .set('Authorization', auth(bob))
      .send({ emoji: '🔥' })
      .expect(201);
    expect(reacted.body.reacted).toBe(true);

    const unreacted = await request(app.getHttpServer())
      .post(`/news/${slug}/comments/${commentId}/reactions`)
      .set('Authorization', auth(bob))
      .send({ emoji: '🔥' })
      .expect(201);
    expect(unreacted.body.reacted).toBe(false);
  });

  it('модерация: pin/unpin и удаление чужого комментария требуют permission', async () => {
    await request(app.getHttpServer())
      .patch(`/moderation/news/comments/${replyId}/pin`)
      .set('Authorization', auth(bob))
      .expect(403);

    const pinned = await request(app.getHttpServer())
      .patch(`/moderation/news/comments/${replyId}/pin`)
      .set('Authorization', auth(editor))
      .expect(200);
    expect(pinned.body.isPinned).toBe(true);

    await request(app.getHttpServer())
      .delete(`/moderation/news/comments/${replyId}`)
      .set('Authorization', auth(bob))
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/moderation/news/comments/${replyId}`)
      .set('Authorization', auth(editor))
      .expect(200);

    const list = await request(app.getHttpServer())
      .get(`/news/${slug}/comments`)
      .expect(200);
    expect(list.body.items.some((c: { id: string }) => c.id === replyId)).toBe(
      false,
    );
  });

  it('allowComments=false запрещает комментирование', async () => {
    await request(app.getHttpServer())
      .patch(`/admin/news/${newsId}`)
      .set('Authorization', auth(editor))
      .send({ allowComments: false })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/news/${slug}/comments`)
      .set('Authorization', auth(bob))
      .send({ content: 'test' })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/admin/news/${newsId}`)
      .set('Authorization', auth(editor))
      .send({ allowComments: true })
      .expect(200);
  });

  it('admin: список с фильтрами, статистика, архивация скрывает из публичного списка', async () => {
    const filtered = await request(app.getHttpServer())
      .get('/admin/news')
      .set('Authorization', auth(editor))
      .query({ status: 'PUBLISHED', category: 'PATCH_NOTES' })
      .expect(200);
    expect(
      filtered.body.items.some((n: { id: string }) => n.id === newsId),
    ).toBe(true);

    const stats = await request(app.getHttpServer())
      .get('/admin/news/stats')
      .set('Authorization', auth(editor))
      .expect(200);
    expect(stats.body.total).toBeGreaterThan(0);
    expect(stats.body.byStatus.published).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .delete(`/admin/news/${newsId}`)
      .set('Authorization', auth(editor))
      .expect(200);

    await request(app.getHttpServer()).get(`/news/${slug}`).expect(404);
  });
});
