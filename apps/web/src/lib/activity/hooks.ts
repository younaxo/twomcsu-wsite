'use client';

import type {
  ActivityCommentDto,
  ActivityCommentsPage,
  ActivityDto,
  ActivityPage,
  ActivityReactionKey,
  ActivitySettingsDto,
} from '@twomc/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Лента активности (срез 2.6, ADR-0114). Видимость считает сервер; любое
/// действие перезапрашивает затронутые данные.

const PAGE_SIZE = 20;

export const activityKeys = {
  all: ['activity'] as const,
  global: ['activity', 'global'] as const,
  user: (username: string) => ['activity', 'user', username.toLowerCase()] as const,
  one: (id: string) => ['activity', 'one', id] as const,
  comments: (id: string) => ['activity', 'comments', id] as const,
  settings: ['activity', 'settings'] as const,
};

function nextPage(last: { page: number; limit: number; total: number }) {
  return last.page * last.limit < last.total ? last.page + 1 : undefined;
}

/// Глобальная лента (`username` не задан) или лента игрока.
export function useActivityFeed(username?: string) {
  return useInfiniteQuery({
    queryKey: username ? activityKeys.user(username) : activityKeys.global,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<ActivityPage>(
        username ? `/activity/feed/user/${encodeURIComponent(username)}` : '/activity/feed',
        { query: { page: pageParam, limit: PAGE_SIZE }, retryOn401: false },
      ),
    getNextPageParam: nextPage,
  });
}

export function useActivity(id: string) {
  return useQuery({
    queryKey: activityKeys.one(id),
    queryFn: () =>
      api.get<ActivityDto>(`/activity/${encodeURIComponent(id)}`, { retryOn401: false }),
  });
}

export function useActivityComments(id: string) {
  return useInfiniteQuery({
    queryKey: activityKeys.comments(id),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<ActivityCommentsPage>(`/activity/${encodeURIComponent(id)}/comments`, {
        query: { page: pageParam, limit: PAGE_SIZE },
        retryOn401: false,
      }),
    getNextPageParam: nextPage,
  });
}

export function useActivityActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: activityKeys.all });
  const react = useMutation({
    mutationFn: ({ id, key }: { id: string; key: ActivityReactionKey }) =>
      api.post(`/activity/${encodeURIComponent(id)}/reactions`, { emoji: key }),
    onSuccess: refresh,
  });
  const comment = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      api.post<ActivityCommentDto>(`/activity/${encodeURIComponent(id)}/comments`, { content }),
    onSuccess: refresh,
  });
  const removeComment = useMutation({
    mutationFn: (commentId: string) =>
      api.delete(`/activity/comments/${encodeURIComponent(commentId)}`),
    onSuccess: refresh,
  });
  return { react, comment, removeComment };
}

export function useActivitySettings(enabled = true) {
  return useQuery({
    queryKey: activityKeys.settings,
    queryFn: () => api.get<ActivitySettingsDto>('/activity/settings'),
    enabled,
  });
}

export function useUpdateActivitySettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ActivitySettingsDto>) =>
      api.patch<ActivitySettingsDto>('/activity/settings', body),
    onSuccess: (data) => client.setQueryData(activityKeys.settings, data),
  });
}
