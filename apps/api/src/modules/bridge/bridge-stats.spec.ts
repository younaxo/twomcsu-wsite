import {
  FakePrisma,
  FakeRedisClient,
  SLUG,
  fakeRedisService,
  makeEvent,
  makeServer,
} from '../../../test/support/bridge-support';
import { BridgeIngestService } from './bridge-ingest.service';
import { BridgePunishmentSource } from './bridge-punishment.source';
import { BridgeRedisService, RecordLockTimeout } from './bridge-redis.service';
import {
  BridgeBatch,
  parseEnvelope,
  parseStatsSnapshot,
} from './bridge-schema';
import {
  BridgeStatsService,
  RANKINGS_INVALIDATE_INTERVAL_MS,
} from './bridge-stats.service';
import { BridgeConfig } from './bridge.config';
import { BridgeAuthContext } from './bridge.types';
import { resolveCapabilities } from './bridge-capabilities';

const UUID = '069a79f4-44e9-4726-a5be-fca90e38aaf5';
const METRICS = { playTimeMinutes: 90, kills: 10, deaths: 4, hits: 50 };

function config(over: Partial<BridgeConfig> = {}): BridgeConfig {
  return {
    enabled: true,
    masterSecret: Buffer.alloc(32, 1),
    timestampWindowS: 60,
    maxBodyBytes: 262_144,
    keyOverlapDays: 7,
    applyLatencyLimitMs: 2000,
    bodyReadTimeoutMs: 10000,
    deliveryEnabled: false,
    statsEnabled: true,
    ...over,
  };
}

function ctx(
  capabilities: unknown = { punishments: true, 'player-events': true },
) {
  const server = makeServer({ capabilities: capabilities as never });
  return {
    keyId: `${server.slug}.1`,
    slug: server.slug,
    generation: 1,
    server,
    capabilities: resolveCapabilities(server.capabilities),
  } as BridgeAuthContext;
}

function batch(events: Array<Record<string, unknown>>): BridgeBatch {
  const parsed = parseEnvelope({
    schema: 'twomc.bridge.v1',
    sentAt: new Date().toISOString(),
    events,
  });
  if (!parsed.ok) throw new Error('test batch invalid');
  return parsed.value;
}

interface StatRow {
  userId: string;
  playTime: number;
  kills: number;
  deaths: number;
  hits: number;
  killDeathRatio: number;
  lastServer: string | null;
}

function setup(cfg: BridgeConfig = config(), linked = true) {
  const prisma = new FakePrisma() as FakePrisma & Record<string, unknown>;
  const rows = new Map<string, StatRow>();
  const upsert = jest.fn(
    ({
      where,
      create,
      update,
    }: {
      where: { userId: string };
      create: StatRow;
      update: Partial<StatRow>;
    }) => {
      const cur = rows.get(where.userId);
      const next = cur ? { ...cur, ...update } : { ...create };
      rows.set(where.userId, next);
      return Promise.resolve(next);
    },
  );
  prisma.minecraftAccount = {
    findUnique: jest.fn(({ where }: { where: { uuid: string } }) =>
      Promise.resolve(linked && where.uuid === UUID ? { userId: 'u1' } : null),
    ),
  };
  prisma.playerStatistics = {
    findUnique: jest.fn(({ where }: { where: { userId: string } }) =>
      Promise.resolve(rows.get(where.userId) ?? null),
    ),
    upsert,
  };
  const redisClient = new FakeRedisClient();
  const redis = new BridgeRedisService(fakeRedisService(redisClient));
  const leaderboards = { invalidate: jest.fn() };
  const stats = new BridgeStatsService(
    prisma as never,
    redis,
    leaderboards as never,
  );
  const source = new BridgePunishmentSource();
  source.subscribe(() => undefined);
  const service = new BridgeIngestService(
    cfg,
    prisma as never,
    redis,
    source,
    stats,
  );
  return { service, rows, upsert, redisClient, leaderboards, stats };
}

