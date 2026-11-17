/// ТРЕБУЕТ REDIS. Интеграционный тест скриптов Lua `RedisInventoryAssemblyStore`
/// на настоящем Redis (модель в памяти проверяет только семантику, не текст Lua).
///
/// Запускается ТОЛЬКО при заданной переменной `INVENTORY_REDIS_TEST_URL`
/// (например `redis://127.0.0.1:6390/15`); без неё набор пропускается
/// (`describe.skip`), без подключения, чтобы обычные `pnpm test` и CI не
/// падали. Используйте ОДНОРАЗОВЫЙ Redis: глобальные ключи учёта серверов
/// `bridge:inv:g` и `bridge:inv:gts` общие (без хэш-тега, L-6), тест пишет в них
/// записи своих серверов и в `afterAll` удаляет только их; ключи серверов
/// несут уникальный суффикс запуска и удаляются целиком. Не направляйте тест на
/// production и на общий dev-Redis.
///
/// Ручной запуск (из apps/api):
///   INVENTORY_REDIS_TEST_URL=redis://127.0.0.1:6390/15 \
///     npx jest --runInBand redis-inventory-assembly.store.redis
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import {
  DEFAULT_ASSEMBLY_CONFIG,
  type AssemblyConfig,
} from './inventory-assembly.config';
import type { OfferInput } from './inventory-assembly.store';
import {
  GLOBAL_KEY,
  GLOBAL_TS_KEY,
  RedisInventoryAssemblyStore,
  assemblyKey,
  type InventoryRedisClient,
} from './redis-inventory-assembly.store';

const URL = process.env.INVENTORY_REDIS_TEST_URL;
const suite = URL ? describe : describe.skip;

const GROUPS = ['hotbar', 'storage_a', 'storage_b', 'equipment'] as const;
const EPOCH = '1763380800000';

function adapter(redis: Redis): InventoryRedisClient {
  return {
    eval: (script, numKeys, ...args) => redis.eval(script, numKeys, ...args),
    configGet: async (name) => {
      const reply = (await redis.call('CONFIG', 'GET', name)) as string[];
      return reply[1] ?? null;
    },
    infoMemory: () => redis.info('memory'),
  };
}

