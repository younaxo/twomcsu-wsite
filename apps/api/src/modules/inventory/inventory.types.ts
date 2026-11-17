import type { InventoryArea, InventoryGroup } from './inventory-contract';

/// Нормализованная модель снимка инвентаря (ADR-0168, раздел 3; ADR-0179).
/// Не зависит от источника: сегодня вход подаётся из тестов, позже — из
/// приёмника Bridge (этап 03). Сырой NBT в модель не входит.

/// «Прогон» текста после очистки.
export interface NormalizedTextRun {
  text: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  strikethrough?: boolean;
  obfuscated?: boolean;
}

export interface NormalizedEnchant {
  id: string;
  level: number;
}

/// Компактная форма: значения по умолчанию (null, [], false) не хранятся.
export interface NormalizedItem {
  id: string;
  count: number;
  damage?: number;
  maxDamage?: number;
  enchants?: NormalizedEnchant[];
  storedEnchants?: NormalizedEnchant[];
  name?: NormalizedTextRun[];
  lore?: NormalizedTextRun[][];
  loreTruncated?: true;
  customModelData?: number;
  itemsAdderId?: string;
  unbreakable?: true;
  dyeColor?: number;
  potion?: string;
  containerItemCount?: number;
}

export interface NormalizedSlot {
  area: InventoryArea;
  slot: number;
  item: NormalizedItem;
}

/// Вход `inventory.snapshot` после проверки схемы и очистки.
export interface NormalizedSnapshot {
  uuid: string;
  group: InventoryGroup;
  epoch: string;
  rev: number;
  capturedAt: Date;
  playerOnline: boolean;
  slots: NormalizedSlot[];
}

export interface NormalizedSlotChange {
  area: InventoryArea;
  slot: number;
  /// null — слот опустел.
  item: NormalizedItem | null;
}

/// Вход `inventory.delta` после проверки схемы и очистки.
export interface NormalizedDelta {
  uuid: string;
  group: InventoryGroup;
  epoch: string;
  baseRev: number;
  rev: number;
  capturedAt: Date;
  playerOnline: boolean;
  changes: NormalizedSlotChange[];
}

/// Результат применения события. Соответствие кодам Bridge (раздел 3.4, 4.2
/// дизайна): `applied` → accepted; `stale` → stale; `resync_required` и
/// `rejected` — одноимённые коды отказа.
export type ApplyResult =
  | { status: 'applied'; kind: 'snapshot' | 'delta'; contentChanged: boolean }
  | { status: 'stale' }
  | { status: 'resync_required' }
  | {
      status: 'rejected';
      code: 'invalid_data' | 'unknown_player';
      /// Короткая причина без содержимого предметов.
      reason?: string;
    };

export class InventoryValidationError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'InventoryValidationError';
  }
}
