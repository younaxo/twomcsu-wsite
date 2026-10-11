'use client';

import type { PermissionKey } from '@twomc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Отделы и свои должности в админке (срез 7.6, ADR-0140): одинаковые
/// каталоги — название, slug, цвет, описание, активность; отличаются адресом
/// API, правами и счётчиком (участники / обладатели).

export interface TeamCatalogItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  isActive: boolean;
  order?: number;
  membersCount?: number;
  usersCount?: number;
}

export interface TeamCatalogInput {
  name: string;
  slug: string;
  description?: string;
  color?: string;
}

/// Правка: slug не меняется; null очищает описание и цвет.
export interface TeamCatalogPatch {
  name?: string;
  description?: string | null;
  color?: string | null;
  isActive?: boolean;
  order?: number;
}

export interface TeamCatalogKind {
  endpoint: '/admin/departments' | '/admin/custom-positions';
  permissions: {
    view: PermissionKey;
    create: PermissionKey;
    edit: PermissionKey;
    delete: PermissionKey;
  };
  /// Поле счётчика в ответе API.
  countField: 'membersCount' | 'usersCount';
  /// Есть ли ручной порядок (у отделов).
  ordered: boolean;
}

export const DEPARTMENTS: TeamCatalogKind = {
  endpoint: '/admin/departments',
  permissions: {
    view: 'departments.view',
    create: 'departments.create',
    edit: 'departments.edit',
    delete: 'departments.delete',
  },
  countField: 'membersCount',
  ordered: true,
};

export const CUSTOM_POSITIONS: TeamCatalogKind = {
  endpoint: '/admin/custom-positions',
  permissions: {
    view: 'custom_positions.view',
    create: 'custom_positions.create',
    edit: 'custom_positions.edit',
    delete: 'custom_positions.delete',
  },
  countField: 'usersCount',
  ordered: false,
};

const key = (kind: TeamCatalogKind) => ['admin', kind.endpoint] as const;

export function useTeamCatalog(kind: TeamCatalogKind) {
  return useQuery({
    queryKey: key(kind),
    queryFn: () => api.get<TeamCatalogItem[]>(kind.endpoint),
  });
}

export function useTeamCatalogActions(kind: TeamCatalogKind) {
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: key(kind) });
  const create = useMutation({
    mutationFn: (body: TeamCatalogInput) => api.post<TeamCatalogItem>(kind.endpoint, body),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: TeamCatalogPatch }) =>
      api.patch<TeamCatalogItem>(`${kind.endpoint}/${encodeURIComponent(id)}`, body),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`${kind.endpoint}/${encodeURIComponent(id)}`),
    onSuccess,
  });
  return { create, update, remove };
}
