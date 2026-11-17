import {
  InMemoryInventoryStore,
  iso,
  item,
  snapshot,
  T0,
  TEST_EPOCH,
  TEST_EPOCH_2,
  TEST_UUID,
  TEST_UUID_2,
} from '../../../test/support/in-memory-inventory';
import { InMemoryAssemblyStore } from '../../../test/support/in-memory-assembly';
import { InventoryApplyService } from './inventory-apply.service';
import {
  resolveAssemblyConfig,
  type AssemblyConfig,
} from './inventory-assembly.config';
import {
  InventoryAssemblerService,
  type AssembleResult,
} from './inventory-assembler.service';
import { InventoryRedisPolicyService } from './inventory-redis-policy.service';
import type {
  InventoryKey,
  StoredInventory,
  InventoryDecision,
} from './inventory.store';
import type { ApplyResult } from './inventory.types';

const USER = 'user-1';
const SERVER = 'survival';

/// БД со сбоем транзакции применения (внедряется тестом).
class FlakyStore extends InMemoryInventoryStore {
  failMutate = 0;
  onMutate: (() => void) | null = null;

  mutate(
    key: InventoryKey,
    decide: (current: StoredInventory | null) => InventoryDecision,
  ): Promise<ApplyResult> {
    this.onMutate?.();
    if (this.failMutate > 0) {
      this.failMutate -= 1;
      return Promise.reject(new Error('db down'));
    }
    return super.mutate(key, decide);
  }
}

const SLOTS: Record<string, unknown[]> = {
  hotbar: [{ area: 'hotbar', slot: 0, item: item('minecraft:diamond_sword') }],
  storage_a: [
    { area: 'main', slot: 0, item: item('minecraft:bread', { count: 3 }) },
  ],
  storage_b: [
    { area: 'main', slot: 14, item: item('minecraft:torch', { count: 64 }) },
  ],
  equipment: [
    { area: 'armor', slot: 0, item: item('minecraft:iron_helmet') },
    { area: 'offhand', slot: 0, item: item('minecraft:shield') },
  ],
  ender_a: [{ area: 'ender', slot: 0, item: item('minecraft:elytra') }],
  ender_b: [{ area: 'ender', slot: 14, item: item('minecraft:stone') }],
};

const MAIN4 = ['hotbar', 'storage_a', 'storage_b', 'equipment'] as const;

function snap(n: number): string {
  return `01JC0000000000000000${String(n).padStart(6, '0')}`;
}

interface PartOptions {
  snapshotId?: string;
  parts?: number;
  group?: string;
  slots?: unknown[];
  [key: string]: unknown;
}

function part(
  n: number,
  slotGroup: string,
  options: PartOptions = {},
): Record<string, unknown> {
  const { snapshotId, parts, group, slots, ...rest } = options;
  const g = group ?? 'main';
  return {
    uuid: TEST_UUID,
    group: g,
    epoch: TEST_EPOCH,
    rev: 1,
    capturedAt: iso(0),
    playerOnline: true,
    schemaVersion: 1,
    snapshotId: snapshotId ?? snap(1),
    part: n,
    parts: parts ?? (g === 'ender' ? 2 : 4),
    slotGroup,
    slots: slots ?? SLOTS[slotGroup] ?? [],
    ...rest,
  };
}

function mainSet(options: PartOptions = {}): Record<string, unknown>[] {
  return MAIN4.map((sg, i) => part(i + 1, sg, options));
}

function setup(overrides: Partial<AssemblyConfig> = {}) {
  const clock = { t: T0.getTime() + 10_000 };
  const config = resolveAssemblyConfig(overrides);
  const redis = new InMemoryAssemblyStore(() => clock.t);
  const rows = new FlakyStore();
  rows.link(TEST_UUID, USER);
  const apply = new InventoryApplyService(rows);
  const policy = new InventoryRedisPolicyService(redis, config);
  const assembler = new InventoryAssemblerService(
    redis,
    rows,
    apply,
    policy,
    config,
  );
  let counter = 0;
  const send = (
    data: Record<string, unknown>,
    eventId?: string,
    server = SERVER,
  ): Promise<AssembleResult> => {
    counter += 1;
    return assembler.acceptPart(
      server,
      eventId ?? `ev-${counter}`,
      data,
      new Date(clock.t),
    );
  };
  return { clock, config, redis, rows, apply, policy, assembler, send };
}

