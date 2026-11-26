import { BadRequestException, HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import { encodeCursor, filterHash } from './punishments-cursor';
import {
  PUBLIC_STALE_AFTER_MS,
  PunishmentsReadService,
  isOfflineUuid,
  normalizeAccountUuid,
} from './punishments-read.service';
import type { PunishmentsSettingsService } from './punishments-settings.service';
import type { PunishmentsSyncService } from './punishments-sync.service';
import { filtersForHash } from './punishments-sql';
import { EMPTY_REASON_MAP, MirrorRow } from './punishments-view';
import type { PunishmentsConfig } from './punishments.config';
import type { PunishmentsRuntime } from './punishments.tokens';

/// Тест-план п.3-7, 9, 10, 11, 14, 17, 18, 28: чтение зеркала на моке Prisma.
const NOW = Date.parse('2026-11-17T12:00:00Z');
const GOOD_UUID = '123e4567-e89b-42d3-a456-426614174000';
const OFFLINE_UUID = '123e4567-e89b-32d3-a456-426614174000';

function row(over: Partial<MirrorRow> = {}): MirrorRow {
  return {
    id: 'cl1',
    source: 'litebans',
    sourceScope: 'default',
    kind: 'BAN',
    sourceId: BigInt(42),
    subjectUuid: GOOD_UUID,
    subjectName: 'Steve',
    ipBan: false,
    reason: 'x',
    executorUuid: null,
    executorName: 'ModOne',
    executorIsConsole: false,
    removedByUuid: null,
    removedByName: null,
    removedByIsConsole: false,
    removedReason: null,
    removedAt: null,
    startedAt: new Date('2026-11-01T00:00:00Z'),
    until: null,
    status: 'ACTIVE',
    serverScope: '*',
    serverOrigin: null,
    silent: false,
    template: null,
    rowHash: 'h',
    rev: 1,
    isHidden: false,
    hiddenById: null,
    hiddenReason: null,
    issuerHidden: false,
    issuerHiddenById: null,
    issuerHiddenAt: null,
    issuerHiddenReason: null,
    firstSeenAt: new Date('2026-11-01T00:00:00Z'),
    lastSeenAt: new Date('2026-11-01T00:00:00Z'),
    lastChangedAt: new Date('2026-11-01T00:00:00Z'),
    deletedAtSource: null,
    ...over,
  } as MirrorRow;
}

interface Harness {
  service: PunishmentsReadService;
  prisma: {
    punishmentSyncState: { findMany: jest.Mock };
    minecraftPunishment: { findUnique: jest.Mock };
    minecraftAccount: { findUnique: jest.Mock };
    report: { findMany: jest.Mock };
    server: { findMany: jest.Mock };
    $queryRaw: jest.Mock;
  };
  audit: { logInTx: jest.Mock };
  settings: { readPublic: jest.Mock };
  sync: { isConfigured: boolean; onChange: jest.Mock };
  fireSyncChange: () => void;
  clock: { now: number };
}

function readyStates(lastSuccessAt: Date | null = new Date(NOW - 1000)) {
  return ['BAN', 'MUTE', 'WARN', 'KICK'].map((kind) => ({
    source: 'litebans',
    kind,
    initialSyncDoneAt: new Date(NOW - 10_000),
    lastSuccessAt,
  }));
}

function make(
  over: { hideSilent?: boolean; configured?: boolean } = {},
): Harness {
  const clock = { now: NOW };
  const prisma = {
    punishmentSyncState: {
      findMany: jest.fn().mockResolvedValue(readyStates()),
    },
    minecraftPunishment: { findUnique: jest.fn().mockResolvedValue(null) },
    minecraftAccount: { findUnique: jest.fn().mockResolvedValue(null) },
    report: { findMany: jest.fn().mockResolvedValue([]) },
    server: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const audit = { logInTx: jest.fn().mockResolvedValue(undefined) };
  const settings = {
    readPublic: jest.fn().mockResolvedValue({
      enabled: true,
      hideSilent: over.hideSilent ?? true,
      reasonMap: EMPTY_REASON_MAP,
      fingerprint: 'fp',
    }),
  };
  let onChange: () => void = () => undefined;
  const sync = {
    isConfigured: over.configured ?? true,
    onChange: jest.fn((cb: () => void) => {
      onChange = cb;
    }),
  };
  const runtime: PunishmentsRuntime = {
    now: () => clock.now,
    sleep: () => Promise.resolve(),
    random: () => 0,
  };
  const service = new PunishmentsReadService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    settings as unknown as PunishmentsSettingsService,
    sync as unknown as PunishmentsSyncService,
    { enabled: true } as unknown as PunishmentsConfig,
    runtime,
  );
  return {
    service,
    prisma,
    audit,
    settings,
    sync,
    fireSyncChange: () => onChange(),
    clock,
  };
}

async function thrown(p: Promise<unknown>): Promise<HttpException> {
  try {
    await p;
  } catch (e) {
    return e as HttpException;
  }
  throw new Error('ожидалась ошибка');
}

function sqlOf(h: Harness, call = 0): Prisma.Sql {
  return h.prisma.$queryRaw.mock.calls[call][0] as Prisma.Sql;
}

describe('getPublic: предикат публичности (п.3, 4, 5)', () => {
  it('видимая запись отдаётся', async () => {
    const h = make();
    h.prisma.minecraftPunishment.findUnique.mockResolvedValue(row());
    const res = await h.service.getPublic('ban-42');
    expect(res.item.ref).toBe('ban-42');
    expect(res.meta.stale).toBe(false);
  });

  const hiddenCases: Array<[string, Partial<MirrorRow>]> = [
    ['isHidden', { isHidden: true }],
    ['silent при hideSilent', { silent: true }],
    ['ipBan с валидным ником', { ipBan: true }],
    ['DELETED_AT_SOURCE', { status: 'DELETED_AT_SOURCE' }],
    ['без ника', { subjectName: null }],
    ['ник с маркером', { subjectName: 'x[скрыто]' }],
    ['ник длиннее 16', { subjectName: 'A'.repeat(17) }],
    ['ник вне формата', { subjectName: 'a b' }],
    ['WARN', { kind: 'WARN' }],
  ];

  it.each(hiddenCases)('%s: 404 punishments_not_found', async (_n, over) => {
    const h = make();
    h.prisma.minecraftPunishment.findUnique.mockResolvedValue(row(over));
    const err = await thrown(h.service.getPublic('ban-42'));
    expect(err.getStatus()).toBe(404);
    expect(err.getResponse()).toMatchObject({ code: 'punishments_not_found' });
  });

  it('тела 404 идентичны для всех причин', async () => {
    const bodies: unknown[] = [];
    for (const [, over] of hiddenCases) {
      const h = make();
      h.prisma.minecraftPunishment.findUnique.mockResolvedValue(row(over));
      bodies.push((await thrown(h.service.getPublic('ban-42'))).getResponse());
    }
    const missing = make();
    bodies.push(
      (await thrown(missing.service.getPublic('ban-42'))).getResponse(),
    );
    for (const b of bodies) expect(b).toEqual(bodies[0]);
  });

  it('silent при выключенном hideSilent виден', async () => {
    const h = make({ hideSilent: false });
    h.prisma.minecraftPunishment.findUnique.mockResolvedValue(
      row({ silent: true }),
    );
    await expect(h.service.getPublic('ban-42')).resolves.toBeDefined();
  });

  it.each([
    'ban-99999999999999999999',
    'ban-9223372036854775808',
    'ban-01',
    'ban-1x',
    'warn-1',
    'junk',
  ])('ref %s: тот же 404 без обращения к БД по записи', async (ref) => {
    const h = make();
    const err = await thrown(h.service.getPublic(ref));
    expect(err.getStatus()).toBe(404);
    expect(err.getResponse()).toMatchObject({ code: 'punishments_not_found' });
    expect(h.prisma.minecraftPunishment.findUnique).not.toHaveBeenCalled();
  });

  it('выборка по ref содержит source litebans и sourceScope default', async () => {
    const h = make();
    h.prisma.minecraftPunishment.findUnique.mockResolvedValue(row());
    await h.service.getPublic('mute-7');
    expect(h.prisma.minecraftPunishment.findUnique).toHaveBeenCalledWith({
      where: {
        source_sourceScope_kind_sourceId: {
          source: 'litebans',
          sourceScope: 'default',
          kind: 'MUTE',
          sourceId: BigInt(7),
        },
      },
    });
  });
});

describe('недоступность и stale (п.14)', () => {
  it('нет строки состояния - 503 punishments_unavailable', async () => {
    const h = make();
    h.prisma.punishmentSyncState.findMany.mockResolvedValue([]);
    const err = await thrown(h.service.listPublic({}));
    expect(err.getStatus()).toBe(503);
    expect(err.getResponse()).toMatchObject({
      code: 'punishments_unavailable',
    });
  });

  it('у одного из нужных видов нет initialSyncDoneAt - 503', async () => {
    const h = make();
    const states = readyStates();
    states[1] = { ...states[1], initialSyncDoneAt: null as unknown as Date };
    h.prisma.punishmentSyncState.findMany.mockResolvedValue(states);
    expect((await thrown(h.service.listPublic({}))).getStatus()).toBe(503);
  });

  it('публичному слою не нужны WARN и KICK', async () => {
    const h = make();
    h.prisma.punishmentSyncState.findMany.mockResolvedValue(
      readyStates().slice(0, 2),
    );
    const res = await h.service.listPublic({});
    expect(res.meta.stale).toBe(false);
  });

  it('данные есть, источник выключен - 200 со stale true', async () => {
    const h = make({ configured: false });
    const res = await h.service.listPublic({});
    expect(res.meta.stale).toBe(true);
  });

  it('самый старый lastSuccessAt определяет stale', async () => {
    const h = make();
    const states = readyStates();
    states[0] = {
      ...states[0],
      lastSuccessAt: new Date(NOW - PUBLIC_STALE_AFTER_MS - 1),
    };
    h.prisma.punishmentSyncState.findMany.mockResolvedValue(states);
    expect((await h.service.listPublic({})).meta.stale).toBe(true);
  });

  it('граница порога: ровно 5 минут - ещё не stale', async () => {
    const h = make();
    h.prisma.punishmentSyncState.findMany.mockResolvedValue(
      readyStates(new Date(NOW - PUBLIC_STALE_AFTER_MS)),
    );
    expect((await h.service.listPublic({})).meta.stale).toBe(false);
  });

  it('lastSuccessAt нет - stale true', async () => {
    const h = make();
    h.prisma.punishmentSyncState.findMany.mockResolvedValue(readyStates(null));
    expect((await h.service.listPublic({})).meta.stale).toBe(true);
  });

  it('503 не кэшируется', async () => {
    const h = make();
    h.prisma.punishmentSyncState.findMany.mockResolvedValueOnce([]);
    await thrown(h.service.listPublic({}));
    await expect(h.service.listPublic({})).resolves.toBeDefined();
  });
});

describe('listPublic: курсор, SQL, кэш (п.11, 13, 17, 18)', () => {
  it('предикат публичности и параметризация запроса', async () => {
    const h = make();
    await h.service.listPublic({ name: 'Ab_%' });
    const sql = sqlOf(h);
    expect(sql.sql).toContain(`"ipBan" = false`);
    expect(sql.sql).toContain(`"isHidden" = false`);
    expect(sql.sql).toContain(`"status" <> 'DELETED_AT_SOURCE'`);
    expect(sql.sql).toContain(`"silent" = false`);
    // Значение поиска идёт параметром, а не в тексте запроса.
    expect(sql.sql).not.toMatch(/ab/i);
    expect(sql.values).toContain('ab\\_\\%%');
  });

  it('hideSilent=false убирает условие по silent', async () => {
    const h = make({ hideSilent: false });
    await h.service.listPublic({});
    expect(sqlOf(h).sql).not.toContain(`"silent" = false`);
  });

  it('лишняя строка даёт nextCursor, которому соответствует следующая страница', async () => {
    const h = make();
    const rows = [
      row({ id: 'a', startedAt: new Date('2026-11-03T00:00:00Z') }),
      row({ id: 'b', startedAt: new Date('2026-11-02T00:00:00Z') }),
      row({ id: 'c', startedAt: new Date('2026-11-01T00:00:00Z') }),
    ];
    h.prisma.$queryRaw.mockResolvedValue(rows);
    const page = await h.service.listPublic({ limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();
    h.prisma.$queryRaw.mockResolvedValue([rows[2]]);
    const next = await h.service.listPublic({
      limit: 2,
      cursor: page.nextCursor!,
    });
    expect(next.nextCursor).toBeNull();
    const second = sqlOf(h, 1);
    expect(second.sql).toContain(`("startedAt", "id") <`);
    expect(second.values).toContain('b');
  });

  it('без лишней строки nextCursor = null', async () => {
    const h = make();
    h.prisma.$queryRaw.mockResolvedValue([row()]);
    expect((await h.service.listPublic({ limit: 2 })).nextCursor).toBeNull();
  });

  it('неверный курсор - 400 punishments_invalid_cursor, БД не читается', async () => {
    const h = make();
    const err = await thrown(h.service.listPublic({ cursor: 'garbage!' }));
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({
      code: 'punishments_invalid_cursor',
    });
    expect(h.prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('курсор от другого порядка и другого набора фильтров - 400', async () => {
    const h = make();
    h.prisma.$queryRaw.mockResolvedValue([
      row({ id: 'a' }),
      row({ id: 'b' }),
      row({ id: 'c' }),
    ]);
    const page = await h.service.listPublic({ limit: 2, kind: 'BAN' });
    const cursor = page.nextCursor!;
    expect(
      (
        await thrown(h.service.listPublic({ limit: 2, kind: 'MUTE', cursor }))
      ).getStatus(),
    ).toBe(400);
    expect(
      (
        await thrown(
          h.service.listPublic({ limit: 2, kind: 'BAN', cursor, order: 'asc' }),
        )
      ).getStatus(),
    ).toBe(400);
  });

  it('публичный курсор не годится для служебного списка', async () => {
    const h = make();
    const publicHash = filterHash('public', {});
    const cursor = encodeCursor({ t: 1, i: 'a' }, 'desc', publicHash);
    expect((await thrown(h.service.listStaff({ cursor }))).getStatus()).toBe(
      400,
    );
  });

  it('повторный запрос берётся из кэша; сброс и сигнал синхронизации очищают его', async () => {
    const h = make();
    await h.service.listPublic({});
    await h.service.listPublic({});
    expect(h.prisma.$queryRaw).toHaveBeenCalledTimes(1);
    h.service.invalidatePublicCache();
    await h.service.listPublic({});
    expect(h.prisma.$queryRaw).toHaveBeenCalledTimes(2);
    h.fireSyncChange();
    await h.service.listPublic({});
    expect(h.prisma.$queryRaw).toHaveBeenCalledTimes(3);
  });

  it('кэш истекает через 5 секунд', async () => {
    const h = make();
    await h.service.listPublic({});
    h.clock.now += 5001;
    await h.service.listPublic({});
    expect(h.prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('смена настроек (fingerprint) даёт другой ключ кэша', async () => {
    const h = make();
    await h.service.listPublic({});
    h.settings.readPublic.mockResolvedValue({
      enabled: true,
      hideSilent: true,
      reasonMap: EMPTY_REASON_MAP,
      fingerprint: 'fp2',
    });
    await h.service.listPublic({});
    expect(h.prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('разные cursor - разные ключи; свыше 100 ключей кэш не растёт', async () => {
    const h = make();
    const hash = filterHash(
      'public',
      filtersForHash({ filters: {}, hideSilent: true }),
    );
    for (let i = 0; i < 110; i += 1) {
      await h.service.listPublic({
        cursor: encodeCursor({ t: i, i: `id${i}` }, 'desc', hash),
      });
    }
    expect(h.service.cache.size).toBe(100);
  });
});

describe('listMine (п.6, 7)', () => {
  it('нет привязки - linked:false, без запросов списка и без проверки доступности', async () => {
    const h = make();
    const res = await h.service.listMine('u1', {});
    expect(res).toMatchObject({ linked: false, items: [], nextCursor: null });
    expect(h.prisma.$queryRaw).not.toHaveBeenCalled();
    expect(h.prisma.punishmentSyncState.findMany).not.toHaveBeenCalled();
  });

  it('офлайн-uuid (версия 3) - linked:false и пустой список', async () => {
    const h = make();
    h.prisma.minecraftAccount.findUnique.mockResolvedValue({
      uuid: OFFLINE_UUID,
    });
    h.prisma.$queryRaw.mockResolvedValue([row()]);
    const res = await h.service.listMine('u1', {});
    expect(res.linked).toBe(false);
    expect(res.items).toEqual([]);
    expect(h.prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('uuid без дефисов нормализуется, мусорный - как нет привязки', async () => {
    const h = make();
    h.prisma.minecraftAccount.findUnique.mockResolvedValue({
      uuid: GOOD_UUID.replace(/-/g, '').toUpperCase(),
    });
    h.prisma.$queryRaw.mockResolvedValue([row()]);
    const ok = await h.service.listMine('u1', {});
    expect(ok.linked).toBe(true);
    expect(sqlOf(h).values).toContain(GOOD_UUID);

    const bad = make();
    bad.prisma.minecraftAccount.findUnique.mockResolvedValue({ uuid: 'zzz' });
    expect((await bad.service.listMine('u1', {})).linked).toBe(false);
  });

  it('привязка ищется по userId; запрос идёт только по своему uuid, ник не используется', async () => {
    const h = make();
    h.prisma.minecraftAccount.findUnique.mockResolvedValue({ uuid: GOOD_UUID });
    h.prisma.$queryRaw.mockResolvedValue([row({ kind: 'WARN' })]);
    const res = await h.service.listMine('user-7', {});
    expect(h.prisma.minecraftAccount.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-7' },
      select: { uuid: true },
    });
    const sql = sqlOf(h);
    expect(sql.sql).toContain(`"subjectUuid" =`);
    expect(sql.sql).not.toContain('subjectName" ~');
    expect(sql.sql).toContain(`"status" <> 'DELETED_AT_SOURCE'`);
    expect(sql.values).toContain(GOOD_UUID);
    expect(res.items[0].kind).toBe('WARN');
  });

  it('обжалования: только свои, статус и вердикт, appealable=false при открытом', async () => {
    const h = make();
    h.prisma.minecraftAccount.findUnique.mockResolvedValue({ uuid: GOOD_UUID });
    h.prisma.$queryRaw.mockResolvedValue([
      row({ id: 'cl1' }),
      row({ id: 'cl2' }),
    ]);
    h.prisma.report.findMany.mockResolvedValue([
      {
        appealedMinecraftPunishmentId: 'cl1',
        reportNumber: 'R-2',
        status: 'IN_REVIEW',
        createdAt: new Date('2026-11-05T00:00:00Z'),
        resolvedAt: null,
        verdict: null,
      },
      {
        appealedMinecraftPunishmentId: 'cl2',
        reportNumber: 'R-1',
        status: 'REJECTED',
        createdAt: new Date('2026-11-01T00:00:00Z'),
        resolvedAt: new Date('2026-11-02T00:00:00Z'),
        verdict: 'в'.repeat(1500),
      },
    ]);
    const res = await h.service.listMine('user-7', {});
    const where = h.prisma.report.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      authorId: 'user-7',
      type: 'PUNISHMENT_APPEAL',
      appealedMinecraftPunishmentId: { in: ['cl1', 'cl2'] },
    });
    const [a, b] = res.items;
    expect(a.appealable).toBe(false);
    expect(a.appeals).toEqual([
      {
        reportNumber: 'R-2',
        status: 'IN_REVIEW',
        createdAt: '2026-11-05T00:00:00.000Z',
        resolvedAt: null,
        verdict: null,
      },
    ]);
    expect(b.appealable).toBe(true);
    expect(b.appeals[0].status).toBe('REJECTED');
    expect(b.appeals[0].verdict).toHaveLength(1000);
    expect(JSON.stringify(res)).not.toMatch(/assignedTo|internalNote|authorId/);
  });

  it('без наказаний обжалования не запрашиваются', async () => {
    const h = make();
    h.prisma.minecraftAccount.findUnique.mockResolvedValue({ uuid: GOOD_UUID });
    h.prisma.$queryRaw.mockResolvedValue([]);
    await h.service.listMine('user-7', {});
    expect(h.prisma.report.findMany).not.toHaveBeenCalled();
  });

  it('DELETED_AT_SOURCE, попавший в выборку, не отдаётся', async () => {
    const h = make();
    h.prisma.minecraftAccount.findUnique.mockResolvedValue({ uuid: GOOD_UUID });
    h.prisma.$queryRaw.mockResolvedValue([
      row({ status: 'DELETED_AT_SOURCE' }),
      row({ id: 'z', sourceId: BigInt(5) }),
    ]);
    const res = await h.service.listMine('u1', {});
    expect(res.items).toHaveLength(1);
  });

  it('ACTIVE с истёкшим until попадает как EXPIRED (п.10)', async () => {
    const h = make();
    h.prisma.minecraftAccount.findUnique.mockResolvedValue({ uuid: GOOD_UUID });
    h.prisma.$queryRaw.mockResolvedValue([
      row({ until: new Date(NOW - 1000) }),
    ]);
    const res = await h.service.listMine('u1', {});
    expect(res.items[0].status).toBe('EXPIRED');
  });

  it('есть привязка, но данные не загружены - 503', async () => {
    const h = make();
    h.prisma.minecraftAccount.findUnique.mockResolvedValue({ uuid: GOOD_UUID });
    h.prisma.punishmentSyncState.findMany.mockResolvedValue([]);
    expect((await thrown(h.service.listMine('u1', {}))).getStatus()).toBe(503);
  });
});

describe('listStaff (п.8, 12, 28)', () => {
  it('from > to - 400; from == to допустим', async () => {
    const h = make();
    const err = await thrown(
      h.service.listStaff({
        from: '2026-01-02T00:00:00Z',
        to: '2026-01-01T00:00:00Z',
      }),
    );
    expect(err.getStatus()).toBe(400);
    await expect(
      h.service.listStaff({
        from: '2026-01-01T00:00:00Z',
        to: '2026-01-01T00:00:00Z',
      }),
    ).resolves.toBeDefined();
  });

  it('невозможная дата (2026-02-31) - 400', async () => {
    const h = make();
    const err = await thrown(
      h.service.listStaff({ from: '2026-13-45T00:00:00Z' }),
    );
    expect(err.getStatus()).toBe(400);
  });

  it('список ничего не пишет в аудит', async () => {
    const h = make();
    h.prisma.$queryRaw.mockResolvedValue([row()]);
    const res = await h.service.listStaff({});
    expect(res.items).toHaveLength(1);
    expect(h.audit.logInTx).not.toHaveBeenCalled();
  });

  it('предикат публичности не применяется, DELETED_AT_SOURCE видимы, булевы параметризуются', async () => {
    const h = make();
    await h.service.listStaff({ ipBan: true, hidden: false });
    const sql = sqlOf(h);
    expect(sql.sql).not.toContain(`"ipBan" = false`);
    expect(sql.sql).not.toContain(`'DELETED_AT_SOURCE'`);
    expect(sql.sql).toContain(`"ipBan" =`);
    expect(sql.values).toEqual(expect.arrayContaining([true, false]));
  });

  it('элементы содержат реального выдавшего, но не IP', async () => {
    const h = make();
    h.prisma.$queryRaw.mockResolvedValue([
      row({ issuerHidden: true, executorUuid: GOOD_UUID }),
    ]);
    const res = await h.service.listStaff({});
    expect(res.items[0].executor).toMatchObject({ name: 'ModOne' });
    expect(JSON.stringify(res)).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
  });
});

describe('staffCard: аудит просмотра (п.9, 28)', () => {
  it('ровно одна запись punishment.card.view с ref и subjectUuid', async () => {
    const h = make();
    h.prisma.minecraftPunishment.findUnique.mockResolvedValue(row());
    const res = await h.service.staffCard('staff-1', 'ban-42');
    expect(res.item.ref).toBe('ban-42');
    expect(h.audit.logInTx).toHaveBeenCalledTimes(1);
    expect(h.audit.logInTx).toHaveBeenCalledWith(
      h.prisma,
      expect.objectContaining({
        actorId: 'staff-1',
        action: 'punishment.card.view',
        targetType: 'MinecraftPunishment',
        targetId: 'cl1',
        changes: { ref: 'ban-42', subjectUuid: GOOD_UUID },
      }),
    );
  });

  it('сбой записи аудита - исключение, данные не отдаются', async () => {
    const h = make();
    h.prisma.minecraftPunishment.findUnique.mockResolvedValue(row());
    h.audit.logInTx.mockRejectedValue(new Error('db down'));
    await expect(h.service.staffCard('s', 'ban-42')).rejects.toThrow('db down');
  });

  it('несуществующая запись и ref вне формата - 404 без аудита', async () => {
    const h = make();
    expect((await thrown(h.service.staffCard('s', 'ban-42'))).getStatus()).toBe(
      404,
    );
    expect((await thrown(h.service.staffCard('s', 'ban-0'))).getStatus()).toBe(
      404,
    );
    expect(h.audit.logInTx).not.toHaveBeenCalled();
  });

  it('данные не загружены - 503 без аудита', async () => {
    const h = make();
    h.prisma.punishmentSyncState.findMany.mockResolvedValue([]);
    expect((await thrown(h.service.staffCard('s', 'ban-42'))).getStatus()).toBe(
      503,
    );
    expect(h.audit.logInTx).not.toHaveBeenCalled();
  });

  it('карточка персонала видит скрытые и WARN, список-карточка: открытие списка и затем карточки даёт одну запись', async () => {
    const h = make();
    h.prisma.minecraftPunishment.findUnique.mockResolvedValue(
      row({ kind: 'WARN', isHidden: true, ipBan: true }),
    );
    h.prisma.$queryRaw.mockResolvedValue([row()]);
    await h.service.listStaff({});
    await h.service.staffCard('s', 'warn-42');
    expect(h.audit.logInTx).toHaveBeenCalledTimes(1);
  });
});

describe('adminStatus', () => {
  it('отдаёт только коды SOURCE_*, тексты ошибок не отдаются', async () => {
    const h = make();
    h.prisma.punishmentSyncState.findMany.mockResolvedValue([
      {
        kind: 'BAN',
        initialSyncDoneAt: new Date(NOW),
        lastSuccessAt: new Date(NOW),
        consecutiveFailures: 2,
        lastErrorCode: 'SOURCE_TIMEOUT',
      },
      {
        kind: 'MUTE',
        initialSyncDoneAt: null,
        lastSuccessAt: null,
        consecutiveFailures: 1,
        lastErrorCode: 'ECONNREFUSED mysql://user:pass@10.0.0.1',
      },
    ]);
    const status = await h.service.adminStatus();
    expect(status.kinds).toHaveLength(4);
    expect(status.kinds[0].lastErrorCode).toBe('SOURCE_TIMEOUT');
    expect(status.kinds[1].lastErrorCode).toBeNull();
    expect(status.kinds[1].initialSyncDone).toBe(false);
    expect(status.kinds[2]).toMatchObject({
      initialSyncDone: false,
      lastSuccessAt: null,
      consecutiveFailures: 0,
    });
    expect(JSON.stringify(status)).not.toContain('pass');
  });
});

describe('uuid-помощники (п.7)', () => {
  it('normalizeAccountUuid и isOfflineUuid', () => {
    expect(normalizeAccountUuid(GOOD_UUID.replace(/-/g, ''))).toBe(GOOD_UUID);
    expect(normalizeAccountUuid(` ${GOOD_UUID.toUpperCase()} `)).toBe(
      GOOD_UUID,
    );
    expect(normalizeAccountUuid('zzz')).toBeNull();
    expect(isOfflineUuid(OFFLINE_UUID)).toBe(true);
    expect(isOfflineUuid(GOOD_UUID)).toBe(false);
    expect(isOfflineUuid('nope')).toBe(false);
  });
});
