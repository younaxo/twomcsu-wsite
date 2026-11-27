'use client';

import type { InventoryServerViewDto } from '@twomc/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Админский просмотр инвентаря и статистики игрока (Q116). Контракт —
/// GET /admin/players/:userId/inventory и /stats; нужно право
/// `players.inventory.view`, каждый просмотр пишется в аудит.
export const PLAYER_INVENTORY_PERMISSION = 'players.inventory.view';

export interface AdminPlayerInventory {
  state: 'ok' | 'no_data';
  servers: InventoryServerViewDto[];
  viewer: { relation: 'admin' };
}

export interface AdminPlayerStats {
  state: 'ok' | 'no_data';
  stats: {
    playTimeMinutes: number;
    kills: number;
    deaths: number;
    hits: number;
    killDeathRatio: number;
    lastServer: string | null;
    updatedAt: string;
  } | null;
  viewer: { relation: 'admin' };
}

export const adminPlayerKeys = {
  inventory: (userId: string) => ['admin', 'players', userId, 'inventory'] as const,
  stats: (userId: string) => ['admin', 'players', userId, 'stats'] as const,
};

export function useAdminPlayerInventory(userId: string, enabled: boolean) {
  return useQuery({
    queryKey: adminPlayerKeys.inventory(userId),
    queryFn: () =>
      api.get<AdminPlayerInventory>(`/admin/players/${encodeURIComponent(userId)}/inventory`),
    enabled: enabled && userId.length > 0,
    retry: false,
  });
}

export function useAdminPlayerStats(userId: string, enabled: boolean) {
  return useQuery({
    queryKey: adminPlayerKeys.stats(userId),
    queryFn: () =>
      api.get<AdminPlayerStats>(`/admin/players/${encodeURIComponent(userId)}/stats`),
    enabled: enabled && userId.length > 0,
    retry: false,
  });
}

/// 135 → «2 ч 15 мин».
export function formatPlayTime(minutes: number): string {
  const total = Math.max(0, Math.floor(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
}