async function ready(overrides: Partial<AssemblyConfig> = {}) {
  const s = setup(overrides);
  await s.policy.refresh();
  return s;
}

function statuses(results: AssembleResult[]): string[] {
  return results.map((r) => r.status);
}

describe('InventoryAssemblerService: Q35, обязательные сценарии', () => {
  it.each([1, 2, 3, 4])(
    'потеря части %i: состояние не меняется, по таймауту сборка отброшена',
    async (lost) => {
      const { clock, redis, rows, send } = await ready();
      const results: AssembleResult[] = [];
      for (const p of mainSet()) {
        if (p.part !== lost) results.push(await send(p));
      }
      expect(statuses(results)).toEqual(['buffered', 'buffered', 'buffered']);
      expect(rows.rows.size).toBe(0);
      expect(rows.mutateCalls).toBe(0);
      expect(redis.assemblyCount(SERVER)).toBe(1);

      clock.t += 121_000;
      expect(redis.assemblyCount(SERVER)).toBe(0);
      expect(rows.rows.size).toBe(0);
    },
  );

  it('потерянная часть пришла после таймаута: до 150 с создаёт новую неполную сборку', async () => {
    const { clock, redis, rows, send } = await ready();
    const all = mainSet();
    for (const p of all.slice(0, 3)) await send(p);
    clock.t += 121_000; // capturedAt: возраст 131 с < 150 с
    expect(await send(all[3])).toEqual({ status: 'buffered' });
    expect(redis.assemblyCount(SERVER)).toBe(1);
    expect(rows.rows.size).toBe(0);
  });

  it('первая часть новой сборки старше 150 с: resync_required, сборка не создаётся', async () => {
    const { clock, redis, rows, send } = await ready();
    const all = mainSet();
    for (const p of all.slice(0, 3)) await send(p);
    clock.t += 200_000; // возраст 210 с
    expect(await send(all[3])).toEqual({
      status: 'rejected',
      code: 'resync_required',
      reason: 'cutoff',
    });
    expect(redis.assemblyCount(SERVER)).toBe(0);
    expect(rows.rows.size).toBe(0);
  });

  it('отсечка 150 с не касается частей живой сборки', async () => {
    const { clock, redis, rows, send } = await ready();
    const all = mainSet({ capturedAt: iso(-100) }); // к 1-й части возраст 110 с
    expect((await send(all[0])).status).toBe('buffered');
    clock.t += 100_000; // возраст 210 с, сборке 100 с
    expect((await send(all[1])).status).toBe('buffered');
    expect((await send(all[2])).status).toBe('buffered');
    expect((await send(all[3])).status).toBe('applied');
    expect(redis.assemblyCount(SERVER)).toBe(0);
    expect(rows.get(USER, SERVER, 'main')?.slotCount).toBe(5);
  });

  it('повтор части: тот же eventId и новый eventId — duplicate, без дубля в буфере', async () => {
    const { redis, rows, send } = await ready();
    const all = mainSet();
    expect(await send(all[0], 'ev-a')).toEqual({ status: 'buffered' });
    const bytes = redis.bufferBytesOf(SERVER);
    expect(await send(all[0], 'ev-a')).toEqual({ status: 'duplicate' });
    expect(await send(all[0], 'ev-b')).toEqual({ status: 'duplicate' });
    expect(redis.bufferBytesOf(SERVER)).toBe(bytes);

    for (const p of all.slice(1)) await send(p);
    expect(rows.mutateCalls).toBe(1);
    expect(rows.get(USER, SERVER, 'main')?.slotCount).toBe(5);

    // После применения: метка done.
    expect(await send(all[0], 'ev-c')).toEqual({ status: 'duplicate' });
    expect(await send(all[3], 'ev-d')).toEqual({ status: 'duplicate' });
    expect(rows.mutateCalls).toBe(1);
    expect(redis.hasDone(SERVER, snap(1))).toBe(true);
    expect(redis.doneTtl(SERVER, snap(1))).toBe(300_000);
  });

  it('та же часть с другим содержимым: conflict, сборка сброшена, дальше snapshot_mismatch', async () => {
    const { redis, rows, send } = await ready();
    const all = mainSet();
    await send(all[0]);
    const changed = part(1, 'hotbar', {
      slots: [{ area: 'hotbar', slot: 1, item: item('minecraft:dirt') }],
    });
    expect(await send(changed)).toMatchObject({
      status: 'rejected',
      code: 'conflict',
    });
    expect(redis.assemblyCount(SERVER)).toBe(0);
    expect(await send(all[1])).toMatchObject({
      status: 'rejected',
      code: 'snapshot_mismatch',
    });
    expect(rows.rows.size).toBe(0);
  });

  it.each([
    ['прямой', [0, 1, 2, 3]],
    ['обратный', [3, 2, 1, 0]],
    ['перемешанный', [2, 0, 3, 1]],
  ])('порядок %s: комплект собран, результат одинаков', async (_n, order) => {
    const { rows, send } = await ready();
    const all = mainSet();
    const results: AssembleResult[] = [];
    for (const i of order) results.push(await send(all[i]));
    expect(statuses(results)).toEqual([
      'buffered',
      'buffered',
      'buffered',
      'applied',
    ]);
    const row = rows.get(USER, SERVER, 'main')!;
    expect(row.slotCount).toBe(5);
    // contentHash одинаков для любого порядка прихода.
    const reference = await ready();
    for (const p of mainSet()) await reference.send(p);
    expect(row.contentHash).toBe(
      reference.rows.get(USER, SERVER, 'main')!.contentHash,
    );
  });

  it('разное parts: snapshot_mismatch, комплект не применён, следующие части тоже отклонены', async () => {
    const { redis, rows, send } = await ready();
    expect((await send(part(1, 'hotbar'))).status).toBe('buffered');
    // тот же snapshotId, но раскладка main/1 (допустима сама по себе)
    expect(
      await send(part(1, 'all', { parts: 1, slots: SLOTS.hotbar })),
    ).toMatchObject({ status: 'rejected', code: 'snapshot_mismatch' });
    expect(redis.assemblyCount(SERVER)).toBe(0);
    expect(redis.markOf(SERVER, snap(1))).toBe('poison');
    expect(await send(part(2, 'storage_a'))).toMatchObject({
      status: 'rejected',
      code: 'snapshot_mismatch',
    });
    expect(rows.rows.size).toBe(0);
  });

  it.each([
    ['epoch', { epoch: TEST_EPOCH_2 }],
    ['rev', { rev: 2 }],
    ['capturedAt', { capturedAt: iso(1) }],
    ['playerOnline', { playerOnline: false }],
    ['uuid', { uuid: TEST_UUID_2 }],
  ])('разный заголовок %s между частями: snapshot_mismatch', async (_n, diff) => {
    const { rows, send } = await ready();
    rows.link(TEST_UUID_2, 'user-2');
    await send(part(1, 'hotbar'));
    expect(await send(part(2, 'storage_a', diff))).toMatchObject({
      status: 'rejected',
      code: 'snapshot_mismatch',
    });
    expect(rows.rows.size).toBe(0);
  });

  it('сбой применения на завершающей части: 503, части целы; повтор под тем же eventId применяет', async () => {
    const { redis, rows, send } = await ready();
    const all = mainSet();
    for (const p of all.slice(0, 3)) await send(p);
    rows.failMutate = 1;
    const failed = await send(all[3], 'ev-final');
    expect(failed).toMatchObject({ status: 'unavailable', reason: 'db' });
    expect(redis.assemblyCount(SERVER)).toBe(1);
    expect(redis.hasLock(SERVER, snap(1))).toBe(false);
    expect(redis.hasDone(SERVER, snap(1))).toBe(false);
    expect(redis.hasEvt(SERVER, 'ev-final')).toBe(false);
    expect(rows.rows.size).toBe(0);

    expect(await send(all[3], 'ev-final')).toMatchObject({
      status: 'applied',
      contentChanged: true,
    });
    expect(rows.get(USER, SERVER, 'main')?.slotCount).toBe(5);
    expect(redis.assemblyCount(SERVER)).toBe(0);
    expect(redis.hasDone(SERVER, snap(1))).toBe(true);
    // повторная отправка после применения — duplicate
    expect(await send(all[3], 'ev-final')).toEqual({ status: 'duplicate' });
    expect(rows.mutateCalls).toBe(1); // сбойная попытка в счёт не идёт
  });

  it('сбой применения: повтор завершающей части под НОВЫМ eventId тоже применяет', async () => {
    const { rows, send } = await ready();
    const all = mainSet();
    for (const p of all.slice(0, 3)) await send(p);
    rows.failMutate = 1;
    await send(all[3], 'ev-1');
    expect(await send(all[3], 'ev-2')).toMatchObject({ status: 'applied' });
    expect(rows.get(USER, SERVER, 'main')?.slotCount).toBe(5);
  });

  it('сбой дольше 120 с: сборка истекла, снимок не применён', async () => {
    const { clock, redis, rows, send } = await ready();
    const all = mainSet();
    for (const p of all.slice(0, 3)) await send(p);
    rows.failMutate = 5;
    await send(all[3]);
    clock.t += 121_000;
    expect(redis.assemblyCount(SERVER)).toBe(0);
    expect(rows.rows.size).toBe(0);
  });
});

