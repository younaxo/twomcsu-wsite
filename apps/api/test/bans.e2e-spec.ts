import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { AuditService } from '../src/modules/audit/audit.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';
import { markStaffTwoFactorEnabled } from './helpers/staff-two-factor';

// См. auth.e2e-spec.ts: риск конкуренции за ресурсы под полным сьютом.
jest.setTimeout(30_000);

/// Срез 2, бэкенд /bans (ADR-0180, контракт, раздел 10): то, что юнит-тесты на
/// моках доказать не могут: реальный HTTP-стек (guard -> pipe -> handler ->
/// filter), заголовки, порядок проверок, ETag/304, аудит и откат транзакции в
/// настоящей БД, гонки скрытия выдавшего.
///
/// СТАТИЧЕСКИЙ e2e: агентом НЕ запускался. Запуск - владелец или ревьюер на
/// ОДНОРАЗОВОЙ локальной БД с применёнными миграциями (включая
/// 20261117040000_punishments_public_indexes) и `LITEBANS_ENABLED=false`
/// (синхронизатор не должен трогать зеркало во время теста). Тест создаёт
/// собственные строки (id с префиксом `e2e-bans-<unique>-`, ник с префиксом
/// `e2<unique>`), собственных пользователей и роли и удаляет их в afterAll;
/// SiteSetting и PunishmentSyncState возвращает в исходное состояние.
/// Лимит входа 10/мин: один вход на роль (6 пользователей), токен
/// переиспользуется.
describe('Bans / punishments mirror (e2e)', () => {
  let app: INestApplication | undefined;
  let prisma: PrismaService;
  let permissions: PermissionService;
  const unique = randomUUID().replace(/-/g, '').slice(0, 6);
  /// Префикс ника фикстур: `e2` + 6 hex = 8 символов (ник до 16).
  const P = `e2${unique}`;
  const idPrefix = `e2e-bans-${unique}-`;
  const idBase =
    BigInt(7_000_000_000) +
    BigInt(Math.floor(Math.random() * 1e7)) * BigInt(100);
  let seq = 0;
  const cleanupRoleSlugs: string[] = [];
  const createdPermissionKeys: string[] = [];

  interface TestUser {
    id: string;
    accessToken: string;
    email: string;
  }

  type Kind = 'BAN' | 'MUTE' | 'WARN' | 'KICK';
  interface Fx {
    id: string;
    ref: string;
  }

  const http = () => request(app!.getHttpServer());
  const bearer = (user: TestUser) => `Bearer ${user.accessToken}`;
  const get = (path: string, user?: TestUser) => {
    const r = http().get(path);
    return user ? r.set('Authorization', bearer(user)) : r;
  };
  const post = (path: string, user: TestUser, body?: unknown) =>
    http()
      .post(path)
      .set('Authorization', bearer(user))
      .send(body as object | undefined);
  const del = (path: string, user: TestUser) =>
    http().delete(path).set('Authorization', bearer(user));

  async function createUser(label: string): Promise<TestUser> {
    const email = `bn-${label}-${unique}@example.com`;
    const username = `bn${label}${unique}`
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 16);
    const password = 'Sup3rSecretPassw0rd!';
    await http()
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);
    const loginRes = await http()
      .post('/auth/login')
      .send({ emailOrUsername: email, password })
      .expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { id: user.id, accessToken: loginRes.body.accessToken, email };
  }

  async function ensurePermission(key: string, module: string): Promise<void> {
    const existing = await prisma.permission.findUnique({ where: { key } });
    if (existing) return;
    // Тот же upsert делает seed по каталогу; здесь только на одноразовой БД,
    // и только если seed ещё не выполнялся. Удаляется в afterAll.
    await prisma.permission.create({
      data: { key, module, description: `e2e ${unique}` },
    });
    createdPermissionKeys.push(key);
  }

  async function createRole(
    slug: string,
    priority: number,
    permissionKeys: string[],
    isSuperuser = false,
  ) {
    cleanupRoleSlugs.push(slug);
    const role = await prisma.role.create({
      data: {
        name: slug,
        slug,
        displayName: slug,
        priority,
        isSystem: false,
        isAssignable: true,
        isSuperuser,
      },
    });
    const records = await prisma.permission.findMany({
      where: { key: { in: permissionKeys } },
    });
    await prisma.rolePermission.createMany({
      data: records.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
    return role;
  }

  async function grantRole(
    userId: string,
    roleId: string,
    withTwoFactor = true,
  ) {
    await prisma.userRole.create({ data: { userId, roleId } });
    if (withTwoFactor) await markStaffTwoFactorEnabled(prisma, userId);
    await permissions.invalidateUser(userId);
  }

  async function mk(
    init: Partial<Prisma.MinecraftPunishmentUncheckedCreateInput> & {
      kind: Kind;
    },
  ): Promise<Fx> {
    seq += 1;
    const sourceId = idBase + BigInt(seq);
    await prisma.minecraftPunishment.create({
      data: {
        id: `${idPrefix}${seq}`,
        sourceId,
        status: 'ACTIVE',
        startedAt: new Date(Date.now() - 3_600_000 + seq * 1000),
        rowHash: 'e2e',
        ...init,
      },
    });
    return {
      id: `${idPrefix}${seq}`,
      ref: `${init.kind.toLowerCase()}-${sourceId}`,
    };
  }

  const rowOf = (fx: Fx) =>
    prisma.minecraftPunishment.findUniqueOrThrow({ where: { id: fx.id } });
  const auditCount = (action: string, targetId: string) =>
    prisma.auditLog.count({ where: { action, targetId } });
  const staffAuditCount = (actorId: string) =>
    prisma.auditLog.count({
      where: { actorId, action: { startsWith: 'punishment.' } },
    });

  async function setSetting(key: string, value: string) {
    await prisma.siteSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  const SETTING_ENABLED = 'punishments.public.enabled';
  const SOURCE = 'litebans';
  const ALL_KINDS: Kind[] = ['BAN', 'MUTE', 'WARN', 'KICK'];

  let owner: TestUser;
  let curator: TestUser;
  let junior: TestUser;
  let viewer: TestUser;
  let noTwoFactor: TestUser;
  let player: TestUser;

  const uPlayer = randomUUID();
  const uCurator = randomUUID();
  const uJunior = randomUUID();
  const uGhost = randomUUID();

  let ban1: Fx; // выдал junior (привязан), виден
  let ban2: Fx; // консоль, глобально, активный до будущей даты
  let mute1: Fx; // истёк, без области
  let ban3: Fx; // субъект player, выдал curator (привязан)
  let ban4: Fx; // выдавший не привязан
  let ban5: Fx; // консоль, для гонки POST/POST
  let ban6: Fx; // консоль, для отката и гонки POST/DELETE
  let warn1: Fx; // субъект player
  let kick1: Fx; // субъект player
  let silentBan: Fx;
  let ipBan: Fx;
  let hiddenBan: Fx;
  let noNameBan: Fx;
  let removedMine: Fx; // субъект player, REMOVED, removedReason задана

  let originalEnabled: string | null = null;
  let originalSync: Array<{
    kind: Kind;
    existed: boolean;
    initialSyncDoneAt: Date | null;
  }> = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    permissions = app.get(PermissionService);

    await ensurePermission('users.punishments', 'users');
    await ensurePermission('punishments.issuer.hide', 'punishments');

    owner = await createUser('owner');
    curator = await createUser('curator');
    junior = await createUser('junior');
    viewer = await createUser('viewer');
    noTwoFactor = await createUser('nofa');
    player = await createUser('player');

    const hide = ['users.punishments', 'punishments.issuer.hide'];
    await grantRole(
      owner.id,
      (await createRole(`bn-owner-${unique}`, 1000, [], true)).id,
    );
    await grantRole(
      curator.id,
      (await createRole(`bn-curator-${unique}`, 50, hide)).id,
    );
    await grantRole(
      junior.id,
      (await createRole(`bn-junior-${unique}`, 10, hide)).id,
    );
    await grantRole(
      viewer.id,
      (await createRole(`bn-viewer-${unique}`, 5, ['users.punishments'])).id,
    );
    await grantRole(
      noTwoFactor.id,
      (await createRole(`bn-nofa-${unique}`, 40, hide)).id,
      false,
    );

    // Подтверждённые привязки (ADR-0072): по ним строится иерархия выдавшего.
    await prisma.minecraftAccount.createMany({
      data: [
        { userId: player.id, uuid: uPlayer, name: `mcpl${unique}` },
        { userId: curator.id, uuid: uCurator, name: `mccu${unique}` },
        { userId: junior.id, uuid: uJunior, name: `mcju${unique}` },
      ],
    });

    // Раздел включён, первичная загрузка всех видов выполнена; прежнее
    // состояние запоминается и возвращается в afterAll.
    originalEnabled =
      (await prisma.siteSetting.findUnique({ where: { key: SETTING_ENABLED } }))
        ?.value ?? null;
    await setSetting(SETTING_ENABLED, 'true');
    const states = await prisma.punishmentSyncState.findMany({
      where: { source: SOURCE },
    });
    originalSync = ALL_KINDS.map((kind) => {
      const s = states.find((x) => x.kind === kind);
      return {
        kind,
        existed: Boolean(s),
        initialSyncDoneAt: s?.initialSyncDoneAt ?? null,
      };
    });
    for (const kind of ALL_KINDS) {
      await prisma.punishmentSyncState.upsert({
        where: { source_kind: { source: SOURCE, kind } },
        update: { initialSyncDoneAt: new Date(), lastSuccessAt: new Date() },
        create: {
          source: SOURCE,
          kind,
          initialSyncDoneAt: new Date(),
          lastSuccessAt: new Date(),
        },
      });
    }

    const future = new Date(Date.now() + 86_400_000);
    ban1 = await mk({
      kind: 'BAN',
      subjectName: `${P}_ban1`,
      subjectUuid: randomUUID(),
      executorName: 'ModOne',
      executorUuid: uJunior,
      reason: 'читы',
      serverScope: 'survival',
    });
    ban2 = await mk({
      kind: 'BAN',
      subjectName: `${P}_ban2`,
      subjectUuid: randomUUID(),
      executorIsConsole: true,
      executorName: 'Console',
      until: future,
      serverScope: '*',
    });
    mute1 = await mk({
      kind: 'MUTE',
      subjectName: `${P}_mut1`,
      subjectUuid: randomUUID(),
      executorName: 'Ghost',
      status: 'EXPIRED',
      until: new Date(Date.now() - 60_000),
    });
    ban3 = await mk({
      kind: 'BAN',
      subjectName: `${P}_ban3`,
      subjectUuid: uPlayer,
      executorName: 'CuratorMc',
      executorUuid: uCurator,
    });
    ban4 = await mk({
      kind: 'BAN',
      subjectName: `${P}_ban4`,
      subjectUuid: randomUUID(),
      executorName: 'Unlinked',
      executorUuid: uGhost,
    });
    ban5 = await mk({
      kind: 'BAN',
      subjectName: `${P}_ban5`,
      subjectUuid: randomUUID(),
      executorIsConsole: true,
    });
    ban6 = await mk({
      kind: 'BAN',
      subjectName: `${P}_ban6`,
      subjectUuid: randomUUID(),
      executorIsConsole: true,
    });
    warn1 = await mk({
      kind: 'WARN',
      subjectName: `${P}_wrn1`,
      subjectUuid: uPlayer,
      executorName: 'ModOne',
    });
    kick1 = await mk({
      kind: 'KICK',
      subjectName: `${P}_kck1`,
      subjectUuid: uPlayer,
      executorName: 'ModOne',
    });
    silentBan = await mk({
      kind: 'BAN',
      subjectName: `${P}_sil1`,
      subjectUuid: randomUUID(),
      silent: true,
    });
    ipBan = await mk({
      kind: 'BAN',
      subjectName: `${P}_ipb1`,
      subjectUuid: randomUUID(),
      ipBan: true,
    });
    hiddenBan = await mk({
      kind: 'BAN',
      subjectName: `${P}_hid1`,
      subjectUuid: randomUUID(),
      isHidden: true,
    });
    noNameBan = await mk({
      kind: 'BAN',
      subjectName: null,
      subjectUuid: randomUUID(),
    });
    removedMine = await mk({
      kind: 'BAN',
      subjectName: `${P}_rem1`,
      subjectUuid: uPlayer,
      status: 'REMOVED',
      removedAt: new Date(),
      removedReason: 'секретная причина снятия',
      removedByName: 'SecretRemover',
    });
  }, 60_000);

  afterAll(async () => {
    // app.close() в finally: даже если beforeAll упал на середине.
    try {
      if (prisma) {
        const users = [
          owner,
          curator,
          junior,
          viewer,
          noTwoFactor,
          player,
        ].filter(Boolean);
        const ids = users.map((u) => u.id);
        await prisma.minecraftPunishment.deleteMany({
          where: { id: { startsWith: idPrefix } },
        });
        await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
        await prisma.userRole.deleteMany({
          where: { role: { slug: { in: cleanupRoleSlugs } } },
        });
        await prisma.rolePermission.deleteMany({
          where: { role: { slug: { in: cleanupRoleSlugs } } },
        });
        await prisma.role.deleteMany({
          where: { slug: { in: cleanupRoleSlugs } },
        });
        // MinecraftAccount удаляется каскадом вместе с пользователем.
        await prisma.user.deleteMany({ where: { id: { in: ids } } });
        if (createdPermissionKeys.length > 0) {
          await prisma.rolePermission.deleteMany({
            where: { permission: { key: { in: createdPermissionKeys } } },
          });
          await prisma.permission.deleteMany({
            where: { key: { in: createdPermissionKeys } },
          });
        }
        if (originalEnabled === null) {
          await prisma.siteSetting.deleteMany({
            where: { key: SETTING_ENABLED },
          });
        } else {
          await setSetting(SETTING_ENABLED, originalEnabled);
        }
        for (const s of originalSync) {
          if (!s.existed) {
            await prisma.punishmentSyncState.deleteMany({
              where: { source: SOURCE, kind: s.kind },
            });
          } else {
            await prisma.punishmentSyncState.updateMany({
              where: { source: SOURCE, kind: s.kind },
              data: { initialSyncDoneAt: s.initialSyncDoneAt },
            });
          }
        }
      }
    } finally {
      if (app) await app.close();
    }
  }, 40_000);

  // ------------------------------------------------------------- публичные

  describe('публичный список и карточка (п.1-3, 5, 15, 16, 23)', () => {
    const publicKeys = [
      'executor',
      'kind',
      'permanent',
      'reason',
      'ref',
      'removedAt',
      'scope',
      'startedAt',
      'status',
      'subjectName',
      'until',
    ];

    it('список без входа: предикат публичности, форма, без uuid и служебных полей', async () => {
      const res = await get(`/punishments/public?name=${P}&limit=50`).expect(
        200,
      );
      const refs = res.body.items.map((i: { ref: string }) => i.ref).sort();
      expect(refs).toEqual(
        [ban1, ban2, mute1, ban3, ban4, ban5, ban6, removedMine]
          .map((f) => f.ref)
          .sort(),
      );
      for (const item of res.body.items) {
        expect(Object.keys(item).sort()).toEqual(publicKeys);
        expect(item.reason).toEqual({
          key: 'rules',
          label: 'Нарушение правил',
        });
      }
      const text = JSON.stringify(res.body);
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i);
      for (const forbidden of [
        'ipBan',
        'silent',
        'template',
        'removedReason',
        'origin',
      ]) {
        expect(text).not.toContain(forbidden);
      }
      expect(text).not.toContain('секретная причина снятия');
      expect(text).not.toContain('SecretRemover');
      const by = (f: Fx) =>
        res.body.items.find((i: { ref: string }) => i.ref === f.ref);
      expect(by(ban1).executor).toEqual({ name: 'ModOne' });
      expect(by(ban2).executor).toEqual({ console: true });
      expect(by(ban2).scope).toEqual({ kind: 'global' });
      expect(by(mute1).scope).toEqual({ kind: 'unknown' });
      expect(by(mute1).status).toBe('EXPIRED');
      expect(by(ban1).scope.kind).toBe('server');
    });

    it('заголовки списка и 304 по If-None-Match', async () => {
      const path = `/punishments/public?name=${P}&limit=50`;
      const res = await get(path).expect(200);
      expect(res.headers['cache-control']).toBe(
        'public, max-age=15, stale-while-revalidate=30',
      );
      expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(res.headers['etag']).toMatch(/^W\//);
      const cached = await get(path)
        .set('If-None-Match', res.headers['etag'])
        .expect(304);
      expect(cached.text ?? '').toBe('');
    });

    it('карточка: заголовки, executor, ETag/304; скрытые, silent, ipBan, WARN, без ника и несуществующие - один и тот же 404', async () => {
      const ok = await get(`/punishments/public/${ban2.ref}`).expect(200);
      expect(ok.headers['cache-control']).toBe(
        'public, max-age=15, stale-while-revalidate=30',
      );
      expect(ok.headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(ok.headers['etag']).toMatch(/^W\//);
      expect(Object.keys(ok.body.item).sort()).toEqual(publicKeys);
      expect(ok.body.item.executor).toEqual({ console: true });
      await get(`/punishments/public/${ban2.ref}`)
        .set('If-None-Match', ok.headers['etag'])
        .expect(304);

      const missing = [
        hiddenBan.ref,
        silentBan.ref,
        ipBan.ref,
        warn1.ref,
        noNameBan.ref,
        'ban-1',
        'ban-0',
        'ban-99999999999999999999',
        'ban-9223372036854775808',
        'ban-007',
        'xyz-1',
      ];
      let first: { body: unknown; headers: Record<string, string> } | null =
        null;
      for (const ref of missing) {
        const res = await get(`/punishments/public/${ref}`).expect(404);
        expect(res.body).toEqual({
          statusCode: 404,
          code: 'punishments_not_found',
          message: 'Наказание не найдено.',
        });
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.headers['x-robots-tag']).toBe('noindex');
        expect(res.headers['etag']).toBeUndefined();
        if (first) expect(res.body).toEqual(first.body);
        else first = { body: res.body, headers: res.headers };
      }
      // 304 не поверх ошибки.
      await get(`/punishments/public/${hiddenBan.ref}`)
        .set('If-None-Match', ok.headers['etag'])
        .expect(404);
    });

    it('ошибки валидации: 400 с no-store; неверный курсор - код модуля', async () => {
      for (const q of [
        'limit=51',
        'limit=0',
        'unknown=1',
        'kind=WARN',
        'status=bad',
        'name=ab',
      ]) {
        const res = await get(`/punishments/public?${q}`).expect(400);
        expect(res.headers['cache-control']).toBe('no-store');
        expect(Array.isArray(res.body.message)).toBe(true);
      }
      const res = await get('/punishments/public?cursor=not-a-cursor').expect(
        400,
      );
      expect(res.body.code).toBe('punishments_invalid_cursor');
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('курсор: страницы без дублей и потерь; курсор от другого order и другого набора фильтров - 400', async () => {
      const seen: string[] = [];
      let cursor: string | null = null;
      let firstCursor: string | null = null;
      for (let i = 0; i < 10; i += 1) {
        const url: string =
          `/punishments/public?name=${P}&limit=3&order=asc` +
          (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
        const res = await get(url).expect(200);
        for (const item of res.body.items) seen.push(item.ref);
        cursor = res.body.nextCursor;
        if (firstCursor === null) firstCursor = cursor;
        if (!cursor) break;
      }
      expect(new Set(seen).size).toBe(seen.length);
      expect(seen).toHaveLength(8);
      expect(firstCursor).not.toBeNull();
      const otherOrder = await get(
        `/punishments/public?name=${P}&limit=3&order=desc&cursor=${encodeURIComponent(firstCursor!)}`,
      ).expect(400);
      expect(otherOrder.body.code).toBe('punishments_invalid_cursor');
      const otherFilter = await get(
        `/punishments/public?name=${P}&kind=BAN&limit=3&order=asc&cursor=${encodeURIComponent(firstCursor!)}`,
      ).expect(400);
      expect(otherFilter.body.code).toBe('punishments_invalid_cursor');
    });

    it('поиск по префиксу: регистр; `_` буквально, `%` отклоняется форматом', async () => {
      const upper = await get(
        `/punishments/public?name=${P.toUpperCase()}_BAN&limit=50`,
      ).expect(200);
      expect(upper.body.items.length).toBeGreaterThan(0);
      // `_` не подстановочный знак: `ba_` не находит `ban1`.
      const literal = await get(
        `/punishments/public?name=${P}_ba_&limit=50`,
      ).expect(200);
      expect(literal.body.items).toEqual([]);
      const percent = await get(
        `/punishments/public?name=${P}%25&limit=50`,
      ).expect(400);
      expect(Array.isArray(percent.body.message)).toBe(true);
    });
  });

  // ------------------------------------------------- порядок проверок (п.14)

  describe('порядок проверок через реальный стек (п.14)', () => {
    it('раздел выключен: 404 имеет приоритет над 400 валидации; me и admin не затронуты', async () => {
      await setSetting(SETTING_ENABLED, 'false');
      try {
        for (const path of [
          '/punishments/public?limit=999',
          '/punishments/public?cursor=bad',
          '/punishments/public',
          `/punishments/public/${ban1.ref}`,
        ]) {
          const res = await get(path).expect(404);
          expect(res.body).toEqual({
            statusCode: 404,
            code: 'punishments_public_disabled',
            message: 'Раздел не найден.',
          });
          expect(res.headers['cache-control']).toBe('no-store');
          expect(res.headers['x-robots-tag']).toBe('noindex');
        }
        await get('/punishments/me', player).expect(200);
        await get('/admin/punishments/status', viewer).expect(200);
      } finally {
        await setSetting(SETTING_ENABLED, 'true');
      }
    });

    it('нет первичной загрузки: 400 раньше 503; публичный 503 с Retry-After; me unlinked - 200, linked - 503; admin/status показывает причину', async () => {
      await prisma.punishmentSyncState.updateMany({
        where: { source: SOURCE, kind: 'MUTE' },
        data: { initialSyncDoneAt: null },
      });
      try {
        // Каждый запрос - уникальный ключ серверного кэша, чтобы 503 не
        // маскировался закэшированным 200.
        const bad = await get('/punishments/public?kind=BAN&limit=51').expect(
          400,
        );
        expect(bad.headers['cache-control']).toBe('no-store');
        const unavailable = await get(
          '/punishments/public?kind=MUTE&limit=7',
        ).expect(503);
        expect(unavailable.body).toEqual({
          statusCode: 503,
          code: 'punishments_unavailable',
          message: 'Данные временно недоступны.',
        });
        expect(unavailable.headers['retry-after']).toBe('60');
        expect(unavailable.headers['cache-control']).toBe('no-store');
        expect(unavailable.headers['x-robots-tag']).toBe('noindex');
        expect(unavailable.headers['etag']).toBeUndefined();

        const unlinked = await get('/punishments/me', viewer).expect(200);
        expect(unlinked.body.linked).toBe(false);
        const linked = await get('/punishments/me', player).expect(503);
        expect(linked.body.code).toBe('punishments_unavailable');
        expect(linked.headers['retry-after']).toBe('60');

        const status = await get('/admin/punishments/status', viewer).expect(
          200,
        );
        const mute = status.body.kinds.find(
          (k: { kind: string }) => k.kind === 'MUTE',
        );
        expect(mute.initialSyncDone).toBe(false);
        await get('/admin/punishments', viewer).expect(503);
      } finally {
        await prisma.punishmentSyncState.updateMany({
          where: { source: SOURCE, kind: 'MUTE' },
          data: { initialSyncDoneAt: new Date() },
        });
      }
    });

    it('401 раньше 400; 403 раньше 400; 400 после прав', async () => {
      const noToken = await get('/punishments/me?limit=999').expect(401);
      expect(noToken.headers['cache-control']).toBe('no-store');
      await get('/admin/punishments?limit=999').expect(401);
      const forbidden = await get(
        '/admin/punishments?limit=999',
        player,
      ).expect(403);
      expect(forbidden.headers['cache-control']).toBe('no-store');
      expect(forbidden.body.code).toBeUndefined();
      await get('/admin/punishments?limit=101', viewer).expect(400);
      await get('/punishments/me?limit=999', player).expect(400);
    });
  });

  // ------------------------------------------------------------------- me

  describe('me и персонал: заголовки, аудит (п.6, 8, 9, 15, 28)', () => {
    it('me: только свои записи, все виды, без removedReason и uuid; заголовки private/no-store, без ETag', async () => {
      const res = await get('/punishments/me?limit=50', player).expect(200);
      expect(res.body.linked).toBe(true);
      const refs = res.body.items.map((i: { ref: string }) => i.ref).sort();
      expect(refs).toEqual(
        [ban3, warn1, kick1, removedMine].map((f) => f.ref).sort(),
      );
      const text = JSON.stringify(res.body);
      expect(text).not.toContain('removedReason');
      expect(text).not.toContain('секретная причина снятия');
      expect(text).not.toContain('SecretRemover');
      expect(text).not.toContain(uPlayer);
      expect(text).not.toContain(uCurator);
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(res.headers['vary']).toMatch(/Authorization/i);
      expect(res.headers['etag']).toBeUndefined();
      const mine = res.body.items.find(
        (i: { ref: string }) => i.ref === ban3.ref,
      );
      expect(mine.executor).toEqual({ name: 'CuratorMc' });
    });

    it('персонал: заголовки, статус без хоста и паролей, список без записи в аудит', async () => {
      const before = await staffAuditCount(viewer.id);
      const status = await get('/admin/punishments/status', viewer).expect(200);
      expect(status.headers['cache-control']).toBe('private, no-store');
      expect(status.headers['vary']).toMatch(/Authorization/i);
      expect(status.headers['etag']).toBeUndefined();
      expect(status.body.kinds).toHaveLength(4);
      expect(JSON.stringify(status.body)).not.toMatch(/host|password|mysql/i);

      const list = await get(
        `/admin/punishments?name=${P}&limit=100&hidden=true`,
        viewer,
      ).expect(200);
      expect(list.headers['cache-control']).toBe('private, no-store');
      expect(list.body.items.map((i: { ref: string }) => i.ref)).toEqual([
        hiddenBan.ref,
      ]);
      expect(await staffAuditCount(viewer.id)).toBe(before);

      const staffList = await get(
        `/admin/punishments?name=${P}&limit=100`,
        viewer,
      ).expect(200);
      expect(JSON.stringify(staffList.body)).not.toMatch(/"ip"|ipAddress/);
      await get('/admin/punishments?limit=101', viewer).expect(400);
    });

    it('карточка персонала: ровно одна запись аудита punishment.card.view; повторный просмотр - вторая; 404 без аудита', async () => {
      const before = await auditCount('punishment.card.view', ban4.id);
      const res = await get(`/admin/punishments/${ban4.ref}`, viewer).expect(
        200,
      );
      expect(res.body.item.executor.uuid).toBe(uGhost);
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(await auditCount('punishment.card.view', ban4.id)).toBe(
        before + 1,
      );
      const log = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'punishment.card.view', targetId: ban4.id },
      });
      expect(log.actorId).toBe(viewer.id);
      expect(log.targetType).toBe('MinecraftPunishment');
      expect(log.changes).toMatchObject({ ref: ban4.ref });
      expect(log.severity).toBe('info');
      const total = await staffAuditCount(viewer.id);
      await get('/admin/punishments/ban-1', viewer).expect(404);
      await get('/admin/punishments/ban-99999999999999999999', viewer).expect(
        404,
      );
      expect(await staffAuditCount(viewer.id)).toBe(total);
    });

    it('персонал без 2FA: 403 admin_2fa_required (если задан TWO_FACTOR_ENCRYPTION_KEY)', async () => {
      if ((process.env.TWO_FACTOR_ENCRYPTION_KEY ?? '').length < 32) return;
      const res = await get('/admin/punishments/status', noTwoFactor).expect(
        403,
      );
      expect(res.body.code).toBe('admin_2fa_required');
      const hide = await post(
        `/admin/punishments/${ban4.ref}/issuer-hidden`,
        noTwoFactor,
        {
          reason: 'x',
        },
      ).expect(403);
      expect(hide.body.code).toBe('admin_2fa_required');
      expect((await rowOf(ban4)).issuerHidden).toBe(false);
    });
  });

  // ---------------------------------------------- скрытие выдавшего (п.17, 33-37)

  describe('скрытие выдавшего (issuer-hidden)', () => {
    it('нет права - обычный 403 без кода; состояние и аудит не меняются', async () => {
      const before = await auditCount('punishment.issuer.hide', ban4.id);
      const res = await post(
        `/admin/punishments/${ban4.ref}/issuer-hidden`,
        viewer,
        {
          reason: 'x',
        },
      ).expect(403);
      expect(res.body.code).toBeUndefined();
      expect(res.headers['cache-control']).toBe('no-store');
      expect((await rowOf(ban4)).issuerHidden).toBe(false);
      expect(await auditCount('punishment.issuer.hide', ban4.id)).toBe(before);
    });

    it('тело и ref: reason пустой, 201 символ, отсутствует - 400; ref вне формата и неизвестный - 404', async () => {
      const path = `/admin/punishments/${ban1.ref}/issuer-hidden`;
      await post(path, curator, { reason: '' }).expect(400);
      await post(path, curator, { reason: 'x'.repeat(201) }).expect(400);
      await post(path, curator, {}).expect(400);
      await post(path, curator, { reason: 'x', extra: 1 }).expect(400);
      for (const ref of ['ban-1', 'ban-0', 'ban-99999999999999999999', 'zzz']) {
        const res = await post(
          `/admin/punishments/${ref}/issuer-hidden`,
          curator,
          {
            reason: 'x',
          },
        ).expect(404);
        expect(res.body.code).toBe('punishments_not_found');
        await del(`/admin/punishments/${ref}/issuer-hidden`, curator).expect(
          404,
        );
      }
      expect((await rowOf(ban1)).issuerHidden).toBe(false);
    });

    it('скрытие куратором: 200, rev+1, аудит ровно один, публично и в me executor=null, персонал видит реального; ETag меняется; сервер-кэш сброшен (п.17)', async () => {
      const cardPath = `/punishments/public/${ban1.ref}`;
      const warm = await get(cardPath).expect(200);
      expect(warm.body.item.executor).toEqual({ name: 'ModOne' });
      const before = await rowOf(ban1);

      const res = await post(
        `/admin/punishments/${ban1.ref}/issuer-hidden`,
        curator,
        {
          reason: '  по просьбе игрока  ',
        },
      ).expect(200);
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(res.body.item.issuerHidden).toBe(true);
      expect(res.body.item.issuerHiddenById).toBe(curator.id);
      expect(res.body.item.issuerHiddenReason).toBe('по просьбе игрока');
      expect(res.body.item.executor.name).toBe('ModOne');
      const after = await rowOf(ban1);
      expect(after.rev).toBe(before.rev + 1);
      expect(after.issuerHiddenAt).not.toBeNull();
      expect(after.lastChangedAt.getTime()).toBeGreaterThanOrEqual(
        before.lastChangedAt.getTime(),
      );

      expect(await auditCount('punishment.issuer.hide', ban1.id)).toBe(1);
      const log = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'punishment.issuer.hide', targetId: ban1.id },
      });
      expect(log.actorId).toBe(curator.id);
      expect(log.severity).toBe('warning');
      expect(log.changes).toMatchObject({
        ref: ban1.ref,
        reason: 'по просьбе игрока',
        previous: { issuerHidden: false, issuerHiddenById: null },
      });

      // Сразу после скрытия (без ожидания TTL): серверный кэш сброшен.
      const fresh = await get(cardPath).expect(200);
      expect(fresh.body.item.executor).toBeNull();
      expect(fresh.headers['etag']).not.toBe(warm.headers['etag']);
      const list = await get(
        `/punishments/public?name=${P}_ban1&limit=5`,
      ).expect(200);
      expect(list.body.items[0].executor).toBeNull();
      expect(JSON.stringify(list.body)).not.toContain('ModOne');

      // Повтор: 200 без изменений и без новой записи аудита.
      await post(`/admin/punishments/${ban1.ref}/issuer-hidden`, curator, {
        reason: 'ещё',
      }).expect(200);
      expect((await rowOf(ban1)).rev).toBe(after.rev);
      expect(await auditCount('punishment.issuer.hide', ban1.id)).toBe(1);
    });

    it('младший не снимает скрытие вышестоящего и не скрывает вышестоящего; ничего не меняется', async () => {
      const unhide = await del(
        `/admin/punishments/${ban1.ref}/issuer-hidden`,
        junior,
      ).expect(403);
      expect(unhide.body.code).toBe('punishments_issuer_hide_forbidden');
      expect((await rowOf(ban1)).issuerHidden).toBe(true);
      expect(await auditCount('punishment.issuer.unhide', ban1.id)).toBe(0);

      // ban3: выдавший curator (привязан, приоритет 50 выше 10).
      const hide = await post(
        `/admin/punishments/${ban3.ref}/issuer-hidden`,
        junior,
        {
          reason: 'x',
        },
      ).expect(403);
      expect(hide.body.code).toBe('punishments_issuer_hide_forbidden');
      expect((await rowOf(ban3)).issuerHidden).toBe(false);
      expect(await auditCount('punishment.issuer.hide', ban3.id)).toBe(0);

      // Несопоставленный выдавший: младшему отказ (приоритет ниже M).
      const unlinked = await post(
        `/admin/punishments/${ban4.ref}/issuer-hidden`,
        junior,
        {
          reason: 'x',
        },
      ).expect(403);
      expect(unlinked.body.code).toBe('punishments_issuer_hide_forbidden');
      expect((await rowOf(ban4)).issuerHidden).toBe(false);
    });

    it('superuser скрывает несопоставленного, консоль доступна куратору, куратор скрывает выдавшего junior; superuser снимает чужое скрытие', async () => {
      await post(`/admin/punishments/${ban4.ref}/issuer-hidden`, owner, {
        reason: 'владелец',
      }).expect(200);
      expect((await rowOf(ban4)).issuerHidden).toBe(true);
      await post(`/admin/punishments/${ban2.ref}/issuer-hidden`, curator, {
        reason: 'консоль',
      }).expect(200);

      const res = await del(
        `/admin/punishments/${ban1.ref}/issuer-hidden`,
        owner,
      ).expect(200);
      expect(res.body.item.issuerHidden).toBe(false);
      expect(res.body.item.issuerHiddenById).toBeNull();
      expect(await auditCount('punishment.issuer.unhide', ban1.id)).toBe(1);
      const card = await get(`/punishments/public/${ban1.ref}`).expect(200);
      expect(card.body.item.executor).toEqual({ name: 'ModOne' });

      // Повтор DELETE при не скрытом: 200 без изменения и без аудита.
      const rev = (await rowOf(ban1)).rev;
      await del(`/admin/punishments/${ban1.ref}/issuer-hidden`, curator).expect(
        200,
      );
      expect((await rowOf(ban1)).rev).toBe(rev);
      expect(await auditCount('punishment.issuer.unhide', ban1.id)).toBe(1);
    });

    it('гонка двух одинаковых POST: оба 200, одна запись аудита, rev вырос на 1 (п.34)', async () => {
      const before = await rowOf(ban5);
      const path = `/admin/punishments/${ban5.ref}/issuer-hidden`;
      const [a, b] = await Promise.all([
        post(path, curator, { reason: 'гонка A' }),
        post(path, owner, { reason: 'гонка B' }),
      ]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      const after = await rowOf(ban5);
      expect(after.issuerHidden).toBe(true);
      expect(after.rev).toBe(before.rev + 1);
      expect(await auditCount('punishment.issuer.hide', ban5.id)).toBe(1);
    });

    it('гонка POST/DELETE: итоговое состояние согласовано с аудитом, rev = старт + число записей аудита (п.35)', async () => {
      const startRev = (await rowOf(ban6)).rev;
      const path = `/admin/punishments/${ban6.ref}/issuer-hidden`;
      const [a, b] = await Promise.all([
        post(path, curator, { reason: 'гонка' }),
        del(path, curator),
      ]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      const row = await rowOf(ban6);
      const hides = await auditCount('punishment.issuer.hide', ban6.id);
      const unhides = await auditCount('punishment.issuer.unhide', ban6.id);
      // Порядок не гарантирован: проверяются порядконезависимые инварианты.
      expect(hides - unhides).toBe(row.issuerHidden ? 1 : 0);
      expect(row.rev).toBe(startRev + hides + unhides);
      expect(hides).toBeLessThanOrEqual(1);
      if (row.issuerHidden) {
        await del(path, curator).expect(200);
      }
      expect((await rowOf(ban6)).issuerHidden).toBe(false);
    });

    it('сбой записи аудита откатывает UPDATE в реальной транзакции: POST и DELETE дают 500, состояние и rev прежние (п.33)', async () => {
      const audit = app!.get(AuditService);
      const path = `/admin/punishments/${ban6.ref}/issuer-hidden`;
      const unhidden = await rowOf(ban6);
      const hidesBefore = await auditCount('punishment.issuer.hide', ban6.id);

      const spy = jest
        .spyOn(audit, 'logInTx')
        .mockRejectedValueOnce(new Error('audit down (e2e)'));
      try {
        await post(path, curator, { reason: 'откат' }).expect(500);
      } finally {
        spy.mockRestore();
      }
      const afterFail = await rowOf(ban6);
      expect(afterFail.issuerHidden).toBe(false);
      expect(afterFail.issuerHiddenById).toBeNull();
      expect(afterFail.issuerHiddenReason).toBeNull();
      expect(afterFail.rev).toBe(unhidden.rev);
      expect(afterFail.lastChangedAt.getTime()).toBe(
        unhidden.lastChangedAt.getTime(),
      );
      expect(await auditCount('punishment.issuer.hide', ban6.id)).toBe(
        hidesBefore,
      );

      // Без сбоя тот же запрос проходит: сервис не «залип».
      await post(path, curator, { reason: 'после отката' }).expect(200);
      const hidden = await rowOf(ban6);
      expect(hidden.issuerHidden).toBe(true);

      const unhidesBefore = await auditCount(
        'punishment.issuer.unhide',
        ban6.id,
      );
      const spy2 = jest
        .spyOn(audit, 'logInTx')
        .mockRejectedValueOnce(new Error('audit down (e2e)'));
      try {
        await del(path, curator).expect(500);
      } finally {
        spy2.mockRestore();
      }
      const stillHidden = await rowOf(ban6);
      expect(stillHidden.issuerHidden).toBe(true);
      expect(stillHidden.issuerHiddenById).toBe(curator.id);
      expect(stillHidden.rev).toBe(hidden.rev);
      expect(await auditCount('punishment.issuer.unhide', ban6.id)).toBe(
        unhidesBefore,
      );
    });

    it('снятие: «скрывший не найден» - только superuser (п.37)', async () => {
      // Скрытие поставлено id несуществующего пользователя (удалён).
      await prisma.minecraftPunishment.update({
        where: { id: ban3.id },
        data: {
          issuerHidden: true,
          issuerHiddenById: `ghost-${unique}`,
          issuerHiddenAt: new Date(),
          issuerHiddenReason: 'e2e',
        },
      });
      const denied = await del(
        `/admin/punishments/${ban3.ref}/issuer-hidden`,
        curator,
      ).expect(403);
      expect(denied.body.code).toBe('punishments_issuer_hide_forbidden');
      expect((await rowOf(ban3)).issuerHidden).toBe(true);
      await del(`/admin/punishments/${ban3.ref}/issuer-hidden`, owner).expect(
        200,
      );
      expect((await rowOf(ban3)).issuerHidden).toBe(false);
    });
  });
});
