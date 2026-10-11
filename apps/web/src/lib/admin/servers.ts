'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Серверы в админке (срез 7.5, ADR-0131): список, создание и правка,
/// удаление, журнал статусов.

export interface AdminServerCategory {
  id: string;
  name: string;
  slug: string;
}

export interface AdminServer {
  id: string;
  name: string;
  slug: string;
  address: string;
  port: number;
  type: string;
  description: string | null;
  iconUrl: string | null;
  maxPlayers: number;
  version: string | null;
  isActive: boolean;
  order: number;
  categoryId: string | null;
  category: AdminServerCategory | null;
}

export interface ServerStatusLogDto {
  id: string;
  online: boolean;
  playerCount: number;
  maxPlayers: number;
  version: string | null;
  ping: number | null;
  timestamp: string;
}

/// Тело создания/правки — поля `CreateServerDto`.
export interface ServerInput {
  name: string;
  slug: string;
  address: string;
  port: number;
  type: string;
  description?: string;
  maxPlayers: number;
  isActive: boolean;
  order: number;
  categoryId?: string;
}

export const adminServerKeys = {
  all: ['admin', 'servers'] as const,
  categories: ['admin', 'server-categories'] as const,
  logs: (id: string) => ['admin', 'servers', 'logs', id] as const,
};

export function useAdminServers() {
  return useQuery({
    queryKey: adminServerKeys.all,
    queryFn: () => api.get<AdminServer[]>('/admin/servers'),
  });
}

export function useServerCategories(enabled: boolean) {
  return useQuery({
    queryKey: adminServerKeys.categories,
    queryFn: () => api.get<AdminServerCategory[]>('/admin/server-categories'),
    enabled,
  });
}

export function useServerLogs(id: string | null) {
  return useQuery({
    queryKey: adminServerKeys.logs(id ?? ''),
    queryFn: () =>
      api.get<{ items: ServerStatusLogDto[]; total: number }>(
        `/admin/servers/${encodeURIComponent(id!)}/logs`,
        { query: { limit: 20 } },
      ),
    enabled: !!id,
  });
}

export function useAdminServerActions() {
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: adminServerKeys.all });
  const create = useMutation({
    mutationFn: (body: ServerInput) => api.post<AdminServer>('/admin/servers', body),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<ServerInput> }) =>
      api.patch<AdminServer>(`/admin/servers/${encodeURIComponent(id)}`, body),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/servers/${encodeURIComponent(id)}`),
    onSuccess,
  });
  return { create, update, remove };
}