describe('InventoryAssemblerService: проверки до Redis (шаг П0)', () => {
  const bad: Array<[string, Record<string, unknown>]> = [
    ['snapshotId короче 26', part(1, 'hotbar', { snapshotId: 'abc' })],
    [
      'snapshotId с символом вне набора',
      part(1, 'hotbar', { snapshotId: `${snap(1).slice(0, 25)}!` }),
    ],
    ['parts вне перечня (main, 2)', part(1, 'hotbar', { parts: 2 })],
    ['parts больше 4', part(1, 'hotbar', { parts: 5 })],
    [
      '(ender, 4)',
      part(1, 'ender_a', { group: 'ender', parts: 4, slots: SLOTS.ender_a }),
    ],
    ['ender_a для main', part(1, 'ender_a', { slots: [] })],
    [
      'слот вне диапазона slotGroup',
      part(1, 'storage_a', {
        slots: [{ area: 'main', slot: 14, item: item() }],
      }),
    ],
    ['part вне 1..parts', part(5, 'hotbar')],
    ['rev выше 2^31-1', part(1, 'hotbar', { rev: 2_147_483_648 })],
    ['лишнее поле', part(1, 'hotbar', { extra: 1 })],
    [
      'дубль слота в части',
      part(1, 'hotbar', {
        slots: [
          { area: 'hotbar', slot: 0, item: item() },
          { area: 'hotbar', slot: 0, item: item('minecraft:dirt') },
        ],
      }),
    ],
  ];

  it.each(bad)('%s: invalid_data, ноль обращений к Redis и БД', async (_n, data) => {
    const { redis, rows, send } = await ready();
    const before = { ...redis.calls };
    const result = await send(data);
    expect(result).toMatchObject({ status: 'rejected', code: 'invalid_data' });
    expect(redis.calls).toEqual(before);
    expect(rows.mutateCalls).toBe(0);
  });

  it('serverSlug и eventId вне формата: invalid_data', async () => {
    const { redis, send } = await ready();
    const before = { ...redis.calls };
    expect(await send(part(1, 'hotbar'), 'ev-1', 'BAD SLUG')).toMatchObject({
      code: 'invalid_data',
    });
    expect(await send(part(1, 'hotbar'), 'ev id')).toMatchObject({
      code: 'invalid_data',
    });
    expect(redis.calls).toEqual(before);
  });

  it('epoch: now + 11 минут — epoch_out_of_range без Redis; now + 10 минут принимается', async () => {
    const { clock, redis, send } = await ready();
    const before = { ...redis.calls };
    const tooFar = String(clock.t + 11 * 60_000);
    expect(await send(part(1, 'hotbar', { epoch: tooFar }))).toMatchObject({
      status: 'rejected',
      code: 'epoch_out_of_range',
    });
    expect(
      await send(part(1, 'hotbar', { epoch: '9007199254740991' })),
    ).toMatchObject({ code: 'epoch_out_of_range' });
    expect(redis.calls).toEqual(before);
    const limit = String(clock.t + 10 * 60_000);
    expect(await send(part(1, 'hotbar', { epoch: limit }))).toEqual({
      status: 'buffered',
    });
  });

  it('части пустой группы (slots: []) принимаются, полнота — по набору slotGroup', async () => {
    const { rows, send } = await ready();
    const empty = MAIN4.map((sg, i) => part(i + 1, sg, { slots: [] }));
    for (const p of empty) await send(p);
    expect(rows.get(USER, SERVER, 'main')?.slotCount).toBe(0);
  });

  it('два раза hotbar вместо hotbar и equipment: комплект не полон и не применяется', async () => {
    const { redis, rows, send } = await ready();
    expect((await send(part(1, 'hotbar'))).status).toBe('buffered');
    expect(await send(part(2, 'hotbar'))).toMatchObject({
      status: 'rejected',
      code: 'conflict',
    });
    expect(rows.rows.size).toBe(0);
    expect(redis.assemblyCount(SERVER)).toBe(0);
  });

  it('ender: комплект из двух частей и одиночный all', async () => {
    const { rows, send } = await ready();
    const a = part(1, 'ender_a', { group: 'ender', snapshotId: snap(2) });
    const b = part(2, 'ender_b', { group: 'ender', snapshotId: snap(2) });
    expect((await send(b)).status).toBe('buffered');
    expect((await send(a)).status).toBe('applied');
    expect(rows.get(USER, SERVER, 'ender')?.slotCount).toBe(2);
    const whole = part(1, 'all', {
      group: 'main',
      parts: 1,
      snapshotId: snap(3),
      rev: 2,
      slots: SLOTS.hotbar,
    });
    expect((await send(whole)).status).toBe('applied');
    expect(rows.get(USER, SERVER, 'main')?.slotCount).toBe(1);
  });

  it('непривязанный UUID: unknown_player, сборка не создаётся', async () => {
    const { redis, rows, send } = await ready();
    rows.accounts.clear();
    expect(await send(part(1, 'hotbar'))).toMatchObject({
      status: 'rejected',
      code: 'unknown_player',
    });
    expect(redis.assemblyCount(SERVER)).toBe(0);
  });

  it('отвязка между созданием сборки и применением: unknown_player, ряд не записан', async () => {
    const { redis, rows, send } = await ready();
    const all = mainSet();
    for (const p of all.slice(0, 3)) await send(p);
    rows.accounts.clear();
    expect(await send(all[3])).toMatchObject({
      status: 'rejected',
      code: 'unknown_player',
    });
    expect(rows.rows.size).toBe(0);
    expect(redis.assemblyCount(SERVER)).toBe(0);
    expect(redis.hasDone(SERVER, snap(1))).toBe(false);
  });

  it('перепривязка на другого пользователя: resync_required', async () => {
    const { rows, send } = await ready();
    const all = mainSet();
    for (const p of all.slice(0, 3)) await send(p);
    rows.link(TEST_UUID, 'user-9');
    expect(await send(all[3])).toMatchObject({
      status: 'rejected',
      code: 'resync_required',
    });
    expect(rows.rows.size).toBe(0);
  });
});

