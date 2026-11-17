import {
  delta,
  item,
  iso,
  snapshot,
  T0,
  TEST_UUID,
} from '../../../test/support/in-memory-inventory';
import {
  applyChanges,
  assertRowSize,
  canonicalJson,
  hashSlots,
  jsonBytes,
  parseDelta,
  parseItem,
  parseSnapshot,
  reparseStoredSlots,
} from './inventory-normalize';
import { InventoryValidationError } from './inventory.types';
import type { NormalizedSlot } from './inventory.types';

const SECTION = String.fromCharCode(0xa7);

function rejects(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(InventoryValidationError);
    return (error as InventoryValidationError).reason;
  }
  throw new Error('ожидалась ошибка валидации');
}

describe('parseSnapshot', () => {
  it('принимает валидный снимок и нормализует предмет в компактную форму', () => {
    const parsed = parseSnapshot(
      snapshot({
        slots: [
          {
            area: 'hotbar',
            slot: 0,
            item: item('minecraft:diamond_sword', {
              damage: 12,
              maxDamage: 1561,
              enchants: [{ id: 'minecraft:sharpness', level: 5 }],
              storedEnchants: [],
              name: [{ text: 'Меч', color: '#f26a1b', italic: false }],
              lore: [[{ text: 'Строка лора' }]],
              customModelData: null,
              itemsAdderId: null,
              unbreakable: false,
              dyeColor: null,
              potion: null,
              containerItemCount: null,
            }),
          },
        ],
      }),
      T0,
    );
    expect(parsed.uuid).toBe(TEST_UUID);
    expect(parsed.slots).toEqual([
      {
        area: 'hotbar',
        slot: 0,
        item: {
          id: 'minecraft:diamond_sword',
          count: 1,
          damage: 12,
          maxDamage: 1561,
          enchants: [{ id: 'minecraft:sharpness', level: 5 }],
          name: [{ text: 'Меч', color: '#F26A1B', italic: false }],
          lore: [[{ text: 'Строка лора' }]],
        },
      },
    ]);
  });

  it('приводит UUID к нижнему регистру', () => {
    const parsed = parseSnapshot(
      snapshot({ uuid: TEST_UUID.toUpperCase() }),
      T0,
    );
    expect(parsed.uuid).toBe(TEST_UUID);
  });

  it.each([
    ['лишнее поле конверта', snapshot({ extra: 1 })],
    ['неверный schemaVersion', snapshot({ schemaVersion: 2 })],
    ['нет schemaVersion', snapshot({ schemaVersion: undefined })],
    ['неверная группа', snapshot({ group: 'chest' })],
    ['uuid не UUID', snapshot({ uuid: 'not-a-uuid' })],
    ['epoch строкой', snapshot({ epoch: 'abc' })],
    ['epoch ULID-строкой', snapshot({ epoch: '01JC0000000000000000000001' })],
    ['epoch строкой из цифр', snapshot({ epoch: '1763380800000' })],
    ['epoch дробный', snapshot({ epoch: 1.5 })],
    ['epoch ноль', snapshot({ epoch: 0 })],
    ['rev 0', snapshot({ rev: 0 })],
    ['rev дробный', snapshot({ rev: 1.5 })],
    ['playerOnline не boolean', snapshot({ playerOnline: 'yes' })],
    ['slots не массив', snapshot({ slots: {} })],
  ])('отклоняет: %s', (_name, data) => {
    rejects(() => parseSnapshot(data, T0));
  });

  it('отклоняет не-объект', () => {
    rejects(() => parseSnapshot(null, T0));
    rejects(() => parseSnapshot([], T0));
    rejects(() => parseSnapshot('x', T0));
  });

  it('capturedAt: только UTC и окно [-7 суток; +60 с]', () => {
    rejects(() =>
      parseSnapshot(snapshot({ capturedAt: '2026-11-17T12:00:00+03:00' }), T0),
    );
    rejects(() => parseSnapshot(snapshot({ capturedAt: 'вчера' }), T0));
    rejects(() => parseSnapshot(snapshot({ capturedAt: 12345 }), T0));
    rejects(() =>
      parseSnapshot(snapshot({ capturedAt: iso(-7 * 86400 - 1) }), T0),
    );
    rejects(() => parseSnapshot(snapshot({ capturedAt: iso(61) }), T0));
    expect(() =>
      parseSnapshot(snapshot({ capturedAt: iso(-7 * 86400) }), T0),
    ).not.toThrow();
    expect(() =>
      parseSnapshot(snapshot({ capturedAt: iso(60) }), T0),
    ).not.toThrow();
  });

  it('слоты: область должна подходить группе, индекс в границах, без повторов', () => {
    const slot = (area: string, n: number) => ({
      area,
      slot: n,
      item: item(),
    });
    rejects(() => parseSnapshot(snapshot({ slots: [slot('ender', 0)] }), T0));
    rejects(() =>
      parseSnapshot(
        snapshot({ group: 'ender', slots: [slot('hotbar', 0)] }),
        T0,
      ),
    );
    rejects(() => parseSnapshot(snapshot({ slots: [slot('hotbar', 9)] }), T0));
    rejects(() => parseSnapshot(snapshot({ slots: [slot('hotbar', -1)] }), T0));
    rejects(() => parseSnapshot(snapshot({ slots: [slot('main', 27)] }), T0));
    rejects(() => parseSnapshot(snapshot({ slots: [slot('armor', 4)] }), T0));
    rejects(() => parseSnapshot(snapshot({ slots: [slot('offhand', 1)] }), T0));
    rejects(() => parseSnapshot(snapshot({ slots: [slot('legs', 0)] }), T0));
    rejects(() =>
      parseSnapshot(
        snapshot({ slots: [slot('hotbar', 0), slot('hotbar', 0)] }),
        T0,
      ),
    );
    rejects(() =>
      parseSnapshot(
        snapshot({ slots: [{ area: 'hotbar', slot: 0, item: item(), x: 1 }] }),
        T0,
      ),
    );
    expect(() =>
      parseSnapshot(snapshot({ slots: [slot('offhand', 0)] }), T0),
    ).not.toThrow();
  });

  it('42 слота main — отказ; 41 — принято (после нормализации не больше 24 КБ)', () => {
    const all = (n: number) => {
      const slots: unknown[] = [];
      const areas: Array<[string, number]> = [
        ['hotbar', 9],
        ['main', 27],
        ['armor', 4],
        ['offhand', 1],
      ];
      for (const [area, size] of areas) {
        for (let i = 0; i < size && slots.length < n; i += 1) {
          slots.push({ area, slot: i, item: item() });
        }
      }
      return slots;
    };
    expect(all(41)).toHaveLength(41);
    expect(parseSnapshot(snapshot({ slots: all(41) }), T0).slots).toHaveLength(
      41,
    );
    const tooMany = [...all(41), { area: 'hotbar', slot: 0, item: item() }];
    rejects(() => parseSnapshot(snapshot({ slots: tooMany }), T0));
  });

  it('ender: до 27 слотов', () => {
    const slots = Array.from({ length: 27 }, (_v, i) => ({
      area: 'ender',
      slot: i,
      item: item('minecraft:stone', { count: 64 }),
    }));
    expect(
      parseSnapshot(snapshot({ group: 'ender', slots }), T0).slots,
    ).toHaveLength(27);
    rejects(() =>
      parseSnapshot(
        snapshot({
          group: 'ender',
          slots: [...slots, { area: 'ender', slot: 27, item: item() }],
        }),
        T0,
      ),
    );
  });

  it('сортирует слоты в каноническом порядке областей', () => {
    const parsed = parseSnapshot(
      snapshot({
        slots: [
          { area: 'offhand', slot: 0, item: item('minecraft:shield') },
          { area: 'hotbar', slot: 3, item: item() },
          { area: 'armor', slot: 0, item: item('minecraft:iron_helmet') },
          { area: 'hotbar', slot: 1, item: item() },
          { area: 'main', slot: 5, item: item() },
        ],
      }),
      T0,
    );
    expect(parsed.slots.map((s) => `${s.area}:${s.slot}`)).toEqual([
      'hotbar:1',
      'hotbar:3',
      'main:5',
      'armor:0',
      'offhand:0',
    ]);
  });
});

