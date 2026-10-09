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

describe('Gamification (e2e)', () => {
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
    const email = `gf-${label}-${unique}@example.com`;
    const username = `gf${label}${unique}`
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

  let admin: TestUser;
  let alice: TestUser;
  let bob: TestUser;

  const friendsAchievementSlug = `e2e-${unique}-friends`;
  const secretAchievementSlug = `e2e-${unique}-secret`;
  const manualAchievementSlug = `e2e-${unique}-manual`;
  const awardSlug = `e2e-${unique}-award`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    permissions = app.get(PermissionService);

    admin = await createUser('admin');
    alice = await createUser('alice');
    bob = await createUser('bob');

    const adminRole = await createRole(`gamification-admin-${unique}`, 20);
    await grantRole(admin.id, adminRole.id);
    await grantPermissions(adminRole.id, [
      'achievements.view',
      'achievements.create',
      'achievements.edit',
      'achievements.delete',
      'achievements.check_all_users.create',
      'awards.view',
      'awards.create',
      'awards.edit',
      'awards.delete',
      'users.achievements',
      'users.achievements.grant',
      'users.awards',
      'users.badges',
      'media_requests.view',
      'media_requests.edit',
    ]);
  }, 30_000);

  afterAll(async () => {
    await prisma.userAchievement.deleteMany({
      where: { achievement: { slug: { startsWith: `e2e-${unique}` } } },
    });
    await prisma.achievement.deleteMany({
      where: { slug: { startsWith: `e2e-${unique}` } },
    });
    await prisma.userAward.deleteMany({
      where: { award: { slug: awardSlug } },
    });
    await prisma.award.deleteMany({ where: { slug: awardSlug } });
    await prisma.userBadge.deleteMany({ where: { userId: alice.id } });
    await prisma.mediaBadgeRequest.deleteMany({ where: { userId: alice.id } });
    await prisma.userMediaBadge.deleteMany({ where: { userId: alice.id } });
    await prisma.friendship.deleteMany({
      where: { OR: [{ requesterId: alice.id }, { requesterId: bob.id }] },
    });
    await prisma.playerStatistics.deleteMany({
      where: { userId: { in: [alice.id, bob.id] } },
    });
    await prisma.userRole.deleteMany({
      where: { role: { slug: { in: cleanupRoleSlugs } } },
    });
    await prisma.rolePermission.deleteMany({
      where: { role: { slug: { in: cleanupRoleSlugs } } },
    });
    await prisma.role.deleteMany({ where: { slug: { in: cleanupRoleSlugs } } });
    await prisma.auditLog.deleteMany({
      where: {
        actor: { email: { in: [admin.email, alice.email, bob.email] } },
      },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [admin.email, alice.email, bob.email] } },
    });
    await app.close();
  }, 20_000);

  const auth = (user: TestUser) => `Bearer ${user.accessToken}`;

  let friendsAchievementId: string;
  let secretAchievementId: string;
  let manualAchievementId: string;

  it('admin: создание достижений разных типов условий требует permission', async () => {
    await request(app.getHttpServer())
      .post('/admin/achievements')
      .set('Authorization', auth(alice))
      .send({
        slug: friendsAchievementSlug,
        name: 'Дружелюбный',
        description: 'Добавьте 1 друга',
        iconUrl: 'https://example.com/icon.png',
        category: 'SOCIAL',
        rarity: 'COMMON',
        conditionType: 'FRIENDS_COUNT',
        conditionValue: 1,
      })
      .expect(403);

    const friendsCreated = await request(app.getHttpServer())
      .post('/admin/achievements')
      .set('Authorization', auth(admin))
      .send({
        slug: friendsAchievementSlug,
        name: 'Дружелюбный',
        description: 'Добавьте 1 друга',
        iconUrl: 'https://example.com/icon.png',
        category: 'SOCIAL',
        rarity: 'COMMON',
        conditionType: 'FRIENDS_COUNT',
        conditionValue: 1,
      })
      .expect(201);
    friendsAchievementId = friendsCreated.body.id;

    const secretCreated = await request(app.getHttpServer())
      .post('/admin/achievements')
      .set('Authorization', auth(admin))
      .send({
        slug: secretAchievementSlug,
        name: 'Тайный коллекционер',
        description: 'Купите 100 товаров (секретное условие)',
        iconUrl: 'https://example.com/icon2.png',
        category: 'SPECIAL',
        rarity: 'LEGENDARY',
        isSecret: true,
        conditionType: 'PURCHASES_COUNT',
        conditionValue: 100,
      })
      .expect(201);
    secretAchievementId = secretCreated.body.id;

    const manualCreated = await request(app.getHttpServer())
      .post('/admin/achievements')
      .set('Authorization', auth(admin))
      .send({
        slug: manualAchievementSlug,
        name: 'Особая заслуга',
        description: 'Выдаётся вручную модератором',
        iconUrl: 'https://example.com/icon3.png',
        category: 'SPECIAL',
        rarity: 'EPIC',
        conditionType: 'MANUAL',
      })
      .expect(201);
    manualAchievementId = manualCreated.body.id;
  });

  it('публичный список: секретное достижение скрыто, пока не разблокировано', async () => {
    const list = await request(app.getHttpServer())
      .get('/achievements')
      .set('Authorization', auth(alice))
      .expect(200);
    expect(
      list.body.some(
        (a: { slug: string }) => a.slug === friendsAchievementSlug,
      ),
    ).toBe(true);
    expect(
      list.body.some((a: { slug: string }) => a.slug === secretAchievementSlug),
    ).toBe(false);
  });

  it('check-all-users: реально считает FRIENDS_COUNT по дружбе и разблокирует достижение', async () => {
    await prisma.friendship.create({
      data: {
        requesterId: alice.id,
        addresseeId: bob.id,
        status: 'ACCEPTED',
        acceptedAt: new Date(),
      },
    });

    const result = await request(app.getHttpServer())
      .post('/admin/achievements/check-all-users')
      .set('Authorization', auth(admin))
      .expect(201);
    expect(result.body.unlocksGranted).toBeGreaterThanOrEqual(1);

    const mine = await request(app.getHttpServer())
      .get('/users/me/achievements')
      .set('Authorization', auth(alice))
      .expect(200);
    const unlocked = mine.body.items.find(
      (i: { achievement: { slug: string } }) =>
        i.achievement.slug === friendsAchievementSlug,
    );
    expect(unlocked.isCompleted).toBe(true);
    expect(unlocked.currentProgress).toBeGreaterThanOrEqual(1);

    const achievement = await prisma.achievement.findUniqueOrThrow({
      where: { id: friendsAchievementId },
    });
    expect(achievement.unlockedCount).toBeGreaterThanOrEqual(1);
  });

  it('showcase: нельзя добавить незавершённое достижение, завершённое — можно', async () => {
    await request(app.getHttpServer())
      .post('/users/me/achievements/showcase')
      .set('Authorization', auth(alice))
      .send({ achievementIds: [secretAchievementId] })
      .expect(400);

    const showcased = await request(app.getHttpServer())
      .post('/users/me/achievements/showcase')
      .set('Authorization', auth(alice))
      .send({ achievementIds: [friendsAchievementId] })
      .expect(201);
    expect(
      showcased.body.showcased.some(
        (a: { slug: string }) => a.slug === friendsAchievementSlug,
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .delete(`/users/me/achievements/showcase/${friendsAchievementId}`)
      .set('Authorization', auth(alice))
      .expect(200);
  });

  it('модератор: ручная выдача секретного достижения делает его видимым', async () => {
    await request(app.getHttpServer())
      .post(
        `/moderation/users/${bob.id}/achievements/${secretAchievementId}/grant`,
      )
      .set('Authorization', auth(admin))
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/achievements')
      .set('Authorization', auth(bob))
      .expect(200);
    expect(
      list.body.some((a: { slug: string }) => a.slug === secretAchievementSlug),
    ).toBe(true);

    await request(app.getHttpServer())
      .delete(`/moderation/users/${bob.id}/achievements/${secretAchievementId}`)
      .set('Authorization', auth(admin))
      .expect(200);
  });

  it('MANUAL достижение не продвигается check-all-users, только ручной выдачей', async () => {
    await request(app.getHttpServer())
      .post('/admin/achievements/check-all-users')
      .set('Authorization', auth(admin))
      .expect(201);
    const before = await prisma.userAchievement.findUnique({
      where: {
        userId_achievementId: {
          userId: alice.id,
          achievementId: manualAchievementId,
        },
      },
    });
    expect(before).toBeNull();

    await request(app.getHttpServer())
      .post(
        `/moderation/users/${alice.id}/achievements/${manualAchievementId}/grant`,
      )
      .set('Authorization', auth(admin))
      .expect(201);
    const after = await prisma.userAchievement.findUnique({
      where: {
        userId_achievementId: {
          userId: alice.id,
          achievementId: manualAchievementId,
        },
      },
    });
    expect(after?.isCompleted).toBe(true);
  });

  it('achievements/stats: публичная сводка', async () => {
    const stats = await request(app.getHttpServer())
      .get('/achievements/stats')
      .expect(200);
    expect(stats.body.total).toBeGreaterThanOrEqual(3);
  });

  let awardId: string;

  it('awards: CRUD админом, публичный список активных, выдача/отзыв пользователю', async () => {
    const created = await request(app.getHttpServer())
      .post('/admin/awards')
      .set('Authorization', auth(admin))
      .send({
        name: 'E2E Награда',
        slug: awardSlug,
        iconUrl: 'https://example.com/award.png',
      })
      .expect(201);
    awardId = created.body.id;

    const publicList = await request(app.getHttpServer())
      .get('/awards')
      .expect(200);
    expect(
      publicList.body.some((a: { slug: string }) => a.slug === awardSlug),
    ).toBe(true);

    await request(app.getHttpServer())
      .post(`/admin/users/${bob.id}/awards/${awardId}`)
      .set('Authorization', auth(admin))
      .expect(201);

    const userAward = await prisma.userAward.findUnique({
      where: { userId_awardId: { userId: bob.id, awardId } },
    });
    expect(userAward?.grantedBy).toBe(admin.id);

    await request(app.getHttpServer())
      .post(`/admin/users/${bob.id}/awards/${awardId}`)
      .set('Authorization', auth(admin))
      .expect(409);

    await request(app.getHttpServer())
      .delete(`/admin/users/${bob.id}/awards/${awardId}`)
      .set('Authorization', auth(admin))
      .expect(200);
  });

  it('badges: выдача/список/отзыв бейджа администратором', async () => {
    await request(app.getHttpServer())
      .post(`/admin/users/${alice.id}/badges`)
      .set('Authorization', auth(admin))
      .send({ type: 'VERIFIED' })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`/admin/users/${alice.id}/badges`)
      .set('Authorization', auth(admin))
      .expect(200);
    expect(list.body.some((b: { type: string }) => b.type === 'VERIFIED')).toBe(
      true,
    );

    await request(app.getHttpServer())
      .delete(`/admin/users/${alice.id}/badges/VERIFIED`)
      .set('Authorization', auth(admin))
      .expect(200);
  });

  it('media-request: пользователь создаёт заявку, админ одобряет — выдаётся UserMediaBadge', async () => {
    const created = await request(app.getHttpServer())
      .post('/users/me/media-request')
      .set('Authorization', auth(alice))
      .send({
        mediaGroup: 'YOUTUBE',
        channelUrl: 'https://youtube.com/@e2e-test',
      })
      .expect(201);
    const requestId = created.body.id;

    const pending = await request(app.getHttpServer())
      .get('/admin/media-requests')
      .set('Authorization', auth(admin))
      .expect(200);
    expect(pending.body.some((r: { id: string }) => r.id === requestId)).toBe(
      true,
    );

    await request(app.getHttpServer())
      .patch(`/admin/media-requests/${requestId}`)
      .set('Authorization', auth(admin))
      .send({ status: 'APPROVED' })
      .expect(200);

    const mine = await request(app.getHttpServer())
      .get('/users/me/media-requests')
      .set('Authorization', auth(alice))
      .expect(200);
    expect(
      mine.body.find((r: { id: string }) => r.id === requestId).status,
    ).toBe('APPROVED');

    const mediaBadge = await prisma.userMediaBadge.findUnique({
      where: { userId_mediaGroup: { userId: alice.id, mediaGroup: 'YOUTUBE' } },
    });
    expect(mediaBadge?.isApproved).toBe(true);
  });

  it('leaderboards: реальный рейтинг по PlayerStatistics', async () => {
    await prisma.playerStatistics.create({
      data: { userId: bob.id, kills: 500, playTime: 1000 },
    });

    const leaderboards = await request(app.getHttpServer())
      .get('/leaderboards')
      .expect(200);
    expect(
      leaderboards.body.kills.some(
        (e: { userId: string }) => e.userId === bob.id,
      ),
    ).toBe(true);
    expect(
      leaderboards.body.playtime.some(
        (e: { userId: string }) => e.userId === bob.id,
      ),
    ).toBe(true);
  });
});