describe('InventoryAssemblerService: свежесть (epoch, затем rev)', () => {
  it('снимок не свежее применённого: stale, сборка не создаётся', async () => {
    const { redis, send } = await ready();
    for (const p of mainSet({ rev: 5 })) await send(p);
    const old = part(1, 'hotbar', { snapshotId: snap(2), rev: 4 });
    expect(await send(old)).toEqual({ status: 'stale' });
    expect(redis.assemblyCount(SERVER)).toBe(0);
  });

  it('новая эпоха с МЕНЬШИМ capturedAt применяется, та же эпоха с меньшим rev и БОЛЬШИМ capturedAt — stale', async () => {
    const { rows, clock, send } = await ready();
    for (const p of mainSet({ rev: 90, capturedAt: iso(5) })) await send(p);
    clock.t += 1000;
    const newer = mainSet({
      snapshotId: snap(2),
      epoch: TEST_EPOCH_2,
      rev: 5,
      capturedAt: iso(1),
    });
    const results: AssembleResult[] = [];
    for (const p of newer) results.push(await send(p));
    expect(results[3].status).toBe('applied');
    expect(rows.get(USER, SERVER, 'main')?.epoch).toBe(TEST_EPOCH_2);

    const regress = part(1, 'hotbar', {
      snapshotId: snap(3),
      epoch: TEST_EPOCH_2,
      rev: 3,
      capturedAt: iso(9),
    });
    expect(await send(regress)).toEqual({ status: 'stale' });
  });

  it('более свежий полный комплект вытесняет неполный меньшей свежести; поздняя часть — stale', async () => {
    const { redis, send } = await ready();
    const a = mainSet({ snapshotId: snap(1), rev: 3 });
    const b = mainSet({ snapshotId: snap(2), rev: 5 });
    await send(a[0]);
    for (const p of b) await send(p);
    expect(redis.assemblyCount(SERVER)).toBe(0);
    expect(redis.markOf(SERVER, snap(1))).toBe('superseded');
    expect(await send(a[1])).toEqual({ status: 'stale' });
  });

  it('свежая неполная сборка не сбрасывается применением более старой', async () => {
    const { redis, send } = await ready();
    const fresh = mainSet({ snapshotId: snap(1), rev: 7 });
    const older = mainSet({ snapshotId: snap(2), rev: 5 });
    await send(fresh[0]);
    for (const p of older) await send(p);
    expect(redis.assemblyCount(SERVER)).toBe(1);
    expect(redis.markOf(SERVER, snap(1))).toBeNull();
  });

  it('полный комплект не свежее применённого: stale на завершающей части, метка stale', async () => {
    const { rows, apply, redis, send, clock } = await ready();
    const all = mainSet({ rev: 2 });
    for (const p of all.slice(0, 3)) await send(p);
    // между сборкой и применением в ряд попал более свежий снимок
    await apply.applySnapshot(
      SERVER,
      snapshot({ rev: 9, capturedAt: iso(2) }),
      new Date(clock.t),
    );
    expect(await send(all[3])).toEqual({ status: 'stale' });
    expect(redis.markOf(SERVER, snap(1))).toBe('stale');
    expect(redis.assemblyCount(SERVER)).toBe(0);
    expect(rows.get(USER, SERVER, 'main')?.rev).toBe(9);
  });
});

