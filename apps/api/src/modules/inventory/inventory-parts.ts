import { createHash } from 'crypto';
import type { InventoryGroup } from './inventory-contract';
import { GROUP_AREAS, GROUP_SLOT_LIMIT, AREA_SIZE } from './inventory-limits';
import type { AssemblyConfig } from './inventory-assembly.config';
import {
  asArray,
  asBool,
  asInt,
  asObject,
  assertKeys,
  assertRowSize,
  canonicalJson,
  fail,
  jsonBytes,
  parseArea,
  parseCapturedAt,
  parseEpoch,
  parseGroup,
  parseItem,
  parseSlotIndex,
  parseUuid,
  sortSlots,
} from './inventory-normalize';
import {
  EpochOutOfRangeError,
  type NormalizedSlot,
  type NormalizedSnapshot,
} from './inventory.types';

/// Части снимка (ADR-0168, раздел 3.6; `BRIDGE-CONTRACT.md`, 6.1) и проверки
/// шага П0: выполняются ДО обращения к Redis и БД.

export type SlotGroup =
  | 'hotbar'
  | 'storage_a'
  | 'storage_b'
  | 'equipment'
  | 'ender_a'
  | 'ender_b'
  | 'all';

const MAX_INT32 = 2_147_483_647;
export const SNAPSHOT_ID_RE = /^[0-9A-Za-z-]{26,64}$/;

/// Закрытый перечень раскладок `(group, parts)` → набор `slotGroup`.
const LAYOUTS: Record<string, readonly SlotGroup[]> = {
  'main:4': ['hotbar', 'storage_a', 'storage_b', 'equipment'],
  'main:1': ['all'],
  'ender:2': ['ender_a', 'ender_b'],
  'ender:1': ['all'],
};

/// Набор `slotGroup` раскладки или `undefined`, если сочетание не допускается.
export function expectedSlotGroups(
  group: InventoryGroup,
  parts: number,
): readonly SlotGroup[] | undefined {
  return LAYOUTS[`${group}:${parts}`];
}

interface Range {
  area: string;
  from: number;
  to: number;
}

const RANGES: Record<Exclude<SlotGroup, 'all'>, readonly Range[]> = {
  hotbar: [{ area: 'hotbar', from: 0, to: 8 }],
  storage_a: [{ area: 'main', from: 0, to: 13 }],
  storage_b: [{ area: 'main', from: 14, to: 26 }],
  equipment: [
    { area: 'armor', from: 0, to: 3 },
    { area: 'offhand', from: 0, to: 0 },
  ],
  ender_a: [{ area: 'ender', from: 0, to: 13 }],
  ender_b: [{ area: 'ender', from: 14, to: 26 }],
};

/// Слот лежит в диапазоне своей `slotGroup` (для `all` — весь контейнер).
export function slotInGroup(
  slotGroup: SlotGroup,
  group: InventoryGroup,
  area: string,
  slot: number,
): boolean {
  if (slotGroup === 'all') {
    return (
      (GROUP_AREAS[group] as readonly string[]).includes(area) &&
      slot >= 0 &&
      slot < AREA_SIZE[area as keyof typeof AREA_SIZE]
    );
  }
  return RANGES[slotGroup].some(
    (r) => r.area === area && slot >= r.from && slot <= r.to,
  );
}

/// Допустимость `slotGroup` для `(group, parts)`.
export function isSlotGroupAllowed(
  group: InventoryGroup,
  parts: number,
  slotGroup: unknown,
): slotGroup is SlotGroup {
  const set = expectedSlotGroups(group, parts);
  return set !== undefined && (set as readonly unknown[]).includes(slotGroup);
}

export { EpochOutOfRangeError };

/// Часть снимка после проверки схемы (шаг П0) и очистки.
export interface NormalizedPart {
  snapshotId: string;
  part: number;
  parts: number;
  slotGroup: SlotGroup;
  uuid: string;
  group: InventoryGroup;
  epoch: string;
  rev: number;
  capturedAt: Date;
  playerOnline: boolean;
  slots: NormalizedSlot[];
  /// Канонический JSON слотов части (кладётся в буфер).
  slotsJson: string;
  /// SHA-256 слотов части: повтор с тем же хэшем — `duplicate`.
  hash: string;
  /// Размер полезной нагрузки части, байт.
  bytes: number;
}

const PART_KEYS = [
  'uuid',
  'group',
  'epoch',
  'rev',
  'capturedAt',
  'playerOnline',
  'schemaVersion',
  'slots',
  'snapshotId',
  'part',
  'parts',
  'slotGroup',
] as const;

