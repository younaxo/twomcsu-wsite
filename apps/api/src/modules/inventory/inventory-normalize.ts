import { createHash } from 'crypto';
import type { InventoryArea, InventoryGroup } from './inventory-contract';
import {
  AREA_ORDER,
  EPOCH_MAX_AHEAD_MS,
  AREA_SIZE,
  GROUP_AREAS,
  GROUP_SLOT_LIMIT,
  MAX_ENCHANTS,
  MAX_EVENT_AGE_MS,
  MAX_EVENT_FUTURE_MS,
  MAX_ITEM_BYTES,
  MAX_ITEM_TEXT_CHARS,
  MAX_LORE_LINES,
  MAX_LORE_RUNS,
  MAX_NAME_RUNS,
  MAX_ROW_BYTES,
  NAMESPACED_ID,
  SCHEMA_VERSION,
} from './inventory-limits';
import { sanitizeRun } from './inventory-text';
import {
  EpochOutOfRangeError,
  InventoryValidationError,
  type NormalizedDelta,
  type NormalizedEnchant,
  type NormalizedItem,
  type NormalizedSlot,
  type NormalizedSlotChange,
  type NormalizedSnapshot,
  type NormalizedTextRun,
} from './inventory.types';

/// Строгая проверка схемы `inventory.snapshot` / `inventory.delta`
/// (ADR-0168, разделы 3.2-3.4) и нормализация. Лишние поля конверта, слота
/// и предмета — `invalid_data` (additionalProperties: false). Исключение:
/// внутри «прогона» текста неизвестные поля отбрасываются (раздел 3.3).
/// Причины в ошибках содержат только пути полей, не содержимое.

type Obj = Record<string, unknown>;

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|\+00:00)$/;
const MAX_INT32 = 2_147_483_647;

export function fail(reason: string): never {
  throw new InventoryValidationError(reason);
}