describe('InventoryAssemblerService: лимиты', () => {
  const user = (n: number) => ({
    uuid: `00000000-0000-4000-8000-00000000010${n}`,
    id: `user-limit-${n}`,
  });

  it('шесть снимков в минуту проходят, седьмой — resync_required; части существующей сборки лимитом не отклоняются', async () => {
    const { clock, rows, send } = await ready();
    const one = (n: number, rev: number) =>
      part(1, 'all', {
        parts: 1,
        snapshotId: snap(n),
        rev,
        slots: [{ area: 'hotbar', slot: 0, item: item('minecraft:dirt') }],
      });
    for (let n = 1; n <= 5; n += 1) {
      expect((await send(one(n, n))).status).toBe('applied');
    }
    // шестая сборка (счёт = 6): 4 части, берём только первые две
    const six = mainSet({ snapshotId: snap(6), rev: 6 });
    expect((await send(six[0])).status).toBe('buffered');
    // седьмой снимок за минуту
    expect(await send(one(7, 7))).toMatchObject({
      status: 'rejected',
      code: 'resync_required',
      reason: 'rate',
    });
    // повтор части не увеличивает счётчик, остальные части сборки принимаются
    expect((await send(six[0])).status).toBe('duplicate');
    expect((await send(six[1])).status).toBe('buffered');
    expect((await send(six[2])).status).toBe('buffered');
    expect((await send(six[3])).status).toBe('applied');
    expect(rows.get(USER, SERVER, 'main')?.slotCount).toBe(5);
    // через минуту счётчик освобождается
    clock.t += 61_000;
    expect((await send(one(7, 7))).status).toBe('applied');
  });

  it('третья сборка игрока и группы вытесняет самую старую по firstSeenAt', async () => {
    const { clock, redis, send } = await ready();
    const first = mainSet({ snapshotId: snap(1), rev: 1 });
    const second = mainSet({ snapshotId: snap(2), rev: 2 });
    const third = mainSet({ snapshotId: snap(3), rev: 3 });
    await send(first[0]);
    clock.t += 1000;
    await send(second[0]);
    clock.t += 1000;
    await send(third[0]);
    expect(redis.assemblyCount(SERVER)).toBe(2);
    expect(redis.markOf(SERVER, snap(1))).toBe('evicted');
    expect(await send(first[1])).toMatchObject({
      status: 'rejected',
      code: 'resync_required',
      reason: 'evicted',
    });
  });

  it('сборок на сервер больше лимита: resync_required без вытеснения чужих', async () => {
    const { rows, redis, send } = await ready({ maxAssembliesPerServer: 3 });
    for (let n = 1; n <= 4; n += 1) {
      rows.link(user(n).uuid, user(n).id);
    }
    for (let n = 1; n <= 3; n += 1) {
      const r = await send(
        part(1, 'hotbar', { uuid: user(n).uuid, snapshotId: snap(n) }),
      );
      expect(r.status).toBe('buffered');
    }
    expect(
      await send(part(1, 'hotbar', { uuid: user(4).uuid, snapshotId: snap(4) })),
    ).toMatchObject({ code: 'resync_required', reason: 'ceiling_assemblies' });
    expect(redis.assemblyCount(SERVER)).toBe(3);
  });

  it('буфер сервера: превышение — resync_required', async () => {
    const { rows, redis, send } = await ready({
      maxBufferBytesPerServer: 2000,
    });
    for (let n = 1; n <= 3; n += 1) rows.link(user(n).uuid, user(n).id);
    expect(
      (await send(part(1, 'hotbar', { uuid: user(1).uuid, snapshotId: snap(1) })))
        .status,
    ).toBe('buffered');
    const second = await send(
      part(1, 'hotbar', { uuid: user(2).uuid, snapshotId: snap(2) }),
    );
    expect(second).toMatchObject({
      code: 'resync_required',
      reason: 'ceiling_buffer',
    });
    expect(redis.assemblyCount(SERVER)).toBe(1);
  });

  it('потолок сервера по доле: resync_required, остальные серверы не затронуты', async () => {
    const { redis, send } = await ready({ maxServerBytes: 1500 });
    expect(
      await send(part(1, 'hotbar', { snapshotId: snap(1) }), 'e1', 'one'),
    ).toMatchObject({ code: 'resync_required', reason: 'ceiling_server' });
    expect(redis.assemblyCount('one')).toBe(0);
  });

  it('снимок сверх предела сборки: invalid_data, сборка сброшена', async () => {
    const { redis, send } = await ready({ maxAssembledBytes: 180 });
    const all = mainSet();
    expect((await send(all[0])).status).toBe('buffered');
    expect((await send(all[1])).status).toBe('buffered');
    expect(await send(all[2])).toMatchObject({
      status: 'rejected',
      code: 'invalid_data',
      reason: 'assembly_too_large',
    });
    expect(redis.assemblyCount(SERVER)).toBe(0);
  });

  it('изоляция серверов: одинаковый snapshotId на двух serverId не пересекается', async () => {
    const { redis, rows, send } = await ready();
    const all = mainSet();
    await send(all[0], 'ea', 'survival');
    await send(all[0], 'eb', 'creative');
    for (const p of all.slice(1)) await send(p, undefined, 'survival');
    expect(rows.get(USER, 'survival', 'main')?.slotCount).toBe(5);
    expect(rows.get(USER, 'creative', 'main')).toBeUndefined();
    expect(redis.assemblyCount('creative')).toBe(1);
  });
});