const snap = (
  metrics: Record<string, unknown> = METRICS,
  ev: Record<string, unknown> = {},
) => makeEvent('player.stats.snapshot', { uuid: UUID, metrics }, ev);

describe('parseStatsSnapshot', () => {
  it('принимает белый список и приводит uuid к нижнему регистру', () => {
    const r = parseStatsSnapshot({
      uuid: UUID.toUpperCase(),
      name: 'Steve',
      metrics: { kills: 0, playTimeMinutes: 5 },
    });
    expect(r).toEqual({
      ok: true,
      value: { uuid: UUID, metrics: { kills: 0, playTimeMinutes: 5 } },
    });
  });

  const m = { kills: 1 };
  it.each([
    ['serverId в теле', { uuid: UUID, metrics: m, serverId: 'x' }],
    ['ip', { uuid: UUID, metrics: m, ip: '1.2.3.4' }],
    ['нет uuid', { metrics: m }],
    ['плохой uuid', { uuid: 'abc', metrics: m }],
    ['пустые metrics', { uuid: UUID, metrics: {} }],
    ['metrics массив', { uuid: UUID, metrics: [] }],
    ['coins вне белого списка', { uuid: UUID, metrics: { coins: 1 } }],
    ['purchases вне белого списка', { uuid: UUID, metrics: { purchases: 1 } }],
    ['отрицательное', { uuid: UUID, metrics: { kills: -1 } }],
    ['дробное', { uuid: UUID, metrics: { kills: 1.5 } }],
    ['строка', { uuid: UUID, metrics: { kills: '1' } }],
    ['NaN', { uuid: UUID, metrics: { kills: NaN } }],
    ['выше предела', { uuid: UUID, metrics: { playTimeMinutes: 5_000_001 } }],
    ['имя длиннее 32', { uuid: UUID, name: 'x'.repeat(33), metrics: m }],
  ])('отклоняет: %s', (_name, data) => {
    expect(parseStatsSnapshot(data as Record<string, unknown>).ok).toBe(false);
  });
});

