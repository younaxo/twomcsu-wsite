import {
  delta,
  InMemoryInventoryStore,
  item,
  iso,
  snapshot,
  T0,
  TEST_EPOCH,
  TEST_EPOCH_2,
  TEST_UUID,
  TEST_UUID_2,
} from '../../../test/support/in-memory-inventory';
import { InventoryApplyService } from './inventory-apply.service';
import { reparseStoredSlots } from './inventory-normalize';

const USER = 'user-1';
const SERVER = 'survival';

function setup() {
  const store = new InMemoryInventoryStore();
  store.link(TEST_UUID, USER);
  const service = new InventoryApplyService(store);
  return { store, service };
}

const NOW = new Date(T0.getTime() + 10_000);

describe('InventoryApplyService.applySnapshot', () => {
  it('сохраняет первый снимок', async () => {
    const { store, service } = setup();
    const result = await service.applySnapshot(SERVER, snapshot(), NOW);
    expect(result).toEqual({
      status: 'applied',
      kind: 'snapshot',
      contentChanged: true,
    });
    const row = store.get(USER, SERVER, 'main')!;
    expect(row.epoch).toBe(TEST_EPOCH);
    expect(row.rev).toBe(1);
    expect(row.slotCount).toBe(1);
    expect(row.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.lastSeenAt).toEqual(NOW);
    expect(row.capturedAt).toEqual(T0);
    expect(row.playerOnline).toBe(true);
  });

  it('не хранит UUID и сырых полей в ряду', async () => {
    const { store, service } = setup();
    await service.applySnapshot(SERVER, snapshot(), NOW);
    const text = JSON.stringify(store.get(USER, SERVER, 'main'));
    expect(text).not.toContain(TEST_UUID);
  });

  it('повтор того же снимка безвреден: содержимое не перезаписывается', async () => {
    const { store, service } = setup();
    await service.applySnapshot(SERVER, snapshot(), NOW);
    const before = store.get(USER, SERVER, 'main')!;
    const later = new Date(NOW.getTime() + 60_000);
    const result = await service.applySnapshot(SERVER, snapshot(), later);
    expect(result).toEqual({
      status: 'applied',
      kind: 'snapshot',
      contentChanged: false,
    });
    const after = store.get(USER, SERVER, 'main')!;
    expect(after.slots).toStrictEqual(before.slots);
    expect(after.contentHash).toBe(before.contentHash);
    expect(after.lastSeenAt).toEqual(later);
  });

  it('тот же состав с новой эпохой и ревизией: обновляются метаданные, не слоты', async () => {
    const { store, service } = setup();
    await service.applySnapshot(SERVER, snapshot(), NOW);
    const slotsBefore = store.get(USER, SERVER, 'main')!.slots;
    const result = await service.applySnapshot(
      SERVER,
      snapshot({
        epoch: TEST_EPOCH_2,
        rev: 7,
        capturedAt: iso(30),
        playerOnline: false,
      }),
      NOW,
    );
    expect(result).toMatchObject({ status: 'applied', contentChanged: false });
    const row = store.get(USER, SERVER, 'main')!;
    expect(row.epoch).toBe(TEST_EPOCH_2);
    expect(row.rev).toBe(7);
    expect(row.playerOnline).toBe(false);
    expect(row.slots).toBe(slotsBefore);
  });

  it('более новый снимок с другим составом заменяет ряд', async () => {
    const { store, service } = setup();
    await service.applySnapshot(SERVER, snapshot(), NOW);
    const result = await service.applySnapshot(
      SERVER,
      snapshot({
        capturedAt: iso(20),
        rev: 2,
        slots: [
          {
            area: 'hotbar',
            slot: 4,
            item: item('minecraft:bread', { count: 3 }),
          },
        ],
      }),
      NOW,
    );
    expect(result).toMatchObject({ status: 'applied', contentChanged: true });
    const slots = reparseStoredSlots(store.get(USER, SERVER, 'main')!.slots);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ area: 'hotbar', slot: 4 });
  });

  it('старее сохранённого — stale, ряд не меняется', async () => {
    const { store, service } = setup();
    await service.applySnapshot(SERVER, snapshot({ capturedAt: iso(30) }), NOW);
    const before = store.get(USER, SERVER, 'main')!;
    const result = await service.applySnapshot(
      SERVER,
      snapshot({
        capturedAt: iso(10),
        slots: [{ area: 'hotbar', slot: 1, item: item('minecraft:dirt') }],
      }),
      NOW,
    );
    expect(result).toEqual({ status: 'stale' });
    expect(store.get(USER, SERVER, 'main')).toBe(before);
  });

  it('равный capturedAt: побеждает принятый позже', async () => {
    const { store, service } = setup();
    await service.applySnapshot(SERVER, snapshot(), NOW);
    const result = await service.applySnapshot(
      SERVER,
      snapshot({
        slots: [{ area: 'hotbar', slot: 2, item: item('minecraft:dirt') }],
      }),
      NOW,
    );
    expect(result).toMatchObject({ status: 'applied', contentChanged: true });
    expect(
      reparseStoredSlots(store.get(USER, SERVER, 'main')!.slots)[0],
    ).toMatchObject({
      slot: 2,
    });
  });

  it('пустой снимок (все слоты пусты) принимается и очищает ряд', async () => {
    const { store, service } = setup();
    await service.applySnapshot(SERVER, snapshot(), NOW);
    const result = await service.applySnapshot(
      SERVER,
      snapshot({ capturedAt: iso(5), rev: 2, slots: [] }),
      NOW,
    );
    expect(result).toMatchObject({ status: 'applied', contentChanged: true });
    expect(store.get(USER, SERVER, 'main')!.slotCount).toBe(0);
  });

  it('группы и серверы не пересекаются', async () => {
    const { store, service } = setup();
    await service.applySnapshot(SERVER, snapshot(), NOW);
    await service.applySnapshot(
      SERVER,
      snapshot({
        group: 'ender',
        slots: [{ area: 'ender', slot: 0, item: item('minecraft:elytra') }],
      }),
      NOW,
    );
    await service.applySnapshot(
      'creative',
      snapshot({
        slots: [{ area: 'hotbar', slot: 0, item: item('minecraft:stone') }],
      }),
      NOW,
    );
    expect(store.rows.size).toBe(3);
    expect(store.get(USER, SERVER, 'main')).toBeDefined();
    expect(store.get(USER, SERVER, 'ender')).toBeDefined();
    expect(store.get(USER, 'creative', 'main')).toBeDefined();
  });

  it('непривязанный UUID — unknown_player, рядов не создаётся', async () => {
    const { store, service } = setup();
    const result = await service.applySnapshot(
      SERVER,
      snapshot({ uuid: TEST_UUID_2 }),
      NOW,
    );
    expect(result).toEqual({ status: 'rejected', code: 'unknown_player' });
    expect(store.rows.size).toBe(0);
    expect(store.mutateCalls).toBe(0);
  });

  it('невалидные данные — invalid_data без обращения к хранилищу', async () => {
    const { store, service } = setup();
    const result = await service.applySnapshot(
      SERVER,
      snapshot({ extra: true }),
      NOW,
    );
    expect(result).toMatchObject({ status: 'rejected', code: 'invalid_data' });
    expect(store.mutateCalls).toBe(0);
    expect(JSON.stringify(result)).not.toContain(TEST_UUID);
  });

  it('serverSlug вне формата — invalid_data', async () => {
    const { store, service } = setup();
    for (const slug of ['', 'Survival', 'a b', 'x'.repeat(33), 'a_b']) {
      const result = await service.applySnapshot(slug, snapshot(), NOW);
      expect(result).toMatchObject({
        status: 'rejected',
        code: 'invalid_data',
      });
    }
    expect(store.rows.size).toBe(0);
  });

  it('снимок вне окна времени отклоняется', async () => {
    const { service } = setup();
    const result = await service.applySnapshot(
      SERVER,
      snapshot({ capturedAt: iso(-8 * 86400) }),
      NOW,
    );
    expect(result).toMatchObject({ status: 'rejected', code: 'invalid_data' });
  });
});

