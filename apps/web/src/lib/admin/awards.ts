'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Награды в админке (срез 7.6, ADR-0139): каталог, создание и правка,
/// удаление. Выдача игроку — из карточки пользователя (следующий срез).

export type AwardRarity = 'common' | 'rare' | 'epic' | 'legendary';

export const AWARD_RARITY_LABEL: Record<AwardRarity, string> = {
  common: 'Обычная',
  rare: 'Редкая',
  epic: 'Эпическая',
  legendary: 'Легендарная',
};

export interface AdminAward {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  iconUrl: string;
  rarity: string | null;
  isActive: boolean;
  holdersCount: number;
}

export interface AwardInput {
  name: string;
  slug: string;
  description?: string;
  iconUrl: string;
  rarity?: AwardRarity;
}

/// Правка: slug не меняется; null очищает описание и редкость.
export interface AwardPatch {
  name?: string;
  description?: string | null;
  iconUrl?: string;
  rarity?: AwardRarity | null;
  isActive?: boolean;
}

export const adminAwardKeys = {
  all: ['admin', 'awards'] as const,
};

/// `enabled` — каталог нужен и в карточке пользователя, но только с правом
/// `awards.view` (ADR-0142).
export function useAdminAwards(enabled = true) {
  return useQuery({
    queryKey: adminAwardKeys.all,
    queryFn: () => api.get<AdminAward[]>('/admin/awards'),
    enabled,
  });
}

export function useAdminAwardActions() {
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: adminAwardKeys.all });
  const create = useMutation({
    mutationFn: (body: AwardInput) => api.post<AdminAward>('/admin/awards', body),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: AwardPatch }) =>
      api.patch<AdminAward>(`/admin/awards/${encodeURIComponent(id)}`, body),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/awards/${encodeURIComponent(id)}`),
    onSuccess,
  });
  return { create, update, remove };
}
