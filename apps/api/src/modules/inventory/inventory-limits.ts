import type { InventoryArea, InventoryGroup } from './inventory-contract';

/// Лимиты ADR-0168 (разделы 3.2, 3.3, 7.3) и допущения владельца (ADR-0179).

export const SCHEMA_VERSION = 1;

/// Q35 (а): предмет не больше 600 байт в компактном JSON; лишний лор
/// отбрасывается с конца (`loreTruncated`). Защита размера части снимка.
export const MAX_ITEM_BYTES = 600;
/// Суммарный JSON слотов одного ряда: 32 КБ (было 24 КБ; Q35, раздел 7.3
/// дизайна: 41 предмет по 600 байт с накладными расходами слотов не
/// помещается в 24 КБ).
export const MAX_ROW_BYTES = 32 * 1024;

export const MAX_RUN_TEXT = 256;
export const MAX_NAME_RUNS = 16;
export const MAX_LORE_LINES = 20;
export const MAX_LORE_RUNS = 16;
export const MAX_ITEM_TEXT_CHARS = 2000;
export const MAX_ENCHANTS = 32;

export const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_EVENT_FUTURE_MS = 60 * 1000;

/// Допустимые области и число слотов в области (индекс внутри области).
export const AREA_SIZE: Record<InventoryArea, number> = {
  hotbar: 9,
  main: 27,
  armor: 4,
  offhand: 1,
  ender: 27,
};

export const AREA_ORDER: readonly InventoryArea[] = [
  'hotbar',
  'main',
  'armor',
  'offhand',
  'ender',
];

export const GROUP_AREAS: Record<InventoryGroup, readonly InventoryArea[]> = {
  main: ['hotbar', 'main', 'armor', 'offhand'],
  ender: ['ender'],
};

export const GROUP_SLOT_LIMIT: Record<InventoryGroup, number> = {
  main: 41,
  ender: 27,
};

export const NAMESPACED_ID = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
export const SERVER_SLUG = /^[a-z0-9-]{1,32}$/;