describe('parseItem: схема и лимиты', () => {
  const ok = (extra: Record<string, unknown>) =>
    parseItem(item('minecraft:stone', extra), 'item');
  const bad = (extra: Record<string, unknown>) =>
    rejects(() => parseItem(item('minecraft:stone', extra), 'item'));

  it('count 1..99', () => {
    expect(ok({ count: 99 }).count).toBe(99);
    bad({ count: 0 });
    bad({ count: 100 });
    bad({ count: 1.5 });
    bad({ count: '1' });
  });

  it('id: формат и длина', () => {
    rejects(() => parseItem({ id: 'Minecraft:Stone', count: 1 }, 'item'));
    rejects(() => parseItem({ id: 'stone', count: 1 }, 'item'));
    rejects(() => parseItem({ id: 'minecraft:st one', count: 1 }, 'item'));
    rejects(() => parseItem({ id: 'minecraft:<img>', count: 1 }, 'item'));
    rejects(() =>
      parseItem({ id: `minecraft:${'a'.repeat(60)}`, count: 1 }, 'item'),
    );
    rejects(() => parseItem({ count: 1 }, 'item'));
  });

  it('лишнее поле предмета, сырой NBT, ссылки — отказ', () => {
    bad({ nbt: '{}' });
    bad({ components: {} });
    bad({ clickEvent: {} });
    bad({ headOwner: 'someone' });
    bad({ loreTruncated: true });
  });

  it('damage, maxDamage, customModelData, dyeColor, containerItemCount: границы', () => {
    bad({ damage: -1 });
    bad({ damage: 100_001 });
    bad({ maxDamage: 100_001 });
    bad({ customModelData: 2_147_483_648 });
    bad({ dyeColor: 16_777_216 });
    bad({ containerItemCount: 65 });
    expect(ok({ damage: 0, maxDamage: 100_000 })).toMatchObject({
      damage: 0,
      maxDamage: 100_000,
    });
    expect(
      ok({ customModelData: 2_147_483_647, dyeColor: 16_777_215 }),
    ).toMatchObject({ customModelData: 2_147_483_647, dyeColor: 16_777_215 });
    expect(ok({ containerItemCount: 64 }).containerItemCount).toBe(64);
  });

  it('зачарования: до 32, уровень 1..255, id по формату, лишние поля', () => {
    const e = (n: number) =>
      Array.from({ length: n }, () => ({ id: 'a:b', level: 1 }));
    // 32 зачарования не помещаются в бюджет 600 байт на предмет: проверяем
    // 20 коротких, а лимит количества (33) и бюджет размера отклоняются.
    expect(ok({ enchants: e(20) }).enchants).toHaveLength(20);
    bad({ enchants: e(32) });
    bad({ enchants: e(33) });
    bad({ enchants: [{ id: 'minecraft:mending', level: 0 }] });
    bad({ enchants: [{ id: 'minecraft:mending', level: 256 }] });
    bad({ enchants: [{ id: 'mending', level: 1 }] });
    bad({ enchants: [{ id: 'minecraft:mending', level: 1, extra: 1 }] });
    bad({ storedEnchants: e(33) });
  });

  it('itemsAdderId, potion: формат', () => {
    expect(ok({ itemsAdderId: 'twomc:ruby_sword' }).itemsAdderId).toBe(
      'twomc:ruby_sword',
    );
    bad({ itemsAdderId: 'ruby sword' });
    bad({ itemsAdderId: `a:${'b'.repeat(100)}` });
    bad({ potion: 'strong healing' });
    bad({ unbreakable: 'true' });
  });

  it('текст: лимиты числа прогонов и строк, не-массив, не-объект', () => {
    const run = (text: string) => ({ text });
    expect(
      ok({ name: Array.from({ length: 16 }, () => run('a')) }).name,
    ).toHaveLength(16);
    bad({ name: Array.from({ length: 17 }, () => run('a')) });
    bad({ name: 'строка' });
    bad({ name: [{ text: 5 }] });
    bad({ name: ['x'] });
    bad({ lore: Array.from({ length: 21 }, () => [run('a')]) });
    bad({ lore: [Array.from({ length: 17 }, () => run('a'))] });
    bad({ lore: ['строка'] });
  });

  it('суммарный текст больше 2000 символов — отказ', () => {
    const line = [{ text: 'я'.repeat(256) }];
    bad({ lore: Array.from({ length: 9 }, () => line) });
  });

  it('очистка применяется внутри предмета', () => {
    const parsed = ok({
      name: [
        {
          text: `${SECTION}cКрасный`,
          color: 'javascript:alert(1)',
          clickEvent: { action: 'run_command', value: '/op x' },
        },
      ],
    });
    expect(parsed.name).toEqual([{ text: 'Красный' }]);
  });

  it('Q35: лор сверх 600 байт обрезается с конца с флагом loreTruncated', () => {
    const lore = Array.from({ length: 8 }, (_v, i) => [
      { text: `Строка ${i} `.padEnd(60, 'я') },
    ]);
    const parsed = ok({ lore });
    expect(parsed.loreTruncated).toBe(true);
    expect(parsed.lore!.length).toBeGreaterThan(0);
    expect(parsed.lore!.length).toBeLessThan(8);
    expect(
      Buffer.byteLength(JSON.stringify(parsed), 'utf8'),
    ).toBeLessThanOrEqual(600);
    // Начало лора сохраняется.
    expect(parsed.lore![0][0].text.startsWith('Строка 0')).toBe(true);
  });

  it('Q35: предмет, не влезающий в 600 байт и без лора, — отказ', () => {
    const name = Array.from({ length: 16 }, () => ({ text: 'я'.repeat(30) }));
    rejects(() =>
      parseItem(
        item('minecraft:stone', {
          name,
          enchants: Array.from({ length: 32 }, () => ({
            id: 'minecraft:fire_protection',
            level: 5,
          })),
        }),
        'item',
      ),
    );
  });

  it('граница 600/601 байт: ровно 600 принимается, 601 — отказ', () => {
    const build = (k: number) =>
      item('minecraft:stone', {
        name: [
          { text: 'a'.repeat(200) },
          { text: 'a'.repeat(200) },
          { text: 'a'.repeat(k) },
        ],
      });
    const size = (k: number) => jsonBytes(parseItem(build(k), 'item'));
    let k = 0;
    while (k < 256 && size(k) < 600) k += 1;
    expect(size(k)).toBe(600);
    expect(parseItem(build(k), 'item')).toBeDefined();
    rejects(() => parseItem(build(k + 1), 'item'));
  });

  it('граница ряда: ровно 32768 байт принимается, 32769 — отказ', () => {
    const make = (n: number) =>
      [
        {
          area: 'hotbar',
          slot: 0,
          item: { id: 'minecraft:stone', name: [{ text: 'a'.repeat(n) }] },
        },
      ] as unknown as NormalizedSlot[];
    const n = 32768 - jsonBytes(make(0));
    expect(jsonBytes(make(n))).toBe(32768);
    expect(() => assertRowSize(make(n))).not.toThrow();
    rejects(() => assertRowSize(make(n + 1)));
  });

  it('хвостовые пустые строки лора отбрасываются, внутренние сохраняются', () => {
    const parsed = ok({ lore: [[{ text: 'a' }], [], [{ text: 'b' }], []] });
    expect(parsed.lore).toEqual([[{ text: 'a' }], [], [{ text: 'b' }]]);
  });
});

