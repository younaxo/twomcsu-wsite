'use client';

import type {
  InventoryGroupViewDto,
  InventoryItemDto,
  InventoryMeResponseDto,
  InventoryPrivacyDto,
  InventorySlotDto,
  InventoryTextRunDto,
} from '@twomc/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';

/// Инвентарь Minecraft на сайте, слой 1 / подэтап 1.5 (ADR-0168, ADR-0179).
/// Контракт — apps/api/src/modules/inventory: GET /inventory/me и
/// GET /inventory/me/privacy. Показываем только свой инвентарь; чужой и
/// публичный режим в этом срезе не реализованы (по Q39 приватно по умолчанию).

export const inventoryKeys = {
  mine: ['inventory', 'me'] as const,
  privacy: ['inventory', 'me', 'privacy'] as const,
};

/// 503 `inventory_unavailable`: раздел выключен флагом BRIDGE_ENABLED.
export function isInventoryUnavailable(error: unknown): boolean {
  return (
    error instanceof ApiError && error.status === 503 && error.code === 'inventory_unavailable'
  );
}

export function useMyInventory() {
  const authenticated = useAuthStore((state) => state.status === 'authenticated');
  return useQuery({
    queryKey: inventoryKeys.mine,
    queryFn: () => api.get<InventoryMeResponseDto>('/inventory/me'),
    enabled: authenticated,
    retry: false,
  });
}

export function useMyInventoryPrivacy(enabled: boolean) {
  const authenticated = useAuthStore((state) => state.status === 'authenticated');
  return useQuery({
    queryKey: inventoryKeys.privacy,
    queryFn: () => api.get<InventoryPrivacyDto>('/inventory/me/privacy'),
    enabled: authenticated && enabled,
    retry: false,
  });
}

/// Раскладка области: число колонок и строк. Слоты приходят разреженно
/// (только занятые), пустые ячейки достраиваем по индексу.
export const AREA_SIZE = {
  hotbar: 9,
  main: 27,
  armor: 4,
  offhand: 1,
  ender: 27,
} as const;

export const COLUMNS = 9;

export type SlotMap = Map<string, InventoryItemDto>;

export function slotKey(area: string, slot: number): string {
  return `${area}:${slot}`;
}

export function toSlotMap(slots: InventorySlotDto[]): SlotMap {
  return new Map(slots.map((entry) => [slotKey(entry.area, entry.slot), entry.item]));
}

export function groupSlots(group: InventoryGroupViewDto): SlotMap {
  return toSlotMap(group.slots);
}

/// Текст предмета — только plain text, цвета Minecraft не применяем
/// (контраст на токенах «Полдня» важнее); `obfuscated` не воспроизводим.
export function runsToText(runs: InventoryTextRunDto[]): string {
  return runs.map((run) => run.text).join('');
}

/// «minecraft:diamond_sword» → «Diamond sword».
export function prettyItemId(id: string): string {
  const base = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
  const words = base.replace(/_/g, ' ').trim();
  return words.length > 0 ? words.charAt(0).toUpperCase() + words.slice(1) : id;
}

export function itemTitle(item: InventoryItemDto): string {
  const custom = runsToText(item.name).trim();
  return custom.length > 0 ? custom : prettyItemId(item.id);
}

export const AREA_LABEL: Record<string, string> = {
  hotbar: 'Панель быстрого доступа',
  main: 'Основной инвентарь',
  armor: 'Броня',
  offhand: 'Вторая рука',
  ender: 'Эндер-сундук',
};

/// Подпись слота для скринридера: область, номер, содержимое.
export function slotLabel(area: string, slot: number, item: InventoryItemDto | undefined): string {
  const place = `${AREA_LABEL[area] ?? area}, слот ${slot + 1}`;
  if (!item) return `${place}: пусто`;
  return `${place}: ${itemTitle(item)}, количество ${item.count}`;
}

/// Украшения профиля (Q41: отдельной системы нет — показываем существующие).
/// GET /users/me/decorations отдаёт связи UserDecoration с вложенным украшением.
export interface OwnedDecoration {
  id: string;
  acquiredAt: string;
  decoration: { id: string; slug: string; name: string; imageUrl: string };
}

export function useMyDecorations() {
  const authenticated = useAuthStore((state) => state.status === 'authenticated');
  return useQuery({
    queryKey: ['inventory', 'decorations'] as const,
    queryFn: () => api.get<OwnedDecoration[]>('/users/me/decorations'),
    enabled: authenticated,
    retry: false,
  });
}