describe('InventoryAssemblerService: захват, недоступный Redis', () => {
  it('захват занят другим запросом: unavailable lock_busy, применения нет', async () => {
    const { redis, rows, clock, send } = await ready();
    const all = mainSet();
    for (const p of all.slice(0, 3)) await send(p);
    redis.stealLock(SERVER, snap(1), 'other-token', clock.t + 30_000);
    expect(await send(all[3])).toMatchObject({
      status: 'unavailable',
      reason: 'lock_busy',
    });
    expect(rows.mutateCalls).toBe(0);
  });

  it('чужой захват к финишу: lock_lost, done не пишется; позже повтор применяет идемпотентно', async () => {
    const { redis, rows, clock, send } = await ready();
    const all = mainSet();
    for (const p of all.slice(0, 3)) await send(p);
    rows.onMutate = () => {
      redis.stealLock(SERVER, snap(1), 'other-token', clock.t + 30_000);
    };
    expect(await send(all[3])).toMatchObject({
      status: 'unavailable',
      reason: 'lock_lost',
    });
    expect(redis.hasDone(SERVER, snap(1))).toBe(false);
    expect(redis.assemblyCount(SERVER)).toBe(1);
    rows.onMutate = null;
    clock.t += 31_000;
    expect(await send(all[3])).toMatchObject({
      status: 'applied',
      contentChanged: false,
    });
    expect(redis.hasDone(SERVER, snap(1))).toBe(true);
  });

  it('Redis недоступен: unavailable redis; ложного duplicate после восстановления нет', async () => {
    const { redis, rows, send } = await ready();
    const all = mainSet();
    redis.down = true;
    expect(await send(all[0], 'ev-x')).toMatchObject({
      status: 'unavailable',
      reason: 'redis',
    });
    redis.down = false;
    expect(await send(all[0], 'ev-x')).toEqual({ status: 'buffered' });
    expect(rows.rows.size).toBe(0);
  });
});

