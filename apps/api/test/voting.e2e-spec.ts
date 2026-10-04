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

describe('Voting (e2e)', () => {
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
    const email = `voting-${label}-${unique}@example.com`;
    const username = `voting${label}${unique}`
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

    const role = await createRole(`voting-admin-${unique}`, 10);
    await grantRole(admin.id, role.id);
    await grantPermissions(role.id, [
      'voting.sites.view',
      'voting.sites.create',
      'voting.sites.edit',
      'voting.sites.delete',
      'voting.sites.rotate_secret',
    ]);
  }, 30_000);

  afterAll(async () => {
    if (alice && admin) {
      await prisma.playerVote.deleteMany({
        where: { site: { slug: { startsWith: `e2e-${unique}` } } },
      });
      await prisma.voteSite.deleteMany({
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
  const slug = `e2e-${unique}-mcsl`;
  let siteId: string;
  let secret: string;

  it('admin: создание vote-сайта требует voting.sites.create, секрет возвращается один раз', async () => {
    await request(app.getHttpServer())
      .post('/admin/voting/sites')
      .set('Authorization', auth(alice))
      .send({
        slug,
        name: 'MC Server List',
        url: 'https://example.com/vote',
        cooldownHours: 24,
        rewardCoins: 50,
      })
      .expect(403);

    const res = await request(app.getHttpServer())
      .post('/admin/voting/sites')
      .set('Authorization', auth(admin))
      .send({
        slug,
        name: 'MC Server List',
        url: 'https://example.com/vote',
        cooldownHours: 24,
        rewardCoins: 50,
      })
      .expect(201);
    siteId = res.body.site.id;
    secret = res.body.secret;
    expect(typeof secret).toBe('string');
    expect(res.body.site.webhookSecretHash).toBeUndefined();
  });

  it('overview: публично виден сайт без секрета', async () => {
    const overview = await request(app.getHttpServer())
      .get('/voting')
      .expect(200);
    const site = overview.body.find((s: { id: string }) => s.id === siteId);
    expect(site).toBeDefined();
    expect(site.webhookSecretHash).toBeUndefined();
    expect(site.nextVoteAt).toBeNull();
  });

  it('webhook: неверный секрет и несуществующий пользователь отклоняются честно', async () => {
    const wrongSecret = await request(app.getHttpServer())
      .post(`/voting/webhook/${slug}`)
      .send({ secret: 'wrong-secret', username: alice.username })
      .expect(200);
    expect(wrongSecret.body).toEqual({
      accepted: false,
      reason: 'invalid_secret',
    });

    const noUser = await request(app.getHttpServer())
      .post(`/voting/webhook/${slug}`)
      .send({ secret, username: `no-such-user-${unique}` })
      .expect(200);
    expect(noUser.body).toEqual({ accepted: false, reason: 'user_not_found' });
  });

  it('webhook: валидный голос начисляет coins, повторный в cooldown отклоняется', async () => {
    const before = await prisma.playerStatistics.findUnique({
      where: { userId: alice.id },
    });

    const accepted = await request(app.getHttpServer())
      .post(`/voting/webhook/${slug}`)
      .send({ secret, username: alice.username })
      .expect(200);
    expect(accepted.body).toEqual({ accepted: true });

    const after = await prisma.playerStatistics.findUnique({
      where: { userId: alice.id },
    });
    expect(after?.coins ?? 0).toBe((before?.coins ?? 0) + 50);

    const again = await request(app.getHttpServer())
      .post(`/voting/webhook/${slug}`)
      .send({ secret, username: alice.username })
      .expect(200);
    expect(again.body).toEqual({ accepted: false, reason: 'cooldown' });

    const overview = await request(app.getHttpServer())
      .get('/voting')
      .set('Authorization', auth(alice))
      .expect(200);
    const site = overview.body.find((s: { id: string }) => s.id === siteId);
    expect(site.nextVoteAt).not.toBeNull();
    expect(site.canVoteNow).toBe(false);
  });

  it('admin: rotate-secret делает старый секрет недействительным', async () => {
    const rotated = await request(app.getHttpServer())
      .post(`/admin/voting/sites/${siteId}/rotate-secret`)
      .set('Authorization', auth(admin))
      .expect(201);
    const newSecret = rotated.body.secret;
    expect(newSecret).not.toBe(secret);

    await prisma.playerVote.deleteMany({ where: { siteId, userId: alice.id } });

    const withOldSecret = await request(app.getHttpServer())
      .post(`/voting/webhook/${slug}`)
      .send({ secret, username: alice.username })
      .expect(200);
    expect(withOldSecret.body.accepted).toBe(false);

    const withNewSecret = await request(app.getHttpServer())
      .post(`/voting/webhook/${slug}`)
      .send({ secret: newSecret, username: alice.username })
      .expect(200);
    expect(withNewSecret.body.accepted).toBe(true);
  });

  it('admin: список, обновление, удаление', async () => {
    const list = await request(app.getHttpServer())
      .get('/admin/voting/sites')
      .set('Authorization', auth(admin))
      .expect(200);
    expect(list.body.some((s: { id: string }) => s.id === siteId)).toBe(true);

    const updated = await request(app.getHttpServer())
      .patch(`/admin/voting/sites/${siteId}`)
      .set('Authorization', auth(admin))
      .send({ rewardCoins: 100 })
      .expect(200);
    expect(updated.body.rewardCoins).toBe(100);

    await request(app.getHttpServer())
      .delete(`/admin/voting/sites/${siteId}`)
      .set('Authorization', auth(admin))
      .expect(200);

    await request(app.getHttpServer())
      .post(`/voting/webhook/${slug}`)
      .send({ secret, username: alice.username })
      .expect(404);
  });
});