describe('parseDelta', () => {
  it('принимает валидную дельту', () => {
    const parsed = parseDelta(delta(), T0);
    expect(parsed.baseRev).toBe(1);
    expect(parsed.rev).toBe(2);
    expect(parsed.changes).toEqual([{ area: 'hotbar', slot: 0, item: null }]);
  });

  it.each([
    ['rev не baseRev+1', delta({ rev: 5 })],
    ['нет baseRev', delta({ baseRev: undefined })],
    ['лишнее поле', delta({ slots: [] })],
    ['schemaVersion 2', delta({ schemaVersion: 2 })],
    ['changes не массив', delta({ changes: null })],
    ['нет item', delta({ changes: [{ area: 'hotbar', slot: 0 }] })],
    [
      'повтор слота',
      delta({
        changes: [
          { area: 'hotbar', slot: 0, item: null },
          { area: 'hotbar', slot: 0, item: item() },
        ],
      }),
    ],
    [
      'область не группы',
      delta({ changes: [{ area: 'ender', slot: 0, item: null }] }),
    ],
    [
      'предмет невалиден',
      delta({
        changes: [{ area: 'hotbar', slot: 0, item: { id: 'x', count: 1 } }],
      }),
    ],
  ])('отклоняет: %s', (_name, data) => {
    rejects(() => parseDelta(data, T0));
  });

  it('42 изменения main — отказ', () => {
    const changes = Array.from({ length: 42 }, (_v, i) => ({
      area: i < 9 ? 'hotbar' : 'main',
      slot: i < 9 ? i : i - 9,
      item: null,
    }));
    rejects(() => parseDelta(delta({ changes }), T0));
  });
});

