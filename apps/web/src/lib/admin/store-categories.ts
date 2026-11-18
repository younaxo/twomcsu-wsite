'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Админка магазина, слой 0 / подэтап 0.3: категории.
/// Контракт — categories-admin.controller.ts. slug при правке не меняется
/// (UpdateCategoryDto его не содержит). Удаление запрещено (400), пока в
/// категории есть подкатегории или товары.

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  image: string | null;
  order: number;
  isActive: boolean;
  parentId: string | null;
}

export interface CategoryCreateInput {
  name: string;
  slug: string;
  description?: string;
  order?: number;
  isActive?: boolean;
  parentId?: string;
}

/// parentId пока нельзя сбросить в null (DTO — string): смена родителя только
/// на другую категорию.
export interface CategoryPatchInput {
  name?: string;
  description?: string;
  order?: number;
  isActive?: boolean;
  parentId?: string;
}

export const adminCategoryKeys = {
  all: ['admin', 'store', 'categories'] as const,
};

/// `enabled` — категории нужны и форме товара, но только с правом
/// `store.categories.view`.
export function useAdminCategories(enabled = true) {
  return useQuery({
    queryKey: adminCategoryKeys.all,
    queryFn: () => api.get<AdminCategory[]>('/admin/store/categories'),
    enabled,
  });
}

export function useAdminCategoryActions() {
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: adminCategoryKeys.all });
  const create = useMutation({
    mutationFn: (body: CategoryCreateInput) =>
      api.post<AdminCategory>('/admin/store/categories', body),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: CategoryPatchInput }) =>
      api.patch<AdminCategory>(`/admin/store/categories/${encodeURIComponent(id)}`, body),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/store/categories/${encodeURIComponent(id)}`),
    onSuccess,
  });
  return { create, update, remove };
}