/// Шаг П0 для части `inventory.snapshot`: схема, границы `epoch` и `rev`,
/// `snapshotId`, закрытый перечень раскладок, диапазоны слотов, размер части.
/// Ошибка — `InventoryValidationError` (`invalid_data`) или
/// `EpochOutOfRangeError` (`epoch_out_of_range`); Redis не вызывается.
export function parseSnapshotPart(
  raw: unknown,
  now: Date,
  config: AssemblyConfig,
): NormalizedPart {
  const obj = asObject(raw, 'part');
  if (jsonBytes(obj) > config.maxPartBytes) {
    fail(`part: больше ${config.maxPartBytes} байт`);
  }
  assertKeys(obj, PART_KEYS, 'part');
  if (obj.schemaVersion !== 1) fail('schemaVersion: поддерживается только 1');

  if (
    typeof obj.snapshotId !== 'string' ||
    !SNAPSHOT_ID_RE.test(obj.snapshotId)
  ) {
    fail('snapshotId: недопустимый формат');
  }
  const group = parseGroup(obj.group);
  const parts = asInt(obj.parts, 'parts', 1, 4);
  const set = expectedSlotGroups(group, parts);
  if (!set) fail('parts: сочетание с group не входит в перечень раскладок');
  if (!isSlotGroupAllowed(group, parts, obj.slotGroup)) {
    fail('slotGroup: недопустима для group и parts');
  }
  const slotGroup = obj.slotGroup;
  const part = asInt(obj.part, 'part', 1, parts);

  const list = asArray(obj.slots, 'slots', GROUP_SLOT_LIMIT[group]);
  const seen = new Set<string>();
  const slots: NormalizedSlot[] = list.map((entry, i) => {
    const path = `slots[${i}]`;
    const slotObj = asObject(entry, path);
    assertKeys(slotObj, ['area', 'slot', 'item'], path);
    const area = parseArea(slotObj.area, group, path);
    const slot = parseSlotIndex(slotObj.slot, area, path);
    if (!slotInGroup(slotGroup, group, area, slot)) {
      fail(`${path}: слот вне диапазона slotGroup`);
    }
    const key = `${area}:${slot}`;
    if (seen.has(key)) fail(`${path}: повтор слота`);
    seen.add(key);
    return { area, slot, item: parseItem(slotObj.item, `${path}.item`) };
  });

  const epoch = parseEpoch(obj.epoch, now, config.epochMaxAheadMs);
  const sorted = sortSlots(slots);
  const slotsJson = canonicalJson(sorted);
  return {
    snapshotId: obj.snapshotId,
    part,
    parts,
    slotGroup,
    uuid: parseUuid(obj.uuid),
    group,
    epoch,
    rev: asInt(obj.rev, 'rev', 1, MAX_INT32),
    capturedAt: parseCapturedAt(obj.capturedAt, now),
    playerOnline: asBool(obj.playerOnline, 'playerOnline'),
    slots: sorted,
    slotsJson,
    hash: createHash('sha256').update(slotsJson).digest('hex'),
    bytes: Buffer.byteLength(slotsJson, 'utf8'),
  };
}

/// Часть из буфера: номер, `slotGroup` и JSON слотов.
export interface BufferedPart {
  part: number;
  slotGroup: string;
  slotsJson: string;
}

/// Заголовки комплекта (одинаковы во всех частях).
export interface AssemblyHeader {
  uuid: string;
  group: InventoryGroup;
  parts: number;
  epoch: string;
  rev: number;
  capturedAt: Date;
  playerOnline: boolean;
}

function parseBufferedSlots(
  part: BufferedPart,
  group: InventoryGroup,
): NormalizedSlot[] {
  let value: unknown;
  try {
    value = JSON.parse(part.slotsJson);
  } catch {
    return fail('буфер: повреждённый JSON части');
  }
  const list = asArray(value, 'slots', GROUP_SLOT_LIMIT[group]);
  return list.map((entry, i) => {
    const path = `slots[${i}]`;
    const slotObj = asObject(entry, path);
    assertKeys(slotObj, ['area', 'slot', 'item'], path);
    const area = parseArea(slotObj.area, group, path);
    const slot = parseSlotIndex(slotObj.slot, area, path);
    if (!slotInGroup(part.slotGroup as SlotGroup, group, area, slot)) {
      fail(`${path}: слот вне диапазона slotGroup`);
    }
    return { area, slot, item: parseItem(slotObj.item, `${path}.item`, true) };
  });
}

/// Объединение полного комплекта (шаг П5): присутствуют все номера
/// `1..parts`, набор `slotGroup` равен набору раскладки, слоты не
/// пересекаются и лежат в своих диапазонах, всего не больше 41/27, ряд не
/// больше 32 КБ. Собранный снимок проходит ту же схему, что одиночный.
export function assembleSnapshot(
  header: AssemblyHeader,
  parts: readonly BufferedPart[],
): NormalizedSnapshot {
  const expected = expectedSlotGroups(header.group, header.parts);
  if (!expected)
    fail('parts: сочетание с group не входит в перечень раскладок');
  if (parts.length !== header.parts) fail('комплект неполон');
  const numbers = new Set(parts.map((p) => p.part));
  for (let n = 1; n <= header.parts; n += 1) {
    if (!numbers.has(n)) fail(`комплект: нет части ${n}`);
  }
  const groups = parts.map((p) => p.slotGroup).sort();
  const wanted = [...expected].sort();
  if (
    groups.length !== wanted.length ||
    groups.some((g, i) => g !== wanted[i])
  ) {
    fail('комплект: набор slotGroup не равен набору раскладки');
  }
  const seen = new Set<string>();
  const slots: NormalizedSlot[] = [];
  for (const part of [...parts].sort((a, b) => a.part - b.part)) {
    for (const slot of parseBufferedSlots(part, header.group)) {
      const key = `${slot.area}:${slot.slot}`;
      if (seen.has(key)) fail('комплект: слот встречается в двух частях');
      seen.add(key);
      slots.push(slot);
    }
  }
  if (slots.length > GROUP_SLOT_LIMIT[header.group]) {
    fail('комплект: слотов больше предела группы');
  }
  const sorted = sortSlots(slots);
  assertRowSize(sorted);
  return {
    uuid: header.uuid,
    group: header.group,
    epoch: header.epoch,
    rev: header.rev,
    capturedAt: header.capturedAt,
    playerOnline: header.playerOnline,
    slots: sorted,
  };
}
