import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { sharp } from '../src/modules/files/sharp';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { FilesService } from '../src/modules/files/files.service';
import { StorageService } from '../src/modules/files/storage.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';

jest.setTimeout(30_000);

/// PHASE 23: загрузка через настоящий multipart, обработка sharp → AVIF,
/// локальный драйвер storage, запись File, orphan cleanup. Без моков.
describe('Files / CDN (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  let files: FilesService;
  let storage: StorageService;
  const unique = randomUUID().slice(0, 8);
  const cleanupKeys: string[] = [];
  const cleanupRoleSlugs: string[] = [];

  interface TestUser {
    id: string;
    accessToken: string;
  }

  async function createUser(label: string): Promise<TestUser> {
    const email = `fl-${label}-${unique}@example.com`;
    const username = `fl${label.slice(0, 5)}${unique}`;
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
    return { id: user.id, accessToken: loginRes.body.accessToken };
  }

  async function png(width: number, height: number): Promise<Buffer> {
    return sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 242, g: 106, b: 27 },
      },
    })
      .png()
      .toBuffer();
  }

  let alice: TestUser;
  let editor: TestUser;
  const auth = (user: TestUser) => `Bearer ${user.accessToken}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    permissions = app.get(PermissionService);
    files = app.get(FilesService);
    storage = app.get(StorageService);

    alice = await createUser('alice');
    editor = await createUser('editor');
    const slug = `news-editor-${unique}`;
    cleanupRoleSlugs.push(slug);
    const role = await prisma.role.create({
      data: {
        name: slug,
        slug,
        displayName: slug,
        priority: 20,
        isAssignable: true,
      },
    });
    const perm = await prisma.permission.findUniqueOrThrow({
      where: { key: 'news.create' },
    });
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: perm.id },
    });
    await prisma.userRole.create({
      data: { userId: editor.id, roleId: role.id },
    });
    await permissions.invalidateRole(role.id);
    await permissions.invalidateUser(editor.id);
  });

  afterAll(async () => {
    for (const key of cleanupKeys) {
      await storage.delete(key);
    }
    await prisma.file.deleteMany({
      where: { uploaderId: { in: [alice.id, editor.id] } },
    });
    await prisma.userRole.deleteMany({
      where: { userId: { in: [alice.id, editor.id] } },
    });
    await prisma.role.deleteMany({ where: { slug: { in: cleanupRoleSlugs } } });
    await prisma.user.deleteMany({
      where: { id: { in: [alice.id, editor.id] } },
    });
    await app.close();
  });

  it('аватар: PNG → AVIF 512×512, ключ в User.avatar, файл в storage, запись ATTACHED', async () => {
    const res = await request(app.getHttpServer())
      .post('/users/me/avatar')
      .set('Authorization', auth(alice))
      .attach('file', await png(900, 600), 'me.png')
      .expect(201);
    cleanupKeys.push(res.body.key);

    expect(res.body.mime).toBe('image/avif');
    expect(res.body.key).toMatch(
      new RegExp(`^users/${alice.id}/avatar/[0-9a-f-]+\\.avif$`),
    );
    expect(res.body.url).toBe(`${storage.cdnBaseUrl}/${res.body.key}`);
    expect(await storage.exists(res.body.key)).toBe(true);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: alice.id },
    });
    expect(user.avatar).toBe(res.body.key);
    const file = await prisma.file.findUniqueOrThrow({
      where: { key: res.body.key },
    });
    expect(file.status).toBe('ATTACHED');
    expect(file.ownerType).toBe('User');

    // Локальный драйвер отдаёт файл по /uploads с immutable-кешем.
    const served = await request(app.getHttpServer())
      .get(`/uploads/${res.body.key}`)
      .expect(200);
    expect(served.headers['content-type']).toContain('image/avif');
    expect(served.headers['cache-control']).toContain('immutable');
    const meta = await sharp(served.body).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  });

  it('повторная загрузка аватара удаляет предыдущий файл', async () => {
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: alice.id },
    });
    const res = await request(app.getHttpServer())
      .post('/users/me/avatar')
      .set('Authorization', auth(alice))
      .attach('file', await png(300, 300), 'new.png')
      .expect(201);
    cleanupKeys.push(res.body.key);
    expect(await storage.exists(before.avatar!)).toBe(false);
    const old = await prisma.file.findUniqueOrThrow({
      where: { key: before.avatar! },
    });
    expect(old.status).toBe('DELETED');
  });

  it('тип определяется по содержимому: текст под видом png → 415', async () => {
    await request(app.getHttpServer())
      .post('/users/me/avatar')
      .set('Authorization', auth(alice))
      .attach('file', Buffer.from('<script>alert(1)</script>'), 'fake.png')
      .expect(415);
  });

  it('news_cover требует news.create: 403 без права, 201 с правом (TEMP)', async () => {
    await request(app.getHttpServer())
      .post('/files/upload')
      .query({ type: 'news_cover' })
      .set('Authorization', auth(alice))
      .attach('file', await png(100, 100), 'c.png')
      .expect(403);

    const res = await request(app.getHttpServer())
      .post('/files/upload')
      .query({ type: 'news_cover' })
      .set('Authorization', auth(editor))
      .attach('file', await png(2000, 1000), 'c.png')
      .expect(201);
    cleanupKeys.push(res.body.key);
    expect(res.body.status).toBe('TEMP');
    expect(res.body.key).toMatch(/^news\/covers\/[0-9a-f-]+\.avif$/);
  });

  it('неизвестный type → 400, без входа → 403, аватар через /files/upload → 400', async () => {
    await request(app.getHttpServer())
      .post('/files/upload')
      .query({ type: 'anything' })
      .set('Authorization', auth(alice))
      .attach('file', await png(10, 10), 'x.png')
      .expect(400);
    await request(app.getHttpServer())
      .post('/files/upload')
      .query({ type: 'news_cover' })
      .attach('file', await png(10, 10), 'x.png')
      .expect(403);
    await request(app.getHttpServer())
      .post('/files/upload')
      .query({ type: 'avatar' })
      .set('Authorization', auth(alice))
      .attach('file', await png(10, 10), 'x.png')
      .expect(400);
  });

  it('orphan cleanup удаляет старые TEMP и DELETED, не трогая ATTACHED', async () => {
    const temp = await request(app.getHttpServer())
      .post('/files/upload')
      .query({ type: 'news_cover' })
      .set('Authorization', auth(editor))
      .attach('file', await png(50, 50), 't.png')
      .expect(201);
    await prisma.file.update({
      where: { key: temp.body.key },
      data: { createdAt: new Date(Date.now() - 2 * 24 * 3_600_000) },
    });
    const { deleted } = await files.cleanupOrphans();
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.file.findUnique({ where: { key: temp.body.key } }),
    ).toBeNull();
    expect(await storage.exists(temp.body.key)).toBe(false);

    const attached = await prisma.user.findUniqueOrThrow({
      where: { id: alice.id },
    });
    expect(await storage.exists(attached.avatar!)).toBe(true);
  });
});
