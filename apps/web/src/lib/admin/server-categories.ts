'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminServerKeys } from '@/lib/admin/servers';
import { api } from '@/lib/api/client';

/// Категории серверов (`/admin/server-categories`, права `server_categories.*`).

export interface ServerCategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  order: number;
  isActive: boolean;
}

export interface ServerCategoryInput {
  name: string;
  slug: string;
  description?: string;
  color?: string;
  order?: number;
  isActive?: boolean;
}

const BASE = '/admin/server-categories';

export function useAdminServerCategories() {
  return useQuery({
    queryKey: adminServerKeys.categories,
    queryFn: () => api.get<ServerCategoryRow[]>(BASE),
  });
}

export function useServerCategoryActions() {
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: adminServerKeys.categories });
  const create = useMutation({
    mutationFn: (body: ServerCategoryInput) => api.post<ServerCategoryRow>(BASE, body),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Omit<ServerCategoryInput, 'slug'>> }) =>
      api.patch<ServerCategoryRow>(`${BASE}/${encodeURIComponent(id)}`, body),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`${BASE}/${encodeURIComponent(id)}`),
    onSuccess,
  });
  return { create, update, remove };
}