export function asObject(value: unknown, path: string): Obj {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${path}: ожидался объект`);
  }
  return value as Obj;
}

export function asArray(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value)) fail(`${path}: ожидался массив`);
  if (value.length > max) fail(`${path}: больше ${max} элементов`);
  return value;
}

export function assertKeys(
  obj: Obj,
  allowed: readonly string[],
  path: string,
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      fail(`${path}: неизвестное поле ${key.slice(0, 32)}`);
    }
  }
}

export function asInt(
  value: unknown,
  path: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    fail(`${path}: целое ${min}-${max}`);
  }
  return value;
}

function asNullableInt(
  value: unknown,
  path: string,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined || value === null) return undefined;
  return asInt(value, path, min, max);
}

function asNamespaced(value: unknown, path: string, maxLen: number): string {
  if (
    typeof value !== 'string' ||
    value.length > maxLen ||
    !NAMESPACED_ID.test(value)
  ) {
    fail(`${path}: недопустимый идентификатор`);
  }
  return value;
}

export function asBool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(`${path}: ожидался boolean`);
  return value;
}

function parseEnchants(
  value: unknown,
  path: string,
): NormalizedEnchant[] | undefined {
  if (value === undefined || value === null) return undefined;
  const list = asArray(value, path, MAX_ENCHANTS);
  if (list.length === 0) return undefined;
  return list.map((entry, i) => {
    const obj = asObject(entry, `${path}[${i}]`);
    assertKeys(obj, ['id', 'level'], `${path}[${i}]`);
    return {
      id: asNamespaced(obj.id, `${path}[${i}].id`, 64),
      level: asInt(obj.level, `${path}[${i}].level`, 1, 255),
    };
  });
}

function parseRuns(
  value: unknown,
  path: string,
  max: number,
): NormalizedTextRun[] {
  const list = asArray(value, path, max);
  const runs: NormalizedTextRun[] = [];
  list.forEach((entry, i) => {
    const obj = asObject(entry, `${path}[${i}]`);
    if (typeof obj.text !== 'string') {
      fail(`${path}[${i}].text: ожидалась строка`);
    }
    const run = sanitizeRun(obj);
    if (run) runs.push(run);
  });
  return runs;
}

function runChars(runs: readonly NormalizedTextRun[]): number {
  let total = 0;
  for (const run of runs) total += Array.from(run.text).length;
  return total;
}

export function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

const ITEM_KEYS = [
  'id',
  'count',
  'damage',
  'maxDamage',
  'enchants',
  'storedEnchants',
  'name',
  'lore',
  'customModelData',
  'itemsAdderId',
  'unbreakable',
  'dyeColor',
  'potion',
  'containerItemCount',
] as const;

/// Предмет по схеме 3.2 → компактная нормализованная форма. Лимит размера
/// (Q35 а): лор отбрасывается с конца, пока предмет не уложится в
/// `MAX_ITEM_BYTES`; если без лора всё равно больше — `invalid_data`.
export function parseItem(
  value: unknown,
  path: string,
  fromStore = false,
): NormalizedItem {
  const obj = asObject(value, path);
  assertKeys(
    obj,
    fromStore ? [...ITEM_KEYS, 'loreTruncated'] : ITEM_KEYS,
    path,
  );

  const item: NormalizedItem = {
    id: asNamespaced(obj.id, `${path}.id`, 64),
    count: asInt(obj.count, `${path}.count`, 1, 99),
  };

  const damage = asNullableInt(obj.damage, `${path}.damage`, 0, 100_000);
  if (damage !== undefined) item.damage = damage;
  const maxDamage = asNullableInt(
    obj.maxDamage,
    `${path}.maxDamage`,
    0,
    100_000,
  );
  if (maxDamage !== undefined) item.maxDamage = maxDamage;

  const enchants = parseEnchants(obj.enchants, `${path}.enchants`);
  if (enchants) item.enchants = enchants;
  const stored = parseEnchants(obj.storedEnchants, `${path}.storedEnchants`);
  if (stored) item.storedEnchants = stored;

  let textChars = 0;
  if (obj.name !== undefined && obj.name !== null) {
    const name = parseRuns(obj.name, `${path}.name`, MAX_NAME_RUNS);
    textChars += runChars(name);
    if (name.length > 0) item.name = name;
  }
  let lore: NormalizedTextRun[][] = [];
  const wasTruncated = fromStore && obj.loreTruncated === true;
  if (obj.lore !== undefined && obj.lore !== null) {
    const lines = asArray(obj.lore, `${path}.lore`, MAX_LORE_LINES);
    lore = lines.map((line, i) =>
      parseRuns(line, `${path}.lore[${i}]`, MAX_LORE_RUNS),
    );
    for (const line of lore) textChars += runChars(line);
  }
  if (textChars > MAX_ITEM_TEXT_CHARS) {
    fail(`${path}: текст длиннее ${MAX_ITEM_TEXT_CHARS} символов`);
  }

  const cmd = asNullableInt(
    obj.customModelData,
    `${path}.customModelData`,
    0,
    MAX_INT32,
  );
  if (cmd !== undefined) item.customModelData = cmd;
  if (obj.itemsAdderId !== undefined && obj.itemsAdderId !== null) {
    item.itemsAdderId = asNamespaced(
      obj.itemsAdderId,
      `${path}.itemsAdderId`,
      96,
    );
  }
  if (obj.unbreakable !== undefined && obj.unbreakable !== null) {
    if (asBool(obj.unbreakable, `${path}.unbreakable`)) {
      item.unbreakable = true;
    }
  }
  const dye = asNullableInt(obj.dyeColor, `${path}.dyeColor`, 0, 16_777_215);
  if (dye !== undefined) item.dyeColor = dye;
  if (obj.potion !== undefined && obj.potion !== null) {
    item.potion = asNamespaced(obj.potion, `${path}.potion`, 64);
  }
  const container = asNullableInt(
    obj.containerItemCount,
    `${path}.containerItemCount`,
    0,
    64,
  );
  if (container !== undefined) item.containerItemCount = container;

  // Хвостовые пустые строки лора не несут смысла; затем лор укладывается в
  // бюджет размера отбрасыванием строк с конца.
  while (lore.length > 0 && lore[lore.length - 1].length === 0) lore.pop();
  if (wasTruncated) item.loreTruncated = true;
  if (lore.length > 0) {
    item.lore = lore;
    while (jsonBytes(item) > MAX_ITEM_BYTES && lore.length > 0) {
      lore.pop();
      item.loreTruncated = true;
    }
    if (lore.length === 0) delete item.lore;
  }
  if (jsonBytes(item) > MAX_ITEM_BYTES) {
    fail(`${path}: предмет больше ${MAX_ITEM_BYTES} байт`);
  }
  return item;
}

export function parseArea(
  value: unknown,
  group: InventoryGroup,
  path: string,
): InventoryArea {
  if (
    typeof value !== 'string' ||
    !(GROUP_AREAS[group] as readonly string[]).includes(value)
  ) {
    fail(`${path}.area: недопустимая область для группы`);
  }
  return value as InventoryArea;
}

export function parseSlotIndex(
  value: unknown,
  area: InventoryArea,
  path: string,
): number {
  return asInt(value, `${path}.slot`, 0, AREA_SIZE[area] - 1);
}

export function parseGroup(value: unknown): InventoryGroup {
  if (value !== 'main' && value !== 'ender') fail('group: main или ender');
  return value;
}

export function parseUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    fail('uuid: недопустимый UUID');
  }
  return value.toLowerCase();
}

/// `epoch` растёт при каждом перезапуске плагина (раздел 3.5 дизайна).
/// Допустим ТОЛЬКО JSON number: безопасное целое (время старта в мс) от 1 до
/// `now + maxAheadMs`. Строки (в том числе из цифр и ULID-подобные),
/// дробные и нечисловые значения — `invalid_data`; число выше границы —
/// `EpochOutOfRangeError`. Результат — десятичная строка для хранения;
/// порядок задаёт `compareEpoch`.
export function parseEpoch(
  value: unknown,
  now: Date,
  maxAheadMs: number = EPOCH_MAX_AHEAD_MS,
): string {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    fail('epoch: целое число от 1');
  }
  if (value > now.getTime() + maxAheadMs) throw new EpochOutOfRangeError();
  return String(value);
}

export function parseCapturedAt(value: unknown, now: Date): Date {
  if (typeof value !== 'string' || !ISO_UTC.test(value)) {
    fail('capturedAt: ISO 8601 UTC');
  }
  const date = new Date(value);
  const ms = date.getTime();
  if (Number.isNaN(ms)) fail('capturedAt: недопустимая дата');
  if (
    ms < now.getTime() - MAX_EVENT_AGE_MS ||
    ms > now.getTime() + MAX_EVENT_FUTURE_MS
  ) {
    fail('capturedAt: вне допустимого окна времени');
  }
  return date;
}

export function sortSlots<T extends { area: InventoryArea; slot: number }>(
  slots: T[],
): T[] {
  return slots.sort(
    (a, b) =>
      AREA_ORDER.indexOf(a.area) - AREA_ORDER.indexOf(b.area) ||
      a.slot - b.slot,
  );
}

const SNAPSHOT_KEYS = [
  'uuid',
  'group',
  'epoch',
  'rev',
  'capturedAt',
  'playerOnline',
  'schemaVersion',
  'slots',
] as const;

const DELTA_KEYS = [
  'uuid',
  'group',
  'epoch',
  'baseRev',
  'rev',
  'capturedAt',
  'playerOnline',
  'schemaVersion',
  'changes',
] as const;

function checkSchemaVersion(value: unknown, required: boolean): void {
  if (value === undefined && !required) return;
  if (value !== SCHEMA_VERSION) {
    fail(`schemaVersion: поддерживается только ${SCHEMA_VERSION}`);
  }
}

export function parseSnapshot(raw: unknown, now: Date): NormalizedSnapshot {
  const obj = asObject(raw, 'snapshot');
  assertKeys(obj, SNAPSHOT_KEYS, 'snapshot');
  checkSchemaVersion(obj.schemaVersion, true);
  const group = parseGroup(obj.group);
  const list = asArray(obj.slots, 'slots', GROUP_SLOT_LIMIT[group]);
  const seen = new Set<string>();
  const slots: NormalizedSlot[] = list.map((entry, i) => {
    const path = `slots[${i}]`;
    const slotObj = asObject(entry, path);
    assertKeys(slotObj, ['area', 'slot', 'item'], path);
    const area = parseArea(slotObj.area, group, path);
    const slot = parseSlotIndex(slotObj.slot, area, path);
    const key = `${area}:${slot}`;
    if (seen.has(key)) fail(`${path}: повтор слота`);
    seen.add(key);
    return { area, slot, item: parseItem(slotObj.item, `${path}.item`) };
  });
  const snapshot: NormalizedSnapshot = {
    uuid: parseUuid(obj.uuid),
    group,
    epoch: parseEpoch(obj.epoch, now),
    rev: asInt(obj.rev, 'rev', 1, MAX_INT32),
    capturedAt: parseCapturedAt(obj.capturedAt, now),
    playerOnline: asBool(obj.playerOnline, 'playerOnline'),
    slots: sortSlots(slots),
  };
  assertRowSize(snapshot.slots);
  return snapshot;
}

export function parseDelta(raw: unknown, now: Date): NormalizedDelta {
  const obj = asObject(raw, 'delta');
  assertKeys(obj, DELTA_KEYS, 'delta');
  checkSchemaVersion(obj.schemaVersion, false);
  const group = parseGroup(obj.group);
  const list = asArray(obj.changes, 'changes', GROUP_SLOT_LIMIT[group]);
  const seen = new Set<string>();
  const changes: NormalizedSlotChange[] = list.map((entry, i) => {
    const path = `changes[${i}]`;
    const change = asObject(entry, path);
    assertKeys(change, ['area', 'slot', 'item'], path);
    const area = parseArea(change.area, group, path);
    const slot = parseSlotIndex(change.slot, area, path);
    const key = `${area}:${slot}`;
    if (seen.has(key)) fail(`${path}: повтор слота`);
    seen.add(key);
    if (change.item === undefined) fail(`${path}.item: нужен предмет или null`);
    return {
      area,
      slot,
      item:
        change.item === null ? null : parseItem(change.item, `${path}.item`),
    };
  });
  const baseRev = asInt(obj.baseRev, 'baseRev', 1, MAX_INT32);
  const rev = asInt(obj.rev, 'rev', 1, MAX_INT32);
  if (rev !== baseRev + 1) fail('rev: должна быть baseRev + 1');
  return {
    uuid: parseUuid(obj.uuid),
    group,
    epoch: parseEpoch(obj.epoch, now),
    baseRev,
    rev,
    capturedAt: parseCapturedAt(obj.capturedAt, now),
    playerOnline: asBool(obj.playerOnline, 'playerOnline'),
    changes: sortSlots(changes),
  };
}

/// Суммарный размер JSON слотов ряда не больше `MAX_ROW_BYTES` (раздел 7.3).
export function assertRowSize(slots: readonly NormalizedSlot[]): void {
  if (jsonBytes(slots) > MAX_ROW_BYTES) {
    fail(`slots: ряд больше ${MAX_ROW_BYTES} байт`);
  }
}

/// Применение дельты к сохранённым слотам; результат отсортирован.
export function applyChanges(
  current: readonly NormalizedSlot[],
  changes: readonly NormalizedSlotChange[],
): NormalizedSlot[] {
  const map = new Map<string, NormalizedSlot>();
  for (const slot of current) map.set(`${slot.area}:${slot.slot}`, slot);
  for (const change of changes) {
    const key = `${change.area}:${change.slot}`;
    if (change.item === null) map.delete(key);
    else
      map.set(key, { area: change.area, slot: change.slot, item: change.item });
  }
  return sortSlots([...map.values()]);
}

/// Канонический JSON: ключи объектов отсортированы рекурсивно.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Obj;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

export function hashSlots(slots: readonly NormalizedSlot[]): string {
  return createHash('sha256').update(canonicalJson(slots)).digest('hex');
}

/// Слоты из БД (Json) → нормализованные; повторная очистка при выдаче и перед
/// применением дельты (раздел 7.1, двойной контур). Невалидный слот
/// пропускается, а не роняет ответ.
export function reparseStoredSlots(stored: unknown): NormalizedSlot[] {
  if (!Array.isArray(stored)) return [];
  const result: NormalizedSlot[] = [];
  const seen = new Set<string>();
  for (const entry of stored) {
    try {
      const obj = asObject(entry, 'slot');
      const area = obj.area;
      if (
        typeof area !== 'string' ||
        !(AREA_ORDER as readonly string[]).includes(area)
      ) {
        continue;
      }
      const typedArea = area as InventoryArea;
      const slot = parseSlotIndex(obj.slot, typedArea, 'slot');
      const key = `${typedArea}:${slot}`;
      if (seen.has(key)) continue;
      const item = parseItem(obj.item, 'item', true);
      seen.add(key);
      result.push({ area: typedArea, slot, item });
    } catch (error) {
      if (!(error instanceof InventoryValidationError)) throw error;
    }
  }
  return sortSlots(result);
}