describe('InventoryApplyService.applyDelta', () => {
  async function withBase() {
    const ctx = setup();
    await ctx.service.applySnapshot(
      SERVER,
      snapshot({
        slots: [
          { area: 'hotbar', slot: 0, item: item('minecraft:diamond_sword') },
          {
            area: 'hotbar',
            slot: 1,
            item: item('minecraft:bread', { count: 5 }),
          },
        ],
      }),
      NOW,
    );
    return ctx;
  }

  it('верная baseRev: применяет, повышает rev', async () => {
    const { store, service } = await withBase();
    const result = await service.applyDelta(SERVER, delta(), NOW);
    expect(result).toEqual({
      status: 'applied',
      kind: 'delta',
      contentChanged: true,
    });
    const row = store.get(USER, SERVER, 'main')!;
    expect(row.rev).toBe(2);
    expect(row.capturedAt).toEqual(new Date(iso(7)));
    const slots = reparseStoredSlots(row.slots);
    expect(slots.map((s) => s.slot)).toEqual([1]);
    expect(row.slotCount).toBe(1);
  });

  it('цепочка дельт rev 2, 3', async () => {
    const { store, service } = await withBase();
    await service.applyDelta(SERVER, delta(), NOW);
    const second = await service.applyDelta(
      SERVER,
      delta({
        baseRev: 2,
        rev: 3,
        capturedAt: iso(14),
        changes: [
          { area: 'armor', slot: 0, item: item('minecraft:iron_helmet') },
        ],
      }),
      NOW,
    );
    expect(second).toMatchObject({ status: 'applied', contentChanged: true });
    expect(store.get(USER, SERVER, 'main')!.rev).toBe(3);
    expect(
      reparseStoredSlots(store.get(USER, SERVER, 'main')!.slots).map(
        (s) => `${s.area}:${s.slot}`,
      ),
    ).toEqual(['hotbar:1', 'armor:0']);
  });

  it('неверная baseRev (пропуск ревизии) — resync_required, ряд не меняется', async () => {
    const { store, service } = await withBase();
    const before = store.get(USER, SERVER, 'main')!;
    const result = await service.applyDelta(
      SERVER,
      delta({ baseRev: 2, rev: 3 }),
      NOW,
    );
    expect(result).toEqual({ status: 'resync_required' });
    expect(store.get(USER, SERVER, 'main')).toBe(before);
  });

  it('чужая эпоха — resync_required', async () => {
    const { service } = await withBase();
    const result = await service.applyDelta(
      SERVER,
      delta({ epoch: TEST_EPOCH_2 }),
      NOW,
    );
    expect(result).toEqual({ status: 'resync_required' });
  });

  it('нет базового снимка — resync_required', async () => {
    const { service } = setup();
    expect(await service.applyDelta(SERVER, delta(), NOW)).toEqual({
      status: 'resync_required',
    });
  });

  it('повтор уже применённой дельты — stale, без побочных эффектов', async () => {
    const { store, service } = await withBase();
    await service.applyDelta(SERVER, delta(), NOW);
    const before = store.get(USER, SERVER, 'main')!;
    const result = await service.applyDelta(SERVER, delta(), NOW);
    expect(result).toEqual({ status: 'stale' });
    expect(store.get(USER, SERVER, 'main')).toBe(before);
  });

  it('дельта старее сохранённого capturedAt — stale', async () => {
    const { service } = await withBase();
    const result = await service.applyDelta(
      SERVER,
      delta({ capturedAt: iso(-5) }),
      NOW,
    );
    expect(result).toEqual({ status: 'stale' });
  });

  it('дельта без фактического изменения: обновляет только метаданные', async () => {
    const { store, service } = await withBase();
    const slotsBefore = store.get(USER, SERVER, 'main')!.slots;
    const result = await service.applyDelta(
      SERVER,
      delta({
        playerOnline: false,
        changes: [
          { area: 'hotbar', slot: 0, item: item('minecraft:diamond_sword') },
        ],
      }),
      NOW,
    );
    expect(result).toMatchObject({ status: 'applied', contentChanged: false });
    const row = store.get(USER, SERVER, 'main')!;
    expect(row.rev).toBe(2);
    expect(row.playerOnline).toBe(false);
    expect(row.slots).toBe(slotsBefore);
  });

  it('невалидная дельта и непривязанный UUID', async () => {
    const { service } = await withBase();
    expect(
      await service.applyDelta(SERVER, delta({ rev: 9 }), NOW),
    ).toMatchObject({ status: 'rejected', code: 'invalid_data' });
    expect(
      await service.applyDelta(SERVER, delta({ uuid: TEST_UUID_2 }), NOW),
    ).toEqual({ status: 'rejected', code: 'unknown_player' });
  });

  it('снимок после дельт начинает новую эпоху', async () => {
    const { store, service } = await withBase();
    await service.applyDelta(SERVER, delta(), NOW);
    await service.applySnapshot(
      SERVER,
      snapshot({
        epoch: TEST_EPOCH_2,
        rev: 1,
        capturedAt: iso(60),
        slots: [
          {
            area: 'hotbar',
            slot: 8,
            item: item('minecraft:torch', { count: 64 }),
          },
        ],
      }),
      NOW,
    );
    const result = await service.applyDelta(
      SERVER,
      delta({
        epoch: TEST_EPOCH_2,
        baseRev: 1,
        rev: 2,
        capturedAt: iso(65),
        changes: [{ area: 'hotbar', slot: 8, item: null }],
      }),
      NOW,
    );
    expect(result).toMatchObject({ status: 'applied', contentChanged: true });
    expect(store.get(USER, SERVER, 'main')!.slotCount).toBe(0);
  });
});