describe('InventoryAssemblerService: политика Redis (fail-closed)', () => {
  it('до первой проверки: resync_required policy_blocked, нулевое число обращений к буферу', async () => {
    const { redis, send } = setup();
    expect(await send(part(1, 'hotbar'))).toMatchObject({
      status: 'rejected',
      code: 'resync_required',
      reason: 'policy_blocked',
    });
    expect(redis.calls.probe + redis.calls.offer + redis.calls.finish).toBe(0);
  });

  const blockedPolicies: Array<[string, string | null]> = [
    ['allkeys-lru', '1000000'],
    ['volatile-lru', '1000000'],
    ['noeviction', '0'],
    ['noeviction', null],
  ];

  it.each(blockedPolicies)('policy=%s maxmemory=%s блокирует сборку', async (policy, maxMemory) => {
    const { redis, policy: guard, send } = setup();
    redis.policy = policy;
    redis.maxMemory = maxMemory;
    await guard.refresh();
    expect(guard.isConfirmed()).toBe(false);
    expect(await send(part(1, 'hotbar'))).toMatchObject({
      code: 'resync_required',
      reason: 'policy_blocked',
    });
    expect(redis.calls.offer).toBe(0);
  });

  it('CONFIG GET недоступен: блокировка; явное подтверждение владельца снимает её', async () => {
    const blocked = setup();
    blocked.redis.configError = true;
    expect((await blocked.policy.refresh()).confirmed).toBe(false);

    const acknowledged = setup({ redisPolicyAcknowledged: true });
    acknowledged.redis.configError = true;
    expect(await acknowledged.policy.refresh()).toEqual({
      confirmed: true,
      via: 'owner_acknowledged',
    });
    expect((await acknowledged.send(part(1, 'hotbar'))).status).toBe(
      'buffered',
    );
  });

  it('переподключение сбрасывает подтверждение; после проверки приём возобновляется', async () => {
    const { redis, policy, send } = await ready();
    expect((await send(part(1, 'hotbar'))).status).toBe('buffered');
    policy.onReconnect();
    expect(await send(part(2, 'storage_a'))).toMatchObject({
      reason: 'policy_blocked',
    });
    redis.policy = 'allkeys-lru';
    await policy.refresh();
    expect((await send(part(2, 'storage_a'))).status).toBe('rejected');
    redis.policy = 'noeviction';
    await policy.refresh();
    expect((await send(part(2, 'storage_a'))).status).toBe('buffered');
  });
});

