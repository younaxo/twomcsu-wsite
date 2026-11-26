import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';
import { markStaffTwoFactorEnabled } from './helpers/staff-two-factor';

jest.setTimeout(30_000);

/// Срез l1-02: обжалование наказания сервера (зеркало LiteBans) со статусом в
/// /punishments/me. Строки и пользователи собственные (id с префиксом, ники
/// до 16 символов); очистка только по записанным id. Требует БД с миграцией
/// 20261124130000 и LITEBANS_ENABLED=false.
describe('Reports: обжалование наказания сервера (e2e)', () => {
  let app: INestApplication | undefined;
  let prisma: PrismaService;
  let permissions: PermissionService;
  const unique = randomUUID().replace(/-/g, '').slice(0, 6);
  const idPrefix = `e2e-mcap-${unique}-`;
  const idBase =
    BigInt(8_000_000_000) +
    BigInt(Math.floor(Math.random() * 1e7)) * BigInt(100);
  let seq = 0;
  const roleSlugs: string[] = [];
  const createdPermissionKeys: string[] = [];
  const mirrorIds: string[] = [];
  const userIds: string[] = [];

  interface TestUser {
    id: string;
    accessToken: string;
  }
  const http = () => request(app!.getHttpServer());
  const auth = (u: TestUser) => `Bearer ${u.accessToken}`;
  const get = (path: string, u: TestUser) =>
    http().get(path).set('Authorization', auth(u));
  const post = (path: string, u: TestUser, body: object) =>
    http().post(path).set('Authorization', auth(u)).send(body);
  const patch = (path: string, u: TestUser, body: object) =>
    http().patch(path).set('Authorization', auth(u)).send(body);

  async function createUser(label: string): Promise<TestUser> {
    const email = `ma-${label}-${unique}@example.com`;
    const username = `ma${label}${unique}`.slice(0, 16);
    const password = 'Sup3rSecretPassw0rd!';
    await http()
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);
    const login = await http()
      .post('/auth/login')
      .send({ emailOrUsername: email, password })
      .expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    userIds.push(user.id);
    return { id: user.id, accessToken: login.body.accessToken };
  }

  async function mkBan(
    subjectUuid: string,
    init: { status?: 'ACTIVE' | 'REMOVED' } = {},
  ): Promise<{ id: string; ref: string }> {
    seq += 1;
    const sourceId = idBase + BigInt(seq);
    const id = `${idPrefix}${seq}`;
    mirrorIds.push(id);
    await prisma.minecraftPunishment.create({
      data: {
        id,
        sourceId,
        kind: 'BAN',
        status: init.status ?? 'ACTIVE',
        startedAt: new Date(Date.now() - 3_600_000),
        removedAt: init.status === 'REMOVED' ? new Date() : null,
        subjectUuid,
        subjectName: `e2${unique}_${seq}`,
        executorIsConsole: true,
        executorName: 'Console',
        reason: 'читы',
        serverScope: '*',
        rowHash: 'e2e',
      },
    });
    return { id, ref: `ban-${sourceId}` };
  }

  const body = (ref: string) => ({
    type: 'PUNISHMENT_APPEAL',
    description: 'Не согласен с баном',
    appealedPunishmentRef: ref,
  });

  const SOURCE = 'litebans';
  const KINDS = ['BAN', 'MUTE', 'WARN', 'KICK'] as const;
  let player: TestUser;
  let other: TestUser;
  let unlinked: TestUser;
  let staff: TestUser;
  const uPlayer = randomUUID();
  const uOther = randomUUID();
  let originalEnabled: string | null = null;
  let originalSync: Array<{
    kind: (typeof KINDS)[number];
    existed: boolean;
    done: Date | null;
  }> = [];
  const previousKey = process.env.TWO_FACTOR_ENCRYPTION_KEY;
  const SETTING_ENABLED = 'punishments.public.enabled';

  async function ensurePermission(key: string, module: string) {
    if (await prisma.permission.findUnique({ where: { key } })) return;
    await prisma.permission.create({
      data: { key, module, description: `e2e ${unique}` },
    });
    createdPermissionKeys.push(key);
  }

  beforeAll(async () => {
    process.env.TWO_FACTOR_ENCRYPTION_KEY =
      'e2e-mc-appeal-test-only-key-0123456789abcdef';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    permissions = app.get(PermissionService);

    player = await createUser('pl');
    other = await createUser('ot');
    unlinked = await createUser('un');
    staff = await createUser('st');

    const keys = ['reports.view', 'reports.status', 'reports.verdict'];
    for (const k of keys) await ensurePermission(k, 'reports');
    const slug = `ma-staff-${unique}`;
    roleSlugs.push(slug);
    const role = await prisma.role.create({
      data: {
        name: slug,
        slug,
        displayName: slug,
        priority: 20,
        isSystem: false,
        isAssignable: true,
        isSuperuser: false,
      },
    });
    const perms = await prisma.permission.findMany({
      where: { key: { in: keys } },
    });
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
    await prisma.userRole.create({
      data: { userId: staff.id, roleId: role.id },
    });
    await markStaffTwoFactorEnabled(prisma, staff.id);
    await permissions.invalidateUser(staff.id);

    await prisma.minecraftAccount.createMany({
      data: [
        { userId: player.id, uuid: uPlayer, name: `mcp${unique}` },
        { userId: other.id, uuid: uOther, name: `mco${unique}` },
      ],
    });

    originalEnabled =
      (await prisma.siteSetting.findUnique({ where: { key: SETTING_ENABLED } }))
        ?.value ?? null;
    await prisma.siteSetting.upsert({
      where: { key: SETTING_ENABLED },
      update: { value: 'true' },
      create: { key: SETTING_ENABLED, value: 'true' },
    });
    const states = await prisma.punishmentSyncState.findMany({
      where: { source: SOURCE },
    });
    originalSync = KINDS.map((kind) => {
      const s = states.find((x) => x.kind === kind);
      return { kind, existed: Boolean(s), done: s?.initialSyncDoneAt ?? null };
    });
    for (const kind of KINDS) {
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
  }, 60_000);

  afterAll(async () => {
    try {
      if (prisma) {
        const reports = await prisma.report.findMany({
          where: { authorId: { in: userIds } },
          select: { id: true },
        });
        const reportIds = reports.map((r) => r.id);
        if (reportIds.length > 0) {
          await prisma.auditLog.deleteMany({
            where: { targetType: 'report', targetId: { in: reportIds } },
          });
          await prisma.report.deleteMany({ where: { id: { in: reportIds } } });
        }
        if (userIds.length > 0) {
          await prisma.auditLog.deleteMany({
            where: { actorId: { in: userIds } },
          });
        }
        if (mirrorIds.length > 0) {
          await prisma.minecraftPunishment.deleteMany({
            where: { id: { in: mirrorIds } },
          });
        }
        if (roleSlugs.length > 0) {
          await prisma.userRole.deleteMany({
            where: { role: { slug: { in: roleSlugs } } },
          });
          await prisma.rolePermission.deleteMany({
            where: { role: { slug: { in: roleSlugs } } },
          });
          await prisma.role.deleteMany({ where: { slug: { in: roleSlugs } } });
        }
        if (userIds.length > 0) {
          await prisma.user.deleteMany({ where: { id: { in: userIds } } });
        }
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
          await prisma.siteSetting.update({
            where: { key: SETTING_ENABLED },
            data: { value: originalEnabled },
          });
        }
        for (const s of originalSync) {
          if (!s.existed) {
            await prisma.punishmentSyncState.deleteMany({
              where: { source: SOURCE, kind: s.kind },
            });
          } else {
            await prisma.punishmentSyncState.updateMany({
              where: { source: SOURCE, kind: s.kind },
              data: { initialSyncDoneAt: s.done },
            });
          }
        }
      }
    } finally {
      if (previousKey === undefined) {
        delete process.env.TWO_FACTOR_ENCRYPTION_KEY;
      } else {
        process.env.TWO_FACTOR_ENCRYPTION_KEY = previousKey;
      }
      if (app) await app.close();
    }
  }, 40_000);

  it('полный цикл: подача, статус в /punishments/me, очередь персонала, решение не снимает наказание', async () => {
    const ban = await mkBan(uPlayer);
    const created = await post('/reports', player, body(ban.ref)).expect(201);
    expect(created.body.appealedMinecraftPunishment.ref).toBe(ban.ref);
    // Привязка не раскрывает выдавшего и uuid; BigInt не попадает в JSON.
    const createdJson = JSON.stringify(created.body);
    expect(createdJson).not.toContain('Console');
    expect(createdJson).not.toContain(uPlayer);

    let me = await get('/punishments/me?limit=50', player).expect(200);
    let item = me.body.items.find((i: { ref: string }) => i.ref === ban.ref);
    expect(item.appealable).toBe(false);
    expect(item.appeals).toHaveLength(1);
    expect(item.appeals[0]).toMatchObject({
      reportNumber: created.body.reportNumber,
      status: 'PENDING',
      verdict: null,
    });
    expect(Object.keys(item.appeals[0]).sort()).toEqual([
      'createdAt',
      'reportNumber',
      'resolvedAt',
      'status',
      'verdict',
    ]);

    const queue = await get('/moderation/reports?limit=100', staff).expect(200);
    const row = queue.body.items.find(
      (r: { reportNumber: string }) =>
        r.reportNumber === created.body.reportNumber,
    );
    expect(row.appealedMinecraftPunishment.ref).toBe(ban.ref);
    await get('/moderation/reports', player).expect(403);

    await patch(
      `/moderation/reports/${created.body.reportNumber}/status`,
      staff,
      { status: 'IN_REVIEW' },
    ).expect(200);
    await patch(
      `/moderation/reports/${created.body.reportNumber}/verdict`,
      staff,
      { verdict: 'Нарушение подтверждено', status: 'REJECTED' },
    ).expect(200);

    me = await get('/punishments/me?limit=50', player).expect(200);
    item = me.body.items.find((i: { ref: string }) => i.ref === ban.ref);
    expect(item.appeals[0].status).toBe('REJECTED');
    expect(item.appeals[0].verdict).toBe('Нарушение подтверждено');
    const mirror = await prisma.minecraftPunishment.findUniqueOrThrow({
      where: { id: ban.id },
    });
    expect(mirror.status).toBe('ACTIVE');
    expect(mirror.removedAt).toBeNull();
    const audit = await prisma.auditLog.findMany({
      where: { action: 'reports.appeal.create', targetId: created.body.id },
    });
    expect(audit).toHaveLength(1);
  });

  it('одно открытое на наказание: повтор 409; после закрытия - кулдаун 429', async () => {
    const ban = await mkBan(uPlayer);
    const first = await post('/reports', player, body(ban.ref)).expect(201);
    const dup = await post('/reports', player, body(ban.ref)).expect(409);
    expect(dup.body.code).toBe('appeal_already_open');
    await patch(
      `/moderation/reports/${first.body.reportNumber}/status`,
      staff,
      { status: 'CLOSED' },
    ).expect(200);
    const cool = await post('/reports', player, body(ban.ref)).expect(429);
    expect(cool.body.code).toBe('appeal_cooldown');
  });

  it('чужое и несуществующее: 404 одинаково; нет привязки: 403; снятое: 404', async () => {
    const foreign = await mkBan(uOther);
    const a = await post('/reports', player, body(foreign.ref)).expect(404);
    const b = await post('/reports', player, body('ban-999999999999')).expect(
      404,
    );
    expect(a.body.message).toBe(b.body.message);
    const unl = await post('/reports', unlinked, body(foreign.ref)).expect(403);
    expect(unl.body.code).toBe('minecraft_not_linked');
    const removed = await mkBan(uPlayer, { status: 'REMOVED' });
    const rem = await post('/reports', player, body(removed.ref));
    // Снятое: не действует, поэтому не обжалуется (400) либо скрыто (404).
    expect([400, 404]).toContain(rem.status);
  });

  it('валидация: неверный ref 400, ref вместе с appealedPunishmentId 400, ref у другого типа 400', async () => {
    await post('/reports', player, body('xx-1')).expect(400);
    await post('/reports', player, {
      ...body('ban-1'),
      appealedPunishmentId: 'abc',
    }).expect(400);
    await post('/reports', player, {
      type: 'OTHER',
      description: 'x',
      appealedPunishmentRef: 'ban-1',
    }).expect(400);
  });

  it('чужой игрок не видит чужие обжалования в /punishments/me', async () => {
    const ban = await mkBan(uOther);
    const created = await post('/reports', other, body(ban.ref)).expect(201);
    const me = await get('/punishments/me?limit=50', player).expect(200);
    expect(JSON.stringify(me.body)).not.toContain(created.body.reportNumber);
  });
});
