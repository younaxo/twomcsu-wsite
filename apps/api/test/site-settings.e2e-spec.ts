import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';

jest.setTimeout(20_000);

/// ADR-0066 (глобальная плашка), ADR-0067 (соцсети проекта).
/// Плашка — синглтон: тест возвращает её исходное состояние.
describe('Site settings: alert bar & social links (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  const unique = randomUUID().slice(0, 8);
  const password = 'Sup3rSecretPassw0rd!';
  const userIds: string[] = [];
  const roleIds: string[] = [];
  const linkIds: string[] = [];
  let originalAlert: Record<string, unknown> | null = null;

  async function createUser(label: string) {
    const email = `ss-${label}-${unique}@example.com`;
    const username = `ss${label}${unique}`.slice(0, 16);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ emailOrUsername: username, password })
      .expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    userIds.push(user.id);
    return { id: user.id, auth: `Bearer ${login.body.accessToken}` };
  }

  async function grant(userId: string, keys: string[]) {
    const slug = `ss-${unique}-${roleIds.length}`;
    const role = await prisma.role.create({
      data: { name: slug, slug, displayName: slug, priority: 10 },
    });
    roleIds.push(role.id);
    const records = await prisma.permission.findMany({
      where: { key: { in: keys } },
    });
    await prisma.rolePermission.createMany({
      data: records.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
    await prisma.userRole.create({ data: { userId, roleId: role.id } });
    await permissions.invalidateUser(userId);
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    permissions = app.get(PermissionService);
    originalAlert = await prisma.siteAlert.findUnique({
      where: { id: 'global' },
    });
  });

  afterAll(async () => {
    if (originalAlert) {
      const { id: _id, updatedAt: _u, ...rest } = originalAlert;
      await prisma.siteAlert.update({ where: { id: 'global' }, data: rest });
    } else {
      await prisma.siteAlert.deleteMany({ where: { id: 'global' } });
    }
    await prisma.siteSocialLink.deleteMany({ where: { id: { in: linkIds } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: roleIds } },
    });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('сезоны: права, валидация, публикация в /site/settings с серверным временем, audit', async () => {
    const plain = await createUser('sp');
    const editor = await createUser('se');
    await grant(editor.id, [
      'settings.seasonal.view',
      'settings.seasonal.edit',
    ]);
    const http = () => request(app.getHttpServer());

    await http()
      .patch('/admin/settings/seasonal')
      .set('Authorization', plain.auth)
      .send({ enabled: false })
      .expect(403);
    await http()
      .patch('/admin/settings/seasonal')
      .set('Authorization', editor.auth)
      .send({ campaigns: { unknown: { enabled: true } } })
      .expect(400);
    await http()
      .patch('/admin/settings/seasonal')
      .set('Authorization', editor.auth)
      .send({ mode: 'forced', forcedCampaignId: null })
      .expect(400);
    await http()
      .patch('/admin/settings/seasonal')
      .set('Authorization', editor.auth)
      .send({
        campaigns: {
          halloween: {
            startsAt: '2026-11-01T00:00:00Z',
            endsAt: '2026-10-01T00:00:00Z',
          },
        },
      })
      .expect(400);
    for (const effects of [
      ['fireworks'],
      ['snow', 'rain', 'sun', 'hearts'],
      'snow',
    ]) {
      await http()
        .patch('/admin/settings/seasonal')
        .set('Authorization', editor.auth)
        .send({ campaigns: { halloween: { effects } } })
        .expect(400);
    }

    const saved = await http()
      .patch('/admin/settings/seasonal')
      .set('Authorization', editor.auth)
      .send({
        enabled: true,
        mode: 'forced',
        forcedCampaignId: 'halloween',
        showEffects: false,
        effectIntensity: 3,
        campaigns: {
          'new-year': { enabled: false },
          halloween: { effects: ['leaves', 'rain', 'leaves'] },
          'womens-day': { effects: null },
        },
      })
      .expect(200);
    expect(saved.body).toMatchObject({
      mode: 'forced',
      forcedCampaignId: 'halloween',
      showEffects: false,
    });

    const pub = await http().get('/site/settings').expect(200);
    expect(pub.body.seasonal).toMatchObject({
      enabled: true,
      mode: 'forced',
      forcedCampaignId: 'halloween',
      showEffects: false,
      effectIntensity: 3,
      campaigns: {
        'new-year': { enabled: false },
        // Дубликаты убраны, null — эффекты кампании по умолчанию.
        halloween: { effects: ['leaves', 'rain'] },
        'womens-day': { effects: null },
      },
    });
    expect(
      Math.abs(Date.parse(pub.body.seasonal.serverTime) - Date.now()),
    ).toBeLessThan(60_000);

    const audit = await prisma.auditLog.findFirst({
      where: { actorId: editor.id, action: 'settings.seasonal.update' },
    });
    expect(audit).not.toBeNull();

    // Падающий эффект независимо от сезона (ADR-0090).
    const patchSeasonal = (body: Record<string, unknown>) =>
      http()
        .patch('/admin/settings/seasonal')
        .set('Authorization', editor.auth)
        .send(body);
    await patchSeasonal({ fallingMode: 'always', fallingEffect: null }).expect(
      400,
    );
    await patchSeasonal({ fallingMode: 'sometimes' }).expect(400);
    await patchSeasonal({ fallingEffect: 'confetti' }).expect(400);
    await patchSeasonal({ effectSpeed: 4 }).expect(400);
    const always = await patchSeasonal({
      fallingMode: 'always',
      fallingEffect: 'stars',
      effectSpeed: 3,
    }).expect(200);
    expect(always.body).toMatchObject({
      fallingMode: 'always',
      fallingEffect: 'stars',
      effectSpeed: 3,
      showEffects: true,
    });
    const pubAlways = await http().get('/site/settings').expect(200);
    expect(pubAlways.body.seasonal).toMatchObject({
      fallingMode: 'always',
      fallingEffect: 'stars',
      effectSpeed: 3,
    });
    // Старый клиент присылает только showEffects=false → режим off.
    const legacy = await patchSeasonal({ showEffects: false }).expect(200);
    expect(legacy.body).toMatchObject({
      fallingMode: 'off',
      showEffects: false,
    });

    // Вернуть автоматический режим, чтобы не влиять на другие наборы.
    await http()
      .patch('/admin/settings/seasonal')
      .set('Authorization', editor.auth)
      .send({
        mode: 'auto',
        forcedCampaignId: null,
        showEffects: true,
        fallingMode: 'season',
        fallingEffect: null,
        effectSpeed: 2,
        effectIntensity: 2,
        campaigns: {},
      })
      .expect(200);
  });

  it('плашка: права, валидация, публикация в /site/settings, audit', async () => {
    const plain = await createUser('pl');
    const editor = await createUser('ed');
    await grant(editor.id, ['settings.alert.view', 'settings.alert.edit']);

    await request(app.getHttpServer())
      .patch('/admin/settings/alert')
      .set('Authorization', plain.auth)
      .send({ enabled: true, message: 'x' })
      .expect(403);

    await request(app.getHttpServer())
      .patch('/admin/settings/alert')
      .set('Authorization', editor.auth)
      .send({ enabled: true, message: '' })
      .expect(400);

    await request(app.getHttpServer())
      .patch('/admin/settings/alert')
      .set('Authorization', editor.auth)
      .send({ linkUrl: 'javascript:alert(1)', linkLabel: 'x' })
      .expect(400);

    await request(app.getHttpServer())
      .patch('/admin/settings/alert')
      .set('Authorization', editor.auth)
      .send({ icon: '<svg onload=alert(1)>' })
      .expect(400);

    // Исходное состояние синглтона неизвестно — сначала выключаем.
    await request(app.getHttpServer())
      .patch('/admin/settings/alert')
      .set('Authorization', editor.auth)
      .send({ enabled: false })
      .expect(200);

    await request(app.getHttpServer())
      .patch('/admin/settings/alert')
      .set('Authorization', editor.auth)
      .send({
        enabled: true,
        variant: 'danger',
        displayStyle: 'outline',
        icon: 'wrench',
        customIcon: null,
        startsAt: null,
        endsAt: null,
        title: null,
        message: `Технические работы ${unique}`,
        linkUrl: '/status',
        linkLabel: 'Статус',
      })
      .expect(200);

    const publicSettings = await request(app.getHttpServer())
      .get('/site/settings')
      .expect(200);
    expect(publicSettings.body.alert).toEqual({
      variant: 'danger',
      displayStyle: 'outline',
      icon: 'wrench',
      customIcon: null,
      title: null,
      message: `Технические работы ${unique}`,
      linkUrl: '/status',
      linkLabel: 'Статус',
    });

    // Режим отображения — только outline/filled.
    await request(app.getHttpServer())
      .patch('/admin/settings/alert')
      .set('Authorization', editor.auth)
      .send({ displayStyle: 'glass' })
      .expect(400);

    // Свой SVG: опасный отклоняется, безопасный принимается и уходит публично.
    await request(app.getHttpServer())
      .patch('/admin/settings/alert')
      .set('Authorization', editor.auth)
      .send({ icon: 'custom', customIcon: '<svg onload="alert(1)"></svg>' })
      .expect(400);
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><circle r="4"/></svg>';
    await request(app.getHttpServer())
      .patch('/admin/settings/alert')
      .set('Authorization', editor.auth)
      .send({ icon: 'custom', customIcon: svg, displayStyle: 'filled' })
      .expect(200);
    const withSvg = await request(app.getHttpServer())
      .get('/site/settings')
      .expect(200);
    expect(withSvg.body.alert).toMatchObject({
      icon: 'custom',
      customIcon: svg,
      displayStyle: 'filled',
    });

    // Расписание по серверному времени: окно в будущем — не показывается;
    // конец раньше начала — 400.
    const future = new Date(Date.now() + 3_600_000).toISOString();
    await request(app.getHttpServer())
      .patch('/admin/settings/alert')
      .set('Authorization', editor.auth)
      .send({
        startsAt: future,
        endsAt: new Date(Date.now() + 60_000).toISOString(),
      })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/admin/settings/alert')
      .set('Authorization', editor.auth)
      .send({ startsAt: future, endsAt: null })
      .expect(200);
    const scheduled = await request(app.getHttpServer())
      .get('/site/settings')
      .expect(200);
    expect(scheduled.body.alert).toBeNull();
    await request(app.getHttpServer())
      .patch('/admin/settings/alert')
      .set('Authorization', editor.auth)
      .send({ startsAt: null })
      .expect(200);

    const enabledAudit = await prisma.auditLog.findFirst({
      where: { actorId: editor.id, action: 'settings.alert.enable' },
    });
    expect(enabledAudit?.changes).toMatchObject({
      enabled: { from: false, to: true },
    });

    await request(app.getHttpServer())
      .patch('/admin/settings/alert')
      .set('Authorization', editor.auth)
      .send({ enabled: false })
      .expect(200);
    const afterOff = await request(app.getHttpServer())
      .get('/site/settings')
      .expect(200);
    expect(afterOff.body.alert).toBeNull();
    expect(
      await prisma.auditLog.count({
        where: { actorId: editor.id, action: 'settings.alert.disable' },
      }),
    ).toBeGreaterThanOrEqual(1);
  });

  it('соцсети: домен платформы, порядок, скрытие, удаление, audit', async () => {
    const editor = await createUser('so');
    await grant(editor.id, ['settings.site.view', 'settings.site.edit']);
    const post = (body: object) =>
      request(app.getHttpServer())
        .post('/admin/settings/social-links')
        .set('Authorization', editor.auth)
        .send(body);

    await post({
      platform: 'telegram',
      url: 'https://evil.example.com/x',
    }).expect(400);
    await post({ platform: 'tiktok', url: 'http://tiktok.com/@x' }).expect(400);
    await post({ platform: 'myspace', url: 'https://myspace.com/x' }).expect(
      400,
    );

    const tiktok = await post({
      platform: 'tiktok',
      url: `https://www.tiktok.com/@e2e${unique}`,
    }).expect(201);
    const twitch = await post({
      platform: 'twitch',
      url: `https://twitch.tv/e2e${unique}`,
      title: 'Стримы',
    }).expect(201);
    linkIds.push(tiktok.body.id, twitch.body.id);

    const all = await request(app.getHttpServer())
      .get('/admin/settings/social-links')
      .set('Authorization', editor.auth)
      .expect(200);
    const ids: string[] = all.body.map((link: { id: string }) => link.id);
    const reordered = [
      twitch.body.id,
      ...ids.filter((id) => id !== twitch.body.id),
    ];
    await request(app.getHttpServer())
      .put('/admin/settings/social-links/order')
      .set('Authorization', editor.auth)
      .send({ ids: reordered })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/admin/settings/social-links/${tiktok.body.id}`)
      .set('Authorization', editor.auth)
      .send({ isEnabled: false })
      .expect(200);

    const publicSettings = await request(app.getHttpServer())
      .get('/site/settings')
      .expect(200);
    const publicIds = publicSettings.body.socialLinks.map(
      (l: { id: string }) => l.id,
    );
    expect(publicIds[0]).toBe(twitch.body.id);
    expect(publicIds).not.toContain(tiktok.body.id);

    await request(app.getHttpServer())
      .delete(`/admin/settings/social-links/${tiktok.body.id}`)
      .set('Authorization', editor.auth)
      .expect(200);
    const actions = await prisma.auditLog.findMany({
      where: { actorId: editor.id, action: { startsWith: 'settings.social.' } },
      select: { action: true },
    });
    expect(actions.map((a) => a.action).sort()).toEqual([
      'settings.social.create',
      'settings.social.create',
      'settings.social.delete',
      'settings.social.reorder',
      'settings.social.update',
    ]);
  });
});
