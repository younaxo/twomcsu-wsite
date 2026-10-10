import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';
import {
  LegacyModuleFlags,
  MaintenanceState,
  ModuleState,
  PrismaSiteStatusStore,
  SiteStatusStore,
} from '../src/modules/system/site-status.store';
import { SiteStatusService } from '../src/modules/system/site-status.service';

jest.setTimeout(30_000);

/// Хранилище в памяти: модули и техработы меняются только в этом приложении —
/// параллельные e2e-наборы (свой процесс, своя БД-запись) не затрагиваются.
class MemoryStore extends SiteStatusStore {
  modules = new Map<string, ModuleState>();
  maintenance: MaintenanceState | null = null;
  async getModules() {
    return new Map(this.modules);
  }
  async setModule(
    key: string,
    state: { isEnabled: boolean; reason: string | null },
  ) {
    this.modules.set(key, {
      ...state,
      disabledAt: state.isEnabled ? null : new Date(),
    });
  }
  async getMaintenance() {
    return this.maintenance;
  }
  async setMaintenance(
    state: Omit<MaintenanceState, 'enabledAt' | 'updatedAt'>,
  ) {
    this.maintenance = { ...state, enabledAt: null, updatedAt: new Date() };
  }
  async getLegacyFlags(): Promise<LegacyModuleFlags> {
    return {};
  }
}

