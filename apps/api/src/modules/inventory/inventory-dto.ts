import type {
  InventoryGroup,
  InventoryGroupViewDto,
  InventoryItemDto,
  InventorySlotDto,
} from '@twomc/shared';
import { INVENTORY_FRESH_THRESHOLD_MS } from '@twomc/shared';
import { reparseStoredSlots } from './inventory-normalize';
import type { StoredInventoryRow } from './inventory.store';
import type { NormalizedItem } from './inventory.types';

/// Белый список полей для клиента: UUID, userId, epoch, rev, contentHash и
/// любые сырые данные в ответ не попадают (ADR-0168, раздел 5).
export function toItemDto(item: NormalizedItem): InventoryItemDto {
  return {
    id: item.id,
    count: item.count,
    damage: item.damage ?? null,
    maxDamage: item.maxDamage ?? null,
    enchants: (item.enchants ?? []).map((e) => ({ id: e.id, level: e.level })),
    storedEnchants: (item.storedEnchants ?? []).map((e) => ({
      id: e.id,
      level: e.level,
    })),
    name: (item.name ?? []).map((run) => ({ ...run })),
    lore: (item.lore ?? []).map((line) => line.map((run) => ({ ...run }))),
    loreTruncated: item.loreTruncated === true,
    customModelData: item.customModelData ?? null,
    itemsAdderId: item.itemsAdderId ?? null,
    unbreakable: item.unbreakable === true,
    dyeColor: item.dyeColor ?? null,
    potion: item.potion ?? null,
    containerItemCount: item.containerItemCount ?? null,
  };
}

/// Слоты из БД проходят повторную очистку (двойной контур, раздел 7.1).
export function toSlotDtos(stored: unknown): InventorySlotDto[] {
  return reparseStoredSlots(stored).map((slot) => ({
    area: slot.area,
    slot: slot.slot,
    item: toItemDto(slot.item),
  }));
}

export function noDataGroup(group: InventoryGroup): InventoryGroupViewDto {
  return {
    group,
    state: 'no_data',
    capturedAt: null,
    playerOnline: null,
    isFresh: false,
    slots: [],
  };
}

export function toGroupView(
  row: StoredInventoryRow,
  now: Date,
): InventoryGroupViewDto {
  const age = now.getTime() - row.capturedAt.getTime();
  return {
    group: row.group,
    state: 'ok',
    capturedAt: row.capturedAt.toISOString(),
    playerOnline: row.playerOnline,
    // Для игрока не в сети снимок «свежий» всегда: время показывается как есть.
    isFresh: !row.playerOnline || age < INVENTORY_FRESH_THRESHOLD_MS,
    slots: toSlotDtos(row.slots),
  };
}