describe('InventoryAssemblerService: TTL меток', () => {
  it('T = 120 с: done живёт 300 с; T = 600 с — 970 с, повтор через 301 и 900 с не применяет второй раз', async () => {
    const short = await ready();
    for (const p of mainSet()) await short.send(p);
    expect(short.redis.doneTtl(SERVER, snap(1))).toBe(300_000);

    const long = await ready({ assemblyTimeoutMs: 600_000 });
    const all = mainSet();
    for (const p of all) await long.send(p);
    expect(long.redis.doneTtl(SERVER, snap(1))).toBe(970_000);
    // 301 с и 900 с: метка жива, повтор — duplicate; capturedAt при этом
    // старше отсечки, но done проверяется первым.
    long.clock.t += 301_000;
    expect(await long.send(all[0])).toEqual({ status: 'duplicate' });
    long.clock.t += 599_000;
    expect(await long.send(all[0])).toEqual({ status: 'duplicate' });
    expect(long.rows.mutateCalls).toBe(1);
  });

  it('после истечения done повтор части — resync_required по отсечке, а не повторное применение', async () => {
    const { clock, rows, send } = await ready();
    const all = mainSet();
    for (const p of all) await send(p);
    clock.t += 301_000;
    expect(await send(all[0])).toMatchObject({
      code: 'resync_required',
      reason: 'cutoff',
    });
    expect(rows.mutateCalls).toBe(1);
  });
});

describe('InventoryAssemblerService: метрики и утечки', () => {
  it('счётчики по результатам; в ключах счётчиков нет UUID', async () => {
    const { assembler, send } = await ready();
    await send(part(1, 'hotbar'));
    await send(part(1, 'hotbar', { snapshotId: 'bad' }));
    const keys = [...assembler.counters.keys()];
    expect(keys).toEqual(
      expect.arrayContaining(['buffered', 'rejected:invalid_data']),
    );
    expect(JSON.stringify(keys)).not.toContain(TEST_UUID);
  });
});