/// ADR-0082: модули сайта и техработы — права, уровни модулей, 503 с кодом,
/// обход для сотрудников, ядро и вебхуки не закрываются, аудит.
describe('System: modules & maintenance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  const store = new MemoryStore();
  const unique = randomUUID().slice(0, 8);
  const password = 'Sup3rSecretPassw0rd!';
  const userIds: string[] = [];
  const roleIds: string[] = [];
  const http = () => request(app.getHttpServer());

  async function createUser(label: string) {
    const email = `sy-${label}-${unique}@example.com`;
    const username = `sy${label}${unique}`.slice(0, 16);
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
    return { id: user.id, username, auth: `Bearer ${login.body.accessToken}` };
  }

  async function grant(userId: string, keys: string[]) {
    const slug = `sy-${unique}-${roleIds.length}`;
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

  const maintenance = (patch: Record<string, unknown>) => ({
    enabled: true,
    scope: 'full',
    modules: [],
    title: 'Технические работы',
    message: 'Обновляем сервер.',
    reason: 'Миграция БД',
    startsAt: null,
    estimatedEnd: null,
    ...patch,
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SiteStatusStore)
      .useValue(store)
      .compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    permissions = app.get(PermissionService);
  });

  afterAll(async () => {
    await prisma.moduleStatus.deleteMany({
      where: { module: { startsWith: `e2e-${unique}` } },
    });
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

  it('модули: реестр, уровни, 503 MODULE_DISABLED, обход, /site/status и /site/settings, аудит', async () => {
    const plain = await createUser('p');
    const manager = await createUser('m');
    const staff = await createUser('s');
    await grant(manager.id, ['system.modules.view', 'system.modules.manage']);
    await grant(staff.id, ['system.maintenance.bypass']);

    await http()
      .get('/admin/system/modules')
      .set('Authorization', plain.auth)
      .expect(403);
    const list = await http()
      .get('/admin/system/modules')
      .set('Authorization', manager.auth)
      .expect(200);
    const byKey = new Map(
      (list.body as Array<{ key: string; tier: string; enabled: boolean }>).map(
        (item) => [item.key, item],
      ),
    );
    expect(byKey.get('auth')).toMatchObject({ tier: 'core', enabled: true });
    expect(byKey.get('store')).toMatchObject({
      tier: 'protected',
      enabled: true,
    });
    expect(byKey.get('friends')).toMatchObject({
      tier: 'regular',
      enabled: true,
    });

    await http()
      .patch('/admin/system/modules/auth')
      .set('Authorization', manager.auth)
      .send({ enabled: false })
      .expect(400);
    await http()
      .patch('/admin/system/modules/store')
      .set('Authorization', manager.auth)
      .send({ enabled: false })
      .expect(403);
    await http()
      .patch('/admin/system/modules/unknown')
      .set('Authorization', manager.auth)
      .send({ enabled: false })
      .expect(404);

    await http().get('/friends').set('Authorization', plain.auth).expect(200);
    const off = await http()
      .patch('/admin/system/modules/friends')
      .set('Authorization', manager.auth)
      .send({ enabled: false, reason: 'Переделываем раздел' })
      .expect(200);
    expect(off.body).toMatchObject({
      enabled: false,
      reason: 'Переделываем раздел',
    });

    const blocked = await http()
      .get('/friends')
      .set('Authorization', plain.auth)
      .expect(503);
    expect(blocked.body).toMatchObject({
      code: 'MODULE_DISABLED',
      module: 'friends',
    });
    await http().get('/friends').set('Authorization', staff.auth).expect(200);
    // Админка и ядро не закрываются.
    await http()
      .get('/admin/system/modules')
      .set('Authorization', manager.auth)
      .expect(200);
    await http().get('/health').expect(200);

    const status = await http().get('/site/status').expect(200);
    expect(status.body).toMatchObject({
      maintenance: null,
      disabledModules: ['friends'],
    });
    const settings = await http().get('/site/settings').expect(200);
    expect(settings.body.modules).toMatchObject({ friends: false, chat: true });

    await http()
      .patch('/admin/system/modules/friends')
      .set('Authorization', manager.auth)
      .send({ enabled: true })
      .expect(200);
    await http().get('/friends').set('Authorization', plain.auth).expect(200);

    // Защищённый модуль — с отдельным правом; вебхук платежей не закрывается.
    await grant(manager.id, ['system.modules.protected']);
    await http()
      .patch('/admin/system/modules/store')
      .set('Authorization', manager.auth)
      .send({ enabled: false })
      .expect(200);
    const store503 = await http().get('/store/products').expect(503);
    expect(store503.body.code).toBe('MODULE_DISABLED');
    const webhook = await http().post('/webhooks/payments/unknown').send({});
    expect(webhook.status).not.toBe(503);
    await http()
      .patch('/admin/system/modules/store')
      .set('Authorization', manager.auth)
      .send({ enabled: true })
      .expect(200);

    const audits = await prisma.auditLog.findMany({
      where: { actorId: manager.id, action: { startsWith: 'system.module.' } },
      select: { action: true, targetId: true, severity: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits).toEqual([
      {
        action: 'system.module.disable',
        targetId: 'friends',
        severity: 'warning',
      },
      {
        action: 'system.module.enable',
        targetId: 'friends',
        severity: 'warning',
      },
      {
        action: 'system.module.disable',
        targetId: 'store',
        severity: 'critical',
      },
      {
        action: 'system.module.enable',
        targetId: 'store',
        severity: 'critical',
      },
    ]);
  });

  it('техработы: частичные и полные, расписание, обход, вход работает, причина скрыта, аудит', async () => {
    const plain = await createUser('mp');
    const manager = await createUser('mm');
    const staff = await createUser('ms');
    await grant(manager.id, [
      'system.maintenance.view',
      'system.maintenance.manage',
    ]);
    await grant(staff.id, ['system.maintenance.bypass']);
    const put = (body: Record<string, unknown>) =>
      http()
        .put('/admin/system/maintenance')
        .set('Authorization', manager.auth)
        .send(body);

    await http()
      .put('/admin/system/maintenance')
      .set('Authorization', plain.auth)
      .send(maintenance({}))
      .expect(403);
    for (const bad of [
      maintenance({ scope: 'partial', modules: [] }),
      maintenance({ scope: 'partial', modules: ['auth'] }),
      maintenance({ scope: 'partial', modules: ['nope'] }),
      maintenance({
        startsAt: '2030-01-02T00:00:00Z',
        estimatedEnd: '2030-01-01T00:00:00Z',
      }),
    ]) {
      await put(bad).expect(400);
    }

    // Частичные: закрыты только новости.
    await put(maintenance({ scope: 'partial', modules: ['news'] })).expect(200);
    const news = await http().get('/news').expect(503);
    expect(news.body).toMatchObject({ code: 'MAINTENANCE', module: 'news' });
    await http().get('/friends').set('Authorization', plain.auth).expect(200);

    // Полные: закрыто всё, кроме ядра; вход работает; сотрудники проходят.
    const full = await put(maintenance({})).expect(200);
    expect(full.body).toMatchObject({
      enabled: true,
      scope: 'full',
      active: true,
    });
    await http().get('/friends').set('Authorization', plain.auth).expect(503);
    await http().get('/friends').set('Authorization', staff.auth).expect(200);
    await http()
      .post('/auth/login')
      .send({ emailOrUsername: plain.username, password })
      .expect(200);
    await http().get('/health').expect(200);
    const status = await http().get('/site/status').expect(200);
    expect(status.body.maintenance).toMatchObject({
      active: true,
      scope: 'full',
      title: 'Технические работы',
    });
    expect(JSON.stringify(status.body)).not.toContain('Миграция БД');

    // Запланированные — ещё не идут.
    const planned = await put(
      maintenance({ startsAt: new Date(Date.now() + 3_600_000).toISOString() }),
    ).expect(200);
    expect(planned.body.active).toBe(false);
    await http().get('/friends').set('Authorization', plain.auth).expect(200);
    expect(
      (await http().get('/site/status').expect(200)).body.maintenance,
    ).toMatchObject({
      active: false,
    });

    await put(maintenance({ enabled: false })).expect(200);
    expect(
      (await http().get('/site/status').expect(200)).body.maintenance,
    ).toBeNull();

    const actions = (
      await prisma.auditLog.findMany({
        where: {
          actorId: manager.id,
          action: { startsWith: 'system.maintenance.' },
        },
        select: { action: true, severity: true },
        orderBy: { createdAt: 'asc' },
      })
    ).map((row) => `${row.action}:${row.severity}`);
    expect(actions).toEqual([
      'system.maintenance.enable:warning',
      'system.maintenance.update:critical',
      'system.maintenance.update:critical',
      'system.maintenance.disable:warning',
    ]);
  });

  it('сводка для дашборда: права, реальные значения здоровья и состояния', async () => {
    const plain = await createUser('op');
    const admin = await createUser('oa');
    await grant(admin.id, ['dashboard.view']);
    await http()
      .get('/admin/system/overview')
      .set('Authorization', plain.auth)
      .expect(403);
    store.modules.set('topics', {
      isEnabled: false,
      reason: null,
      disabledAt: new Date(),
    });
    store.maintenance = null;
    app.get(SiteStatusService).invalidate();
    const overview = await http()
      .get('/admin/system/overview')
      .set('Authorization', admin.auth)
      .expect(200);
    expect(overview.body).toMatchObject({
      maintenance: null,
      disabledModules: ['topics'],
      health: { database: 'ok', redis: 'ok' },
    });
    expect(overview.body.activeAnnouncements).toEqual(expect.any(Number));
    store.modules.delete('topics');
    app.get(SiteStatusService).invalidate();
  });

  it('Prisma-хранилище: запись модуля и техработ (служебный ключ, без включения)', async () => {
    const real = new PrismaSiteStatusStore(prisma);
    const key = `e2e-${unique}`;
    await real.setModule(
      key,
      { isEnabled: false, reason: 'тест' },
      userIds[0]!,
    );
    expect((await real.getModules()).get(key)).toMatchObject({
      isEnabled: false,
      reason: 'тест',
    });

    const before = await real.getMaintenance();
    try {
      await real.setMaintenance(
        {
          isEnabled: false,
          scope: 'partial',
          modules: ['news'],
          title: `e2e ${unique}`,
          message: 'Проверка записи',
          reason: null,
          startsAt: null,
          estimatedEnd: null,
        },
        userIds[0]!,
      );
      expect(await real.getMaintenance()).toMatchObject({
        isEnabled: false,
        scope: 'partial',
        modules: ['news'],
        title: `e2e ${unique}`,
      });
    } finally {
      if (before) {
        const { enabledAt: _a, updatedAt: _u, ...rest } = before;
        await real.setMaintenance(rest, userIds[0]!);
      } else {
        await prisma.maintenanceMode.deleteMany({ where: { id: 'global' } });
      }
    }
  });
});