suite('RedisInventoryAssemblyStore: Lua на настоящем Redis', () => {
  const run = randomUUID().slice(0, 8);
  const servers = [`it-a-${run}`, `it-b-${run}`];
  const [SERVER_A, SERVER_B] = servers;
  let raw: Redis;
  let store: RedisInventoryAssemblyStore;
  let counter = 0;

  const user = () => `it-user-${randomUUID().slice(0, 8)}`;
  const snapId = () => `it-snap-${run}-${(counter += 1)}`;

  function offer(
    over: {
      serverId?: string;
      snapshotId: string;
      userId: string;
      n: number;
      slotGroup?: string;
      eventId?: string;
      token?: string;
      probedLive?: boolean;
      config?: AssemblyConfig;
    },
    nowMs = Date.now(),
  ): OfferInput {
    const slotGroup = over.slotGroup ?? GROUPS[over.n - 1];
    return {
      serverId: over.serverId ?? SERVER_A,
      snapshotId: over.snapshotId,
      eventId: over.eventId ?? `ev-${run}-${(counter += 1)}`,
      nowMs,
      token: over.token ?? `tok-${run}`,
      userId: over.userId,
      probedLive: over.probedLive ?? false,
      part: {
        n: over.n,
        slotGroup,
        hash: `hash-${over.n}`,
        slotsJson: `[{"n":${over.n}}]`,
        bytes: 100,
      },
      header: {
        parts: 4,
        group: 'main',
        epoch: EPOCH,
        rev: 1,
        capturedAtMs: nowMs,
        playerOnline: true,
        uuidHash: 'u'.repeat(32),
      },
      expectedGroups: GROUPS,
      config: over.config ?? DEFAULT_ASSEMBLY_CONFIG,
    };
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function deleteServerKeys(serverId: string): Promise<void> {
    const pattern = `${assemblyKey(serverId, '')}*`;
    let cursor = '0';
    do {
      const [next, keys] = await raw.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        200,
      );
      cursor = next;
      if (keys.length > 0) await raw.del(...keys);
    } while (cursor !== '0');
  }

  beforeAll(async () => {
    raw = new Redis(URL as string, { lazyConnect: true });
    await raw.connect();
    store = new RedisInventoryAssemblyStore(adapter(raw));
  });

  afterAll(async () => {
    if (!raw) return;
    try {
      for (const serverId of servers) {
        await deleteServerKeys(serverId);
        await raw.hdel(GLOBAL_KEY, serverId);
        await raw.zrem(GLOBAL_TS_KEY, serverId);
      }
    } finally {
      await raw.quit();
    }
  });

  it('CONFIG GET и INFO memory отвечают (порт политики)', async () => {
    expect(await store.configGet('maxmemory-policy')).not.toBeUndefined();
    const info = await store.infoMemory();
    expect(info.policy).not.toBeNull();
  });

  it('4 части: buffered x3, затем complete с частями; finish(applied) пишет done, повтор — duplicate', async () => {
    const snapshotId = snapId();
    const userId = user();
    const token = `tok-${snapshotId}`;

    for (const n of [1, 2, 3]) {
      const r = await store.offer(offer({ snapshotId, userId, n, token }));
      expect(r).toEqual({ kind: 'buffered' });
    }
    const probe = await store.probe(SERVER_A, snapshotId, 'ev-none');
    expect(probe).toMatchObject({ done: false, live: true, mark: null });

    const complete = await store.offer(
      offer({ snapshotId, userId, n: 4, token, probedLive: true }),
    );
    expect(complete.kind).toBe('complete');
    if (complete.kind !== 'complete') return;
    expect(complete.userId).toBe(userId);
    expect(complete.parts.map((p) => [p.part, p.slotGroup])).toEqual([
      [1, 'hotbar'],
      [2, 'storage_a'],
      [3, 'storage_b'],
      [4, 'equipment'],
    ]);
    expect(complete.parts[3].slotsJson).toBe('[{"n":4}]');

    // Захват держит токен: чужой финиш не проходит.
    const foreign = await store.finish({
      serverId: SERVER_A,
      snapshotId,
      eventId: `ev-fin-${snapshotId}`,
      token: 'другой-токен',
      outcome: 'applied',
      nowMs: Date.now(),
      userId,
      group: 'main',
      epoch: EPOCH,
      rev: 1,
      config: DEFAULT_ASSEMBLY_CONFIG,
    });
    expect(foreign).toEqual({ ok: false, reason: 'lock_lost' });

    const fin = await store.finish({
      serverId: SERVER_A,
      snapshotId,
      eventId: `ev-fin-${snapshotId}`,
      token,
      outcome: 'applied',
      nowMs: Date.now(),
      userId,
      group: 'main',
      epoch: EPOCH,
      rev: 1,
      config: DEFAULT_ASSEMBLY_CONFIG,
    });
    expect(fin).toEqual({ ok: true });
    expect(await store.probe(SERVER_A, snapshotId, 'ev-none')).toMatchObject({
      done: true,
      live: false,
    });

    const again = await store.offer(offer({ snapshotId, userId, n: 1 }));
    expect(again).toEqual({ kind: 'duplicate' });
  });

  it('повтор части: тот же hash — duplicate, без дубля в буфере; другой hash — conflict', async () => {
    const snapshotId = snapId();
    const userId = user();
    expect(await store.offer(offer({ snapshotId, userId, n: 1 }))).toEqual({
      kind: 'buffered',
    });
    const idxb = assemblyKey(SERVER_A, 'idxb');
    const before = await raw.hget(idxb, snapshotId);
    expect(
      await store.offer(offer({ snapshotId, userId, n: 1, probedLive: true })),
    ).toEqual({ kind: 'duplicate' });
    expect(await raw.hget(idxb, snapshotId)).toBe(before);

    const differing = offer({ snapshotId, userId, n: 1, probedLive: true });
    differing.part.hash = 'hash-other';
    expect(await store.offer(differing)).toEqual({
      kind: 'rejected',
      code: 'conflict',
      reason: 'part_differs',
    });
    expect(await store.probe(SERVER_A, snapshotId, 'ev-none')).toMatchObject({
      live: false,
      mark: 'poison',
    });
  });

  it('повтор пустой части с другим slotGroup: snapshot_mismatch, а не duplicate', async () => {
    const snapshotId = snapId();
    const userId = user();
    expect(await store.offer(offer({ snapshotId, userId, n: 1 }))).toEqual({
      kind: 'buffered',
    });
    const other = offer({
      snapshotId,
      userId,
      n: 1,
      slotGroup: 'storage_a',
      probedLive: true,
    });
    expect(await store.offer(other)).toEqual({
      kind: 'rejected',
      code: 'snapshot_mismatch',
      reason: 'slot_group_differs',
    });
  });

  it('L-3: ceiling_servers отклоняет новый сервер и НЕ регистрирует его в g', async () => {
    // Сервер A регистрируется в g первой же операцией.
    await store.offer(offer({ snapshotId: snapId(), userId: user(), n: 1 }));
    expect(await raw.hexists(GLOBAL_KEY, SERVER_A)).toBe(1);
    const registered = await raw.hlen(GLOBAL_KEY);

    const tight: AssemblyConfig = {
      ...DEFAULT_ASSEMBLY_CONFIG,
      maxServers: registered,
    };
    const result = await store.offer(
      offer({
        serverId: SERVER_B,
        snapshotId: snapId(),
        userId: user(),
        n: 1,
        config: tight,
      }),
    );
    expect(result).toEqual({
      kind: 'rejected',
      code: 'resync_required',
      reason: 'ceiling_servers',
    });
    expect(await raw.hexists(GLOBAL_KEY, SERVER_B)).toBe(0);
    expect(await raw.zscore(GLOBAL_TS_KEY, SERVER_B)).toBeNull();
    expect(await raw.hlen(GLOBAL_KEY)).toBe(registered);
  });

  it('expire: сборка живёт assemblyTimeoutMs, затем исчезает; новая часть создаёт сборку заново', async () => {
    const short: AssemblyConfig = {
      ...DEFAULT_ASSEMBLY_CONFIG,
      assemblyTimeoutMs: 300,
    };
    const snapshotId = snapId();
    const userId = user();
    expect(
      await store.offer(offer({ snapshotId, userId, n: 1, config: short })),
    ).toEqual({ kind: 'buffered' });
    expect(await store.probe(SERVER_A, snapshotId, 'ev-none')).toMatchObject({
      live: true,
    });
    const ttl = await raw.pttl(assemblyKey(SERVER_A, `asm:${snapshotId}`));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(300);

    await sleep(450);
    expect(await store.probe(SERVER_A, snapshotId, 'ev-none')).toMatchObject({
      live: false,
      done: false,
    });
    // Часть, пришедшая после истечения, создаёт новую сборку.
    expect(
      await store.offer(
        offer({ snapshotId, userId, n: 2, probedLive: false, config: short }),
      ),
    ).toEqual({ kind: 'buffered' });
    // Ленивая очистка индекса: мёртвая запись удалена из idx при следующей операции.
    expect(await raw.zscore(assemblyKey(SERVER_A, 'idx'), snapshotId)).not.toBe(
      null,
    );
  });
});
