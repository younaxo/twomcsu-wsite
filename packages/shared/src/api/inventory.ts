/// Инвентарь Minecraft на сайте (этап 04, ADR-0168, ADR-0179): контракт
/// `GET /inventory/me`, `GET|PATCH /inventory/me/privacy`. Только типы и
/// константы. Ответы строятся из белого списка полей: сырого NBT, UUID,
/// `userId`, `epoch`, `rev` и `contentHash` в них нет.

/// main — основной инвентарь, броня, вторая рука; ender — Ender Chest.
export type InventoryGroup = 'main' | 'ender';

export type InventoryArea = 'hotbar' | 'main' | 'armor' | 'offhand' | 'ender';

/// `ok` — снимок есть; `no_data` — привязка есть, снимка нет.
export type InventoryState = 'ok' | 'no_data';

/// Коды `code` в теле ошибок (раздел 5.1 дизайна).
export type InventoryErrorCode = 'not_found' | 'invalid_param' | 'inventory_unavailable';

/// «Прогон» текста предмета: только данные, выводить как plain text.
export interface InventoryTextRunDto {
  text: string;
  /// `#RRGGBB` (верхний регистр) или одно из 16 имён цветов Minecraft.
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  strikethrough?: boolean;
  obfuscated?: boolean;
}

export interface InventoryEnchantDto {
  id: string;
  level: number;
}

export interface InventoryItemDto {
  id: string;
  count: number;
  damage: number | null;
  maxDamage: number | null;
  enchants: InventoryEnchantDto[];
  storedEnchants: InventoryEnchantDto[];
  name: InventoryTextRunDto[];
  lore: InventoryTextRunDto[][];
  /// Лор был обрезан по лимиту размера предмета (Q35).
  loreTruncated: boolean;
  customModelData: number | null;
  itemsAdderId: string | null;
  unbreakable: boolean;
  dyeColor: number | null;
  potion: string | null;
  /// Число непустых вложенных предметов контейнера; содержимое не передаётся.
  containerItemCount: number | null;
}

export interface InventorySlotDto {
  area: InventoryArea;
  /// Индекс внутри области (hotbar 0–8, main 0–26, armor 0–3, offhand 0, ender 0–26).
  slot: number;
  item: InventoryItemDto;
}

export interface InventoryServerRefDto {
  slug: string;
  name: string;
}

export interface InventoryGroupViewDto {
  group: InventoryGroup;
  state: InventoryState;
  /// null при `no_data`.
  capturedAt: string | null;
  /// null при `no_data`.
  playerOnline: boolean | null;
  /// Для игрока в сети — снимок не старше порога; для offline всегда true.
  isFresh: boolean;
  /// Только занятые слоты; пусто при `no_data`.
  slots: InventorySlotDto[];
}

export interface InventoryServerViewDto {
  server: InventoryServerRefDto;
  groups: InventoryGroupViewDto[];
}

export interface InventoryMeResponseDto {
  /// `no_data`, если ни по одному серверу снимков нет.
  state: InventoryState;
  servers: InventoryServerViewDto[];
  viewer: { relation: 'owner' };
}

export interface InventoryPrivacyDto {
  inventoryPublic: boolean;
  enderPublic: boolean;
}

/// PATCH: хотя бы одно поле. Ender Chest может быть публичным только при
/// публичном основном инвентаре; иначе `422 invalid_param`.
export interface UpdateInventoryPrivacyDto {
  inventoryPublic?: boolean;
  enderPublic?: boolean;
}

/// Порог свежести снимка для игрока в сети (мс): 15 минут.
export const INVENTORY_FRESH_THRESHOLD_MS = 15 * 60 * 1000;
