'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Должности в админке (срез 7.6, ADR-0140): каталог, создание и правка,
/// удаление. Назначение игроку — из карточки пользователя.

export interface AdminPosition {
  id: string;
  name: string;
  slug: string;
  displayName: string;
  group: string;
  color: string;
  priority: number;
  description: string | null;
  isVisible: boolean;
  isDefault: boolean;
  usersCount: number;
  productsCount: number;
}

export interface PositionInput {
  name: string;
  slug: string;
  displayName: string;
  group: string;
  color: string;
  priority: number;
  description?: string;
  isVisible: boolean;
}

/// Правка: название и slug не меняются; null очищает описание.
export interface PositionPatch {
  displayName?: string;
  group?: string;
  color?: string;
  priority?: number;
  description?: string | null;
  isVisible?: boolean;
}

export const adminPositionKeys = {
  all: ['admin', 'positions'] as const,
};

export function useAdminPositions() {
  return useQuery({
    queryKey: adminPositionKeys.all,
    queryFn: () => api.get<AdminPosition[]>('/positions/manage'),
  });
}

export function useAdminPositionActions() {
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: adminPositionKeys.all });
  const create = useMutation({
    mutationFn: (body: PositionInput) => api.post<AdminPosition>('/positions', body),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: PositionPatch }) =>
      api.patch<AdminPosition>(`/positions/${encodeURIComponent(id)}`, body),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/positions/${encodeURIComponent(id)}`),
    onSuccess,
  });
  return { create, update, remove };
}
