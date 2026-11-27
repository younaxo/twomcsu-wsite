import { Logger } from '@nestjs/common';
import {
  FakePrisma,
  FakeRedisClient,
  SLUG,
  fakeRedisService,
  makeEvent,
  makeServer,
} from '../../../test/support/bridge-support';
import {
  InMemoryInventoryStore,
  TEST_UUID,
  item,
} from '../../../test/support/in-memory-inventory';
import { InventoryApplyService } from '../inventory/inventory-apply.service';
import { BridgeInventoryService } from './bridge-inventory.service';
import { resolveCapabilities } from './bridge-capabilities';
import { BridgeIngestService } from './bridge-ingest.service';
import { BridgePunishmentSource } from './bridge-punishment.source';
import { BridgeRedisService } from './bridge-redis.service';
import { BridgeBatch, parseEnvelope } from './bridge-schema';
import { BridgeConfig } from './bridge.config';
import { BridgeAuthContext } from './bridge.types';

const USER = 'user-1';

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
    statsEnabled: false,
    inventoryEnabled: true,
    ...over,
  };
}

function ctx(
  capabilities: unknown = { punishments: true, 'inventory-sync': true },
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

function setup(
  cfg: BridgeConfig = config(),
  linked = true,
  inventory?: BridgeInventoryService,
) {
  const store = new InMemoryInventoryStore();
  if (linked) store.link(TEST_UUID, USER);
  const apply = new InventoryApplyService(store);
  const prisma = new FakePrisma();
  const redisClient = new FakeRedisClient();
  const redis = new BridgeRedisService(fakeRedisService(redisClient));
  const source = new BridgePunishmentSource();
  source.subscribe(() => undefined);
  const service = new BridgeIngestService(
    cfg,
    prisma as never,
    redis,
    source,
    undefined,
    inventory ?? new BridgeInventoryService(apply),
  );
  return { service, store, redisClient };
}

/// Данные снимка с живыми временами (приёмник сверяет с текущим временем).
const data = (over: Record<string, unknown> = {}) => ({
  uuid: TEST_UUID,
  group: 'main',
  epoch: Date.now() - 3_600_000,
  rev: 1,
  capturedAt: new Date().toISOString(),
  playerOnline: true,
  schemaVersion: 1,
  slots: [{ area: 'hotbar', slot: 0, item: item() }],
  ...over,
});
const inv = (
  d: Record<string, unknown> = data(),
  ev: Record<string, unknown> = {},
) => makeEvent('inventory.snapshot', d, ev);

describe('BridgeIngestService: inventory.snapshot', () => {
  it('записывает снимок, сервер из ключа', async () => {
    const { service, store } = setup();
    const ev = inv();
    const [res] = await service.ingest(ctx(), batch([ev]));
    expect(res).toEqual({ eventId: ev.eventId, status: 'accepted' });
    const row = store.get(USER, SLUG, 'main');
    expect(row?.rev).toBe(1);
    expect(row?.slotCount).toBe(1);
  });

  it('повтор того же eventId - duplicate, одна запись', async () => {
    const { service, store } = setup();
    const ev = inv();
    await service.ingest(ctx(), batch([ev]));
    const [res] = await service.ingest(ctx(), batch([ev]));
    expect(res.status).toBe('duplicate');
    expect(store.mutateCalls).toBe(1);
  });

  it('тот же eventId с другим содержимым - conflict', async () => {
    const { service } = setup();
    const ev = inv();
    await service.ingest(ctx(), batch([ev]));
    const [res] = await service.ingest(
      ctx(),
      batch([{ ...ev, data: data({ rev: 9 }) }]),
    );
    expect(res).toMatchObject({ status: 'rejected', code: 'conflict' });
  });

  it('более старая ревизия - stale, ряд не меняется', async () => {
    const { service, store } = setup();
    const epoch = Date.now() - 3_600_000;
    await service.ingest(ctx(), batch([inv(data({ epoch, rev: 5 }))]));
    const [res] = await service.ingest(
      ctx(),
      batch([inv(data({ epoch, rev: 4, slots: [] }))]),
    );
    expect(res.status).toBe('stale');
    expect(store.get(USER, SLUG, 'main')?.rev).toBe(5);
    expect(store.get(USER, SLUG, 'main')?.slotCount).toBe(1);
  });

  it('игрок без привязки: accepted, ничего не записано', async () => {
    const { service, store } = setup(config(), false);
    const [res] = await service.ingest(ctx(), batch([inv()]));
    expect(res.status).toBe('accepted');
    expect(store.rows.size).toBe(0);
  });

  it.each([
    ['serverId в теле', { serverId: 'x' }],
    ['ip', { ip: '1.2.3.4' }],
    ['сырой NBT', { nbt: '{Damage:1}' }],
    ['чужая версия схемы', { schemaVersion: 2 }],
    ['нет uuid', { uuid: undefined }],
    ['плохая группа', { group: 'chest' }],
    [
      '42 слота в main',
      {
        slots: Array.from({ length: 42 }, (_, i) => ({
          area: 'main',
          slot: i % 27,
          item: item(),
        })),
      },
    ],
    [
      'лишнее поле предмета',
      {
        slots: [
          { area: 'hotbar', slot: 0, item: { ...item(), nbt: '{secret:1}' } },
        ],
      },
    ],
    ['epoch из будущего', { epoch: Date.now() + 3_600_000 }],
  ])('невалидные данные (%s) - invalid_data, без записи', async (_n, over) => {
    const { service, store } = setup();
    const [res] = await service.ingest(ctx(), batch([inv(data(over))]));
    expect(res).toMatchObject({ status: 'rejected', code: 'invalid_data' });
    expect(store.rows.size).toBe(0);
  });

  it('событие больше лимита 16 КБ - invalid_data', async () => {
    const { service, store } = setup();
    const big = Array.from({ length: 27 }, (_, i) => ({
      area: 'main',
      slot: i,
      item: item('minecraft:stick', {
        name: [{ text: 'x'.repeat(256) }],
        lore: Array.from({ length: 20 }, () => [{ text: 'y'.repeat(256) }]),
      }),
    }));
    const [res] = await service.ingest(
      ctx(),
      batch([inv(data({ slots: big }))]),
    );
    expect(res).toMatchObject({ status: 'rejected', code: 'invalid_data' });
    expect(store.rows.size).toBe(0);
  });

  it('serverId события не совпадает с ключом - server_mismatch', async () => {
    const { service, store } = setup();
    const [res] = await service.ingest(
      ctx(),
      batch([inv(data(), { serverId: 'other' })]),
    );
    expect(res).toMatchObject({ status: 'rejected', code: 'server_mismatch' });
    expect(store.rows.size).toBe(0);
  });

  it('occurredAt вне окна - invalid_data', async () => {
    const { service } = setup();
    const old = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
    const [res] = await service.ingest(
      ctx(),
      batch([inv(data(), { occurredAt: old })]),
    );
    expect(res).toMatchObject({ status: 'rejected', code: 'invalid_data' });
  });

  it('флаг выключен - unsupported_type', async () => {
    const { service, store } = setup(config({ inventoryEnabled: false }));
    const [res] = await service.ingest(ctx(), batch([inv()]));
    expect(res).toMatchObject({ status: 'rejected', code: 'unsupported_type' });
    expect(store.rows.size).toBe(0);
  });

  it.each([
    ['нет inventory-sync', { punishments: true }],
    ['только player-events', { punishments: true, 'player-events': true }],
  ])('%s - unsupported_type', async (_n, caps) => {
    const { service, store } = setup();
    const [res] = await service.ingest(ctx(caps), batch([inv()]));
    expect(res).toMatchObject({ status: 'rejected', code: 'unsupported_type' });
    expect(store.rows.size).toBe(0);
  });

  it('сбой Redis - исключение (503 вызывающему)', async () => {
    const { service, redisClient } = setup();
    redisClient.failAll = true;
    await expect(service.ingest(ctx(), batch([inv()]))).rejects.toThrow();
  });

  it('inventory.delta по-прежнему unsupported_type', async () => {
    const { service } = setup();
    const [res] = await service.ingest(
      ctx(),
      batch([makeEvent('inventory.delta', {})]),
    );
    expect(res).toMatchObject({ status: 'rejected', code: 'unsupported_type' });
  });
});

const MIN = 60_000;

describe('inventory.snapshot: порядок свежести (M5)', () => {
  it('перезапуск плагина: новая epoch и rev=1 принимаются', async () => {
    const { service, store } = setup();
    const epoch1 = Date.now() - 2 * 3_600_000;
    const epoch2 = Date.now() - 30 * MIN;
    await service.ingest(
      ctx(),
      batch([inv(data({ epoch: epoch1, rev: 40 }))]),
    );
    const [res] = await service.ingest(
      ctx(),
      batch([inv(data({ epoch: epoch2, rev: 1, slots: [] }))]),
    );
    expect(res.status).toBe('accepted');
    const row = store.get(USER, SLUG, 'main');
    expect(row?.epoch).toBe(String(epoch2));
    expect(row?.rev).toBe(1);
    expect(row?.slotCount).toBe(0);
  });

  it('старая epoch с большим rev после перезапуска - stale, ряд не меняется', async () => {
    const { service, store } = setup();
    const epoch1 = Date.now() - 2 * 3_600_000;
    const epoch2 = Date.now() - 30 * MIN;
    await service.ingest(ctx(), batch([inv(data({ epoch: epoch2, rev: 1 }))]));
    const [res] = await service.ingest(
      ctx(),
      batch([inv(data({ epoch: epoch1, rev: 999, slots: [] }))]),
    );
    expect(res.status).toBe('stale');
    const row = store.get(USER, SLUG, 'main');
    expect(row?.epoch).toBe(String(epoch2));
    expect(row?.rev).toBe(1);
    expect(row?.slotCount).toBe(1);
  });

  it('равные (epoch, rev), тот же состав, новый eventId - accepted без записи', async () => {
    const { service, store } = setup();
    const d = data();
    await service.ingest(ctx(), batch([inv(d)]));
    const before = store.get(USER, SLUG, 'main');
    const [res] = await service.ingest(ctx(), batch([inv({ ...d })]));
    expect(res.status).toBe('accepted');
    expect(store.get(USER, SLUG, 'main')).toEqual(before);
  });

  it('равные (epoch, rev), другой состав - stale, ряд не меняется', async () => {
    const { service, store } = setup();
    const d = data();
    await service.ingest(ctx(), batch([inv(d)]));
    const [res] = await service.ingest(
      ctx(),
      batch([inv({ ...d, slots: [] })]),
    );
    expect(res.status).toBe('stale');
    expect(store.get(USER, SLUG, 'main')?.slotCount).toBe(1);
  });

  it('отказ по данным не закрепляется: тот же eventId с исправленными данными принимается', async () => {
    const { service, store } = setup();
    const ev = inv(data({ epoch: Date.now() + 3_600_000 }));
    const [bad] = await service.ingest(ctx(), batch([ev]));
    expect(bad).toMatchObject({ status: 'rejected', code: 'invalid_data' });
    // Данные не прошли схему до Redis: маркер дедупликации не создан, поэтому
    // исправленное событие с тем же eventId не даёт conflict и применяется.
    const [good] = await service.ingest(
      ctx(),
      batch([{ ...ev, data: data() }]),
    );
    expect(good).toEqual({ eventId: ev.eventId, status: 'accepted' });
    expect(store.get(USER, SLUG, 'main')?.rev).toBe(1);
  });

  it('отказ приёмника инвентаря (invalid после маркера) не закрепляется: повтор применяется', async () => {
    const applySnapshot = jest
      .fn()
      .mockResolvedValueOnce('invalid')
      .mockResolvedValueOnce('applied');
    const { service } = setup(config(), true, {
      applySnapshot,
    } as unknown as BridgeInventoryService);
    const ev = inv();
    const [first] = await service.ingest(ctx(), batch([ev]));
    expect(first).toMatchObject({ status: 'rejected', code: 'invalid_data' });
    const [second] = await service.ingest(ctx(), batch([ev]));
    expect(second).toEqual({ eventId: ev.eventId, status: 'accepted' });
    expect(applySnapshot).toHaveBeenCalledTimes(2);
  });

  it('сбой хранилища: исключение (503 в контроллере), повтор той же пачки проходит', async () => {
    const { service, store } = setup();
    const ev = inv();
    jest.spyOn(store, 'mutate').mockRejectedValueOnce(new Error('db down'));
    const errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    await expect(service.ingest(ctx(), batch([ev]))).rejects.toThrow('db down');
    errorLog.mockRestore();
    expect(store.rows.size).toBe(0);
    const [res] = await service.ingest(ctx(), batch([ev]));
    expect(res).toEqual({ eventId: ev.eventId, status: 'accepted' });
    expect(store.get(USER, SLUG, 'main')?.rev).toBe(1);
  });
});

/// Размер события гейт считает как `Buffer.byteLength(JSON.stringify(ev.data))`
/// и сравнивает с 16384 (bridge-ingest.service.ts, MAX_EVENT_DATA_BYTES).
describe('inventory.snapshot: размер события 16 КБ (M4)', () => {
  const LIMIT = 16 * 1024;
  const size = (d: unknown) => Buffer.byteLength(JSON.stringify(d), 'utf8');

  const SLOT_REFS = [
    ...Array.from({ length: 9 }, (_, i) => ({ area: 'hotbar', slot: i })),
    ...Array.from({ length: 27 }, (_, i) => ({ area: 'main', slot: i })),
    ...Array.from({ length: 4 }, (_, i) => ({ area: 'armor', slot: i })),
    { area: 'offhand', slot: 0 },
  ];

  /// Полный инвентарь (41 слот) с `data` ровно `target` байт: добор длины -
  /// текстом первой строки лора (ASCII, 1 байт на символ).
  function dataOfSize(target: number): Record<string, unknown> {
    const build = (pad: (i: number) => number) =>
      data({
        slots: SLOT_REFS.map((ref, i) => ({
          ...ref,
          item: item('minecraft:stick', {
            name: [{ text: 'x'.repeat(200) }],
            lore: [[{ text: 'y'.repeat(1 + pad(i)) }]],
          }),
        })),
      });
    const diff = target - size(build(() => 0));
    const each = Math.floor(diff / SLOT_REFS.length);
    const extra = diff % SLOT_REFS.length;
    const d = build((i) => each + (i < extra ? 1 : 0));
    expect(size(d)).toBe(target);
    return d;
  }

  it('ровно 16384 байта - проходит гейт и принимается', async () => {
    const { service, store } = setup();
    const [res] = await service.ingest(ctx(), batch([inv(dataOfSize(LIMIT))]));
    expect(res.status).toBe('accepted');
    expect(store.get(USER, SLUG, 'main')?.slotCount).toBe(41);
  });

  it('16385 байт - invalid_data по размеру, без записи', async () => {
    const { service, store } = setup();
    const [res] = await service.ingest(
      ctx(),
      batch([inv(dataOfSize(LIMIT + 1))]),
    );
    expect(res).toMatchObject({ status: 'rejected', code: 'invalid_data' });
    expect(store.mutateCalls).toBe(0);
    expect(store.rows.size).toBe(0);
  });

  const E = (id: string, level: number) => ({ id: `minecraft:${id}`, level });
  const run = (text: string, color?: string, bold?: boolean) => ({
    text,
    ...(color ? { color } : {}),
    ...(bold ? { bold: true } : {}),
  });
  const heavy = (id: string) =>
    item(id, {
      damage: 120,
      maxDamage: 2031,
      enchants: [
        E('sharpness', 5),
        E('unbreaking', 3),
        E('mending', 1),
        E('looting', 3),
        E('fire_aspect', 2),
      ],
      name: [run('Меч Полдня', '#F26A1B', true)],
      lore: [
        [run('Редкость: ', '#AAAAAA'), run('Легендарный', '#FFAA00', true)],
        [run('Урон +12', '#55FF55')],
        [run('Принадлежит игроку TestPlayer001', '#AAAAAA')],
        [run('Сезон 3 · Анархия Новой Эры', '#5555FF')],
      ],
    });
  const light = (id: string) =>
    item(id, {
      damage: 10,
      maxDamage: 250,
      enchants: [E('efficiency', 4), E('unbreaking', 3)],
    });

  it('реалистичный полный инвентарь (41 слот, чары и лор у части предметов) укладывается в 16 КБ', async () => {
    const { service, store } = setup();
    const slots = SLOT_REFS.map((ref, i) => ({
      ...ref,
      item:
        ref.area === 'hotbar'
          ? i < 4
            ? heavy('minecraft:netherite_sword')
            : light('minecraft:diamond_pickaxe')
          : ref.area === 'main'
            ? ref.slot < 20
              ? item('minecraft:cobblestone', { count: 64 })
              : ref.slot < 24
                ? light('minecraft:diamond_axe')
                : heavy('minecraft:elytra')
            : ref.area === 'armor'
              ? heavy('minecraft:netherite_chestplate')
              : light('minecraft:shield'),
    }));
    const d = data({ slots });
    expect(slots).toHaveLength(41);
    expect(size(d)).toBeLessThanOrEqual(LIMIT);
    const [res] = await service.ingest(ctx(), batch([inv(d)]));
    expect(res.status).toBe('accepted');
    expect(store.get(USER, SLUG, 'main')?.slotCount).toBe(41);
  });

  it('41 слот тяжёлых предметов с лором не укладывается: invalid_data до среза частей', async () => {
    const { service, store } = setup();
    const slots = SLOT_REFS.map((ref) => ({
      ...ref,
      item: heavy('minecraft:netherite_sword'),
    }));
    const d = data({ slots });
    expect(size(d)).toBeGreaterThan(LIMIT);
    const [res] = await service.ingest(ctx(), batch([inv(d)]));
    expect(res).toMatchObject({ status: 'rejected', code: 'invalid_data' });
    expect(store.rows.size).toBe(0);
  });
});

describe('inventory.snapshot: предупреждение о ряде с epoch из будущего (M1)', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  const warnings = () =>
    warn.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.includes('row epoch ahead of clock'));

  it('ряд опережает часы на 5 минут, честный снимок - stale и warn без ПДн', async () => {
    const { service } = setup();
    const future = Date.now() + 5 * MIN;
    await service.ingest(ctx(), batch([inv(data({ epoch: future, rev: 1 }))]));
    const [res] = await service.ingest(
      ctx(),
      batch([inv(data({ epoch: Date.now() - 3_600_000, rev: 2 }))]),
    );
    expect(res.status).toBe('stale');
    const logged = warnings();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain(`server=${SLUG}`);
    expect(logged[0]).toContain(`epoch=${future}`);
    expect(logged[0]).not.toContain(USER);
    expect(logged[0]).not.toContain(TEST_UUID);
  });

  it('повторные stale по тому же ряду не засоряют лог (не чаще раза в 10 минут)', async () => {
    const { service } = setup();
    await service.ingest(
      ctx(),
      batch([inv(data({ epoch: Date.now() + 5 * MIN, rev: 1 }))]),
    );
    for (let i = 0; i < 3; i += 1) {
      await service.ingest(
        ctx(),
        batch([inv(data({ epoch: Date.now() - 3_600_000, rev: 2 + i }))]),
      );
    }
    expect(warnings()).toHaveLength(1);
  });

  it('ряд в пределах 120 с от часов (обычный stale) - без warn', async () => {
    const { service } = setup();
    const epoch = Date.now() - 3_600_000;
    await service.ingest(ctx(), batch([inv(data({ epoch, rev: 5 }))]));
    const [res] = await service.ingest(
      ctx(),
      batch([inv(data({ epoch, rev: 4 }))]),
    );
    expect(res.status).toBe('stale');
    expect(warnings()).toHaveLength(0);
  });
});
