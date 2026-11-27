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

function setup(cfg: BridgeConfig = config(), linked = true) {
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
    new BridgeInventoryService(apply),
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