describe('applyChanges, хэш и канонизация', () => {
  const base = parseSnapshot(
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
    T0,
  ).slots;

  it('удаляет, заменяет и добавляет слоты', () => {
    const next = applyChanges(base, [
      { area: 'hotbar', slot: 0, item: null },
      {
        area: 'hotbar',
        slot: 1,
        item: parseItem(item('minecraft:bread', { count: 9 }), 'item'),
      },
      {
        area: 'armor',
        slot: 3,
        item: parseItem(item('minecraft:iron_boots'), 'item'),
      },
    ]);
    expect(next.map((s) => `${s.area}:${s.slot}:${s.item.count}`)).toEqual([
      'hotbar:1:9',
      'armor:3:1',
    ]);
    // Исходный массив не изменён.
    expect(base).toHaveLength(2);
  });

  it('канонический JSON не зависит от порядка ключей', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      canonicalJson({ a: { c: 3, d: 2 }, b: 1 }),
    );
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
  });

  it('перестановка полей и слотов даёт тот же хэш', () => {
    const a = parseSnapshot(
      snapshot({
        slots: [
          {
            area: 'hotbar',
            slot: 0,
            item: { count: 1, id: 'minecraft:stone' },
          },
          { area: 'hotbar', slot: 1, item: { id: 'minecraft:dirt', count: 2 } },
        ],
      }),
      T0,
    );
    const b = parseSnapshot(
      snapshot({
        slots: [
          { item: { id: 'minecraft:dirt', count: 2 }, slot: 1, area: 'hotbar' },
          {
            item: { id: 'minecraft:stone', count: 1 },
            slot: 0,
            area: 'hotbar',
          },
        ],
      }),
      T0,
    );
    expect(hashSlots(a.slots)).toBe(hashSlots(b.slots));
    expect(hashSlots(a.slots)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('значения по умолчанию (null, [], false) не меняют хэш', () => {
    const a = parseSnapshot(snapshot(), T0);
    const b = parseSnapshot(
      snapshot({
        slots: [
          {
            area: 'hotbar',
            slot: 0,
            item: item('minecraft:diamond_sword', {
              damage: null,
              enchants: [],
              name: [],
              lore: [],
              unbreakable: false,
            }),
          },
        ],
      }),
      T0,
    );
    expect(hashSlots(a.slots)).toBe(hashSlots(b.slots));
  });

  it('разное содержимое — разный хэш', () => {
    const a = parseSnapshot(snapshot(), T0);
    const b = parseSnapshot(
      snapshot({
        slots: [
          {
            area: 'hotbar',
            slot: 0,
            item: item('minecraft:diamond_sword', { count: 2 }),
          },
        ],
      }),
      T0,
    );
    expect(hashSlots(a.slots)).not.toBe(hashSlots(b.slots));
  });
});

describe('reparseStoredSlots (двойной контур)', () => {
  it('повторно очищает текст и отбрасывает невалидные слоты, не падая', () => {
    const stored = [
      {
        area: 'hotbar',
        slot: 0,
        item: {
          id: 'minecraft:stone',
          count: 1,
          name: [{ text: `${SECTION}aЗелёный`, clickEvent: { action: 'x' } }],
        },
      },
      { area: 'hotbar', slot: 1, item: { id: 'BAD', count: 1 } },
      { area: 'nowhere', slot: 0, item: { id: 'minecraft:stone', count: 1 } },
      { area: 'hotbar', slot: 99, item: { id: 'minecraft:stone', count: 1 } },
      { area: 'hotbar', slot: 0, item: { id: 'minecraft:dirt', count: 1 } },
      null,
      'строка',
    ];
    const slots = reparseStoredSlots(stored);
    expect(slots).toHaveLength(1);
    expect(slots[0].item.name).toEqual([{ text: 'Зелёный' }]);
  });

  it('не массив — пустой результат', () => {
    expect(reparseStoredSlots(null)).toEqual([]);
    expect(reparseStoredSlots({})).toEqual([]);
  });

  it('сохраняет loreTruncated из хранилища', () => {
    const slots = reparseStoredSlots([
      {
        area: 'hotbar',
        slot: 0,
        item: { id: 'minecraft:stone', count: 1, loreTruncated: true },
      },
    ]);
    expect(slots[0].item.loreTruncated).toBe(true);
  });
});
