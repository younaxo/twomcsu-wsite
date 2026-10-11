'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Темы в админке (срез 7.4, ADR-0145): правила, FAQ, информационные страницы
/// и юридические документы — список, редактор с предпросмотром Markdown,
/// закреп, удаление.

export type TopicCategory =
  'RULES' | 'DOCUMENTS' | 'INFORMATION' | 'ADMIN_INTERNAL' | 'FAQ' | 'ANNOUNCEMENT' | 'OTHER';

export const TOPIC_CATEGORY_LABEL: Record<TopicCategory, string> = {
  RULES: 'Правила',
  DOCUMENTS: 'Документы',
  INFORMATION: 'Информация',
  FAQ: 'FAQ',
  ANNOUNCEMENT: 'Объявление',
  ADMIN_INTERNAL: 'Внутреннее',
  OTHER: 'Другое',
};

export type TopicVisibility =
  'PUBLIC' | 'AUTHENTICATED' | 'HELPER_ONLY' | 'MODERATOR_ONLY' | 'ADMIN_ONLY' | 'OWNER_ONLY';

export const TOPIC_VISIBILITY_LABEL: Record<TopicVisibility, string> = {
  PUBLIC: 'Всем',
  AUTHENTICATED: 'Вошедшим',
  HELPER_ONLY: 'Хелперам и выше',
  MODERATOR_ONLY: 'Модераторам и выше',
  ADMIN_ONLY: 'Администраторам',
  OWNER_ONLY: 'Владельцу',
};

/// Юридические документы сайта (`/legal/:doc`) берут текст из темы с тем же
/// slug (ADR-0116) — подсказка в редакторе.
export const LEGAL_TOPIC_SLUGS = ['terms', 'privacy', 'personal-data', 'cookies', 'refunds'];

export interface AdminTopicListItem {
  id: string;
  slug: string;
  title: string;
  category: TopicCategory;
  visibility: TopicVisibility;
  description: string | null;
  order: number;
  isActive: boolean;
  isPinned: boolean;
  views: number;
  updatedAt: string;
}

export interface AdminTopic extends AdminTopicListItem {
  content: string;
}

export interface TopicInput {
  title: string;
  category: TopicCategory;
  visibility: TopicVisibility;
  description: string;
  content: string;
}

export const adminTopicKeys = {
  all: ['admin', 'topics'] as const,
  detail: (id: string) => ['admin', 'topics', 'detail', id] as const,
};

export function useAdminTopics() {
  return useQuery({
    queryKey: adminTopicKeys.all,
    queryFn: () => api.get<AdminTopicListItem[]>('/admin/topics'),
  });
}

export function useAdminTopic(id: string) {
  return useQuery({
    queryKey: adminTopicKeys.detail(id),
    queryFn: () => api.get<AdminTopic>(`/admin/topics/${encodeURIComponent(id)}`),
  });
}

export function useAdminTopicActions() {
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: adminTopicKeys.all });
  const create = useMutation({
    mutationFn: (body: TopicInput & { slug: string }) =>
      api.post<AdminTopic>('/admin/topics', body),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: TopicInput & { isActive: boolean } }) =>
      api.patch<AdminTopic>(`/admin/topics/${encodeURIComponent(id)}`, body),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/topics/${encodeURIComponent(id)}`),
    onSuccess,
  });
  const pin = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      api.post(`/admin/topics/${encodeURIComponent(id)}/${pinned ? 'pin' : 'unpin'}`),
    onSuccess,
  });
  return { create, update, remove, pin };
}
