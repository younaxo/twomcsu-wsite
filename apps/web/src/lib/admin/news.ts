'use client';

import type { NewsCategory } from '@twomc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Новости в админке (срез 7.4, ADR-0143): список с фильтрами, редактор с
/// предпросмотром Markdown, закреп и «главная», архивация.

export type NewsStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';

export const NEWS_STATUS_LABEL: Record<NewsStatus, string> = {
  DRAFT: 'Черновик',
  SCHEDULED: 'Запланирована',
  PUBLISHED: 'Опубликована',
  ARCHIVED: 'В архиве',
};

/// Статусы, которые можно выбрать в редакторе. «Запланирована» не
/// предлагается: автопубликации по расписанию пока нет (срез 8.6), такая
/// новость не вышла бы сама.
export const EDITABLE_STATUSES: NewsStatus[] = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

export interface AdminNewsListItem {
  id: string;
  slug: string;
  title: string;
  category: NewsCategory;
  status: NewsStatus;
  isPinned: boolean;
  isFeatured: boolean;
  publishedAt: string | null;
  createdAt: string;
  viewsCount: number;
  author: { id: string; username: string; tag: string; avatar: string | null } | null;
  tags: { tag: string }[];
}

export interface AdminNewsArticle extends AdminNewsListItem {
  excerpt: string | null;
  content: string;
  coverImage: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  allowComments: boolean;
}

export interface AdminNewsFilter {
  status: NewsStatus | '';
  category: NewsCategory | '';
  search: string;
  page: number;
}

export interface NewsInput {
  title: string;
  excerpt: string;
  content: string;
  category: NewsCategory;
  status: NewsStatus;
  coverImage?: string | null;
  metaTitle: string;
  metaDescription: string;
  allowComments: boolean;
  tags: string[];
}

export const adminNewsKeys = {
  all: ['admin', 'news'] as const,
  list: (filter: AdminNewsFilter) => ['admin', 'news', 'list', filter] as const,
  detail: (id: string) => ['admin', 'news', 'detail', id] as const,
};

export const ADMIN_NEWS_PAGE_SIZE = 20;

export function useAdminNewsList(filter: AdminNewsFilter) {
  return useQuery({
    queryKey: adminNewsKeys.list(filter),
    queryFn: () =>
      api.get<{ items: AdminNewsListItem[]; total: number; page: number; limit: number }>(
        '/admin/news',
        {
          query: {
            page: filter.page,
            limit: ADMIN_NEWS_PAGE_SIZE,
            ...(filter.status ? { status: filter.status } : {}),
            ...(filter.category ? { category: filter.category } : {}),
            ...(filter.search.trim() ? { search: filter.search.trim() } : {}),
          },
        },
      ),
  });
}

export function useAdminNewsArticle(id: string | null) {
  return useQuery({
    queryKey: adminNewsKeys.detail(id ?? ''),
    queryFn: () => api.get<AdminNewsArticle>(`/admin/news/${encodeURIComponent(id!)}`),
    enabled: !!id,
  });
}

export function useAdminNewsActions() {
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: adminNewsKeys.all });
  const create = useMutation({
    mutationFn: (body: NewsInput & { slug: string }) =>
      api.post<AdminNewsArticle>('/admin/news', body),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: NewsInput }) =>
      api.patch<AdminNewsArticle>(`/admin/news/${encodeURIComponent(id)}`, body),
    onSuccess,
  });
  const archive = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/news/${encodeURIComponent(id)}`),
    onSuccess,
  });
  const toggle = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: 'pin' | 'unpin' | 'feature' | 'unfeature';
    }) => api.post(`/admin/news/${encodeURIComponent(id)}/${action}`),
    onSuccess,
  });
  return { create, update, archive, toggle };
}