describe('BridgeIngestService: player.stats.snapshot', () => {
  it('записывает метрики и K/D, lastServer из ключа, сбрасывает кэш', async () => {
    const { service, rows, leaderboards } = setup();
    const ev = snap();
    const [res] = await service.ingest(ctx(), batch([ev]));
    expect(res).toEqual({ eventId: ev.eventId, status: 'accepted' });
    expect(rows.get('u1')).toMatchObject({
      playTime: 90,
      kills: 10,
      deaths: 4,
      hits: 50,
      killDeathRatio: 2.5,
      lastServer: SLUG,
    });
    expect(leaderboards.invalidate).toHaveBeenCalledTimes(1);
  });

  it('частичный снимок не обнуляет остальные поля', async () => {
    const { service, rows } = setup();
    await service.ingest(ctx(), batch([snap()]));
    const later = new Date(Date.now() + 1000).toISOString();
    await service.ingest(
      ctx(),
      batch([snap({ kills: 20 }, { occurredAt: later })]),
    );
    expect(rows.get('u1')).toMatchObject({
      kills: 20,
      deaths: 4,
      playTime: 90,
    });
  });

  it('повтор того же eventId - duplicate, одна запись', async () => {
    const { service, upsert } = setup();
    const ev = snap();
    await service.ingest(ctx(), batch([ev]));
    const [res] = await service.ingest(ctx(), batch([ev]));
    expect(res.status).toBe('duplicate');
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('тот же eventId с другим содержимым - conflict', async () => {
    const { service } = setup();
    const ev = snap();
    await service.ingest(ctx(), batch([ev]));
    const [res] = await service.ingest(
      ctx(),
      batch([{ ...ev, data: { uuid: UUID, metrics: { kills: 999 } } }]),
    );
    expect(res).toMatchObject({ status: 'rejected', code: 'conflict' });
  });

  it('более старый снимок не перезаписывает более новый (stale)', async () => {
    const { service, rows } = setup();
    const now = Date.now();
    const newer = new Date(now - 1000).toISOString();
    const older = new Date(now - 60_000).toISOString();
    await service.ingest(
      ctx(),
      batch([snap({ kills: 50 }, { occurredAt: newer })]),
    );
    const [res] = await service.ingest(
      ctx(),
      batch([snap({ kills: 7 }, { occurredAt: older })]),
    );
    expect(res.status).toBe('stale');
    expect(rows.get('u1')?.kills).toBe(50);
  });

  it('игрок без привязки: accepted, ничего не записано, кэш не сброшен', async () => {
    const { service, rows, leaderboards } = setup(config(), false);
    const [res] = await service.ingest(ctx(), batch([snap()]));
    expect(res.status).toBe('accepted');
    expect(rows.size).toBe(0);
    expect(leaderboards.invalidate).not.toHaveBeenCalled();
  });

  it('невалидные данные - invalid_data, без записи', async () => {
    const { service, rows } = setup();
    const [res] = await service.ingest(ctx(), batch([snap({ coins: 5 })]));
    expect(res).toMatchObject({ status: 'rejected', code: 'invalid_data' });
    expect(rows.size).toBe(0);
  });

  it('serverId события не совпадает с ключом - server_mismatch', async () => {
    const { service } = setup();
    const [res] = await service.ingest(
      ctx(),
      batch([snap(METRICS, { serverId: 'other' })]),
    );
    expect(res).toMatchObject({ status: 'rejected', code: 'server_mismatch' });
  });

  it('occurredAt вне окна - invalid_data', async () => {
    const { service } = setup();
    const old = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
    const [res] = await service.ingest(
      ctx(),
      batch([snap(METRICS, { occurredAt: old })]),
    );
    expect(res).toMatchObject({ status: 'rejected', code: 'invalid_data' });
  });

  it('флаг выключен - unsupported_type', async () => {
    const { service, rows } = setup(config({ statsEnabled: false }));
    const [res] = await service.ingest(ctx(), batch([snap()]));
    expect(res).toMatchObject({ status: 'rejected', code: 'unsupported_type' });
    expect(rows.size).toBe(0);
  });

  it('нет возможности player-events - unsupported_type', async () => {
    const { service } = setup();
    const [res] = await service.ingest(
      ctx({ punishments: true }),
      batch([snap()]),
    );
    expect(res).toMatchObject({ status: 'rejected', code: 'unsupported_type' });
  });

  it('сбой Redis - исключение (503 вызывающему)', async () => {
    const { service, redisClient } = setup();
    redisClient.failAll = true;
    await expect(service.ingest(ctx(), batch([snap()]))).rejects.toThrow();
  });
});

describe('BridgeStatsService.invalidateRankings: троттлинг', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('серия вызовов: один сразу и один отложенный в конце интервала', () => {
    const { stats, leaderboards } = setup();
    for (let i = 0; i < 20; i++) stats.invalidateRankings();
    expect(leaderboards.invalidate).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(RANKINGS_INVALIDATE_INTERVAL_MS + 1);
    expect(leaderboards.invalidate).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(RANKINGS_INVALIDATE_INTERVAL_MS * 3);
    expect(leaderboards.invalidate).toHaveBeenCalledTimes(2);
  });
});

describe('бан через Bridge сбрасывает кэш рейтингов (Q109)', () => {
  const punishment = (kind: string) =>
    makeEvent('punishment.created', {
      kind,
      sourceId: '123',
      startedAt: new Date().toISOString(),
      subjectUuid: UUID,
      subjectName: 'Steve',
    });

  it('BAN только инвалидирует кэш (isBanned не меняется), MUTE - нет', async () => {
    const { service, leaderboards } = setup();
    await service.ingest(ctx(), batch([punishment('MUTE')]));
    expect(leaderboards.invalidate).not.toHaveBeenCalled();
    await service.ingest(ctx(), batch([punishment('BAN')]));
    expect(leaderboards.invalidate).toHaveBeenCalledTimes(1);
  });

  it('работает и при выключенной статистике', async () => {
    const { service, leaderboards } = setup(config({ statsEnabled: false }));
    await service.ingest(ctx(), batch([punishment('BAN')]));
    expect(leaderboards.invalidate).toHaveBeenCalledTimes(1);
  });
});

const MARKER_KEY = 'bridge:ps:all:stats:u1';
const LOCK_KEY = 'bridge:pl:all:stats:u1';
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

describe('применение: сбой, повтор, маркер (L2, L7)', () => {
  it('сбой записи в БД не сдвигает маркер; повтор того же события применяется', async () => {
    const { service, rows, upsert, redisClient } = setup();
    const ev = snap();
    upsert.mockRejectedValueOnce(new Error('db down'));
    await expect(service.ingest(ctx(), batch([ev]))).rejects.toThrow();
    expect(redisClient.store.has(MARKER_KEY)).toBe(false);
    expect(rows.size).toBe(0);
    const [res] = await service.ingest(ctx(), batch([ev]));
    expect(res).toEqual({ eventId: ev.eventId, status: 'accepted' });
    expect(rows.get('u1')?.kills).toBe(10);
    expect(redisClient.store.has(MARKER_KEY)).toBe(true);
  });

  it('сбой записи более нового снимка не блокирует старый (маркер не ушёл вперёд)', async () => {
    const { service, rows, upsert } = setup();
    upsert.mockRejectedValueOnce(new Error('db down'));
    await expect(
      service.ingest(
        ctx(),
        batch([snap({ kills: 99 }, { occurredAt: at(-1000) })]),
      ),
    ).rejects.toThrow();
    const [res] = await service.ingest(
      ctx(),
      batch([snap({ kills: 5 }, { occurredAt: at(-5000) })]),
    );
    expect(res.status).toBe('accepted');
    expect(rows.get('u1')?.kills).toBe(5);
  });

  it('равный occurredAt проходит, побеждает принятый позже', async () => {
    const { service, rows } = setup();
    const when = at(-1000);
    await service.ingest(
      ctx(),
      batch([snap({ kills: 1 }, { occurredAt: when })]),
    );
    const [res] = await service.ingest(
      ctx(),
      batch([snap({ kills: 2 }, { occurredAt: when })]),
    );
    expect(res.status).toBe('accepted');
    expect(rows.get('u1')?.kills).toBe(2);
  });

  it('гонка SET NX -> GET: ключ исчез между командами - событие новое', async () => {
    const client = {
      set: jest.fn().mockResolvedValue(null),
      get: jest.fn().mockResolvedValue(null),
    };
    const redis = new BridgeRedisService(fakeRedisService(client as never));
    await expect(redis.claimPlayerEvent(SLUG, 'e1', 'h')).resolves.toBe('new');
  });

  it('блокировка игрока занята: RecordLockTimeout, событие не потеряно', async () => {
    jest.useFakeTimers();
    try {
      const { service, redisClient, rows } = setup();
      redisClient.store.set(LOCK_KEY, 'other');
      const ev = snap();
      const pending = service.ingest(ctx(), batch([ev]));
      const assertion =
        expect(pending).rejects.toBeInstanceOf(RecordLockTimeout);
      await jest.advanceTimersByTimeAsync(6000);
      await assertion;
      expect(rows.size).toBe(0);
      redisClient.store.delete(LOCK_KEY);
      const [res] = await service.ingest(ctx(), batch([ev]));
      expect(res.status).toBe('accepted');
    } finally {
      jest.useRealTimers();
    }
  });

  it('ошибка invalidate не ломает применение', async () => {
    const { service, rows, leaderboards } = setup();
    leaderboards.invalidate.mockImplementation(() => {
      throw new Error('cache down');
    });
    const [res] = await service.ingest(ctx(), batch([snap()]));
    expect(res.status).toBe('accepted');
    expect(rows.get('u1')?.kills).toBe(10);
  });
});

describe('метрики по отдельности (L7)', () => {
  it('только playTimeMinutes', async () => {
    const { service, rows } = setup();
    await service.ingest(ctx(), batch([snap()]));
    await service.ingest(
      ctx(),
      batch([snap({ playTimeMinutes: 200 }, { occurredAt: at(1000) })]),
    );
    expect(rows.get('u1')).toMatchObject({
      playTime: 200,
      kills: 10,
      deaths: 4,
      hits: 50,
    });
  });

  it('только hits', async () => {
    const { service, rows } = setup();
    await service.ingest(ctx(), batch([snap()]));
    await service.ingest(
      ctx(),
      batch([snap({ hits: 77 }, { occurredAt: at(1000) })]),
    );
    expect(rows.get('u1')).toMatchObject({
      hits: 77,
      playTime: 90,
      kills: 10,
    });
  });

  it('deaths = 0: записывается 0, K/D равен числу убийств', async () => {
    const { service, rows } = setup();
    await service.ingest(ctx(), batch([snap()]));
    await service.ingest(
      ctx(),
      batch([snap({ deaths: 0 }, { occurredAt: at(1000) })]),
    );
    expect(rows.get('u1')).toMatchObject({
      deaths: 0,
      kills: 10,
      killDeathRatio: 10,
    });
  });

  it('первый снимок без deaths: K/D = kills', async () => {
    const { service, rows } = setup();
    await service.ingest(ctx(), batch([snap({ kills: 3 })]));
    expect(rows.get('u1')).toMatchObject({ deaths: 0, killDeathRatio: 3 });
  });
});

describe('BridgeStatsService: сброс кэша, интервалы и остановка (L7)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('повторный сброс после интервала проходит сразу', () => {
    const { stats, leaderboards } = setup();
    stats.invalidateRankings();
    jest.advanceTimersByTime(RANKINGS_INVALIDATE_INTERVAL_MS + 1);
    stats.invalidateRankings();
    expect(leaderboards.invalidate).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(RANKINGS_INVALIDATE_INTERVAL_MS * 3);
    expect(leaderboards.invalidate).toHaveBeenCalledTimes(2);
  });

  it('onModuleDestroy отменяет отложенный сброс', () => {
    const { stats, leaderboards } = setup();
    stats.invalidateRankings();
    stats.invalidateRankings();
    stats.onModuleDestroy();
    jest.advanceTimersByTime(RANKINGS_INVALIDATE_INTERVAL_MS * 2);
    expect(leaderboards.invalidate).toHaveBeenCalledTimes(1);
  });

  it('ошибка отложенного и немедленного сброса логируется, не бросается', () => {
    const { stats, leaderboards } = setup();
    leaderboards.invalidate.mockImplementation(() => {
      throw new Error('x');
    });
    expect(() => stats.invalidateRankings()).not.toThrow();
    stats.invalidateRankings();
    expect(() =>
      jest.advanceTimersByTime(RANKINGS_INVALIDATE_INTERVAL_MS + 1),
    ).not.toThrow();
    expect(leaderboards.invalidate).toHaveBeenCalledTimes(2);
  });

  it('отложенный сброс из бан-пути: два BAN подряд -> один сразу и один в конце', async () => {
    const { service, leaderboards } = setup();
    const ban = (sourceId: string) =>
      makeEvent('punishment.created', {
        kind: 'BAN',
        sourceId,
        startedAt: new Date().toISOString(),
        subjectUuid: UUID,
        subjectName: 'Steve',
      });
    await service.ingest(ctx(), batch([ban('201')]));
    await service.ingest(ctx(), batch([ban('202')]));
    expect(leaderboards.invalidate).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(RANKINGS_INVALIDATE_INTERVAL_MS + 1);
    expect(leaderboards.invalidate).toHaveBeenCalledTimes(2);
  });
});
