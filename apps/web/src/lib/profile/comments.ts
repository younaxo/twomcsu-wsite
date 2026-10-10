'use client';

import type {
  CommentReactionKey,
  CommentReportReason,
  ProfileCommentDto,
  ProfileCommentsPage,
} from '@twomc/shared';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Комментарии профиля (срез 2.3, ADR-0111): страницы по 20, «Показать ещё».
/// Любое действие перезапрашивает список — счётчики и права считает сервер.

const PAGE_SIZE = 20;

export const commentKeys = {
  list: (username: string) => ['profile', 'comments', username.toLowerCase()] as const,
};

export function useProfileComments(username: string) {
  return useInfiniteQuery({
    queryKey: commentKeys.list(username),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<ProfileCommentsPage>(`/users/${encodeURIComponent(username)}/comments`, {
        query: { page: pageParam, limit: PAGE_SIZE },
        retryOn401: false,
      }),
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
  });
}

export function useCommentActions(username: string) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: commentKeys.list(username) });
  const create = useMutation({
    mutationFn: (content: string) =>
      api.post<ProfileCommentDto>(`/users/${encodeURIComponent(username)}/comments`, {
        content,
      }),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      api.patch<ProfileCommentDto>(`/comments/${encodeURIComponent(id)}`, { content }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/comments/${encodeURIComponent(id)}`),
    onSuccess: refresh,
  });
  const react = useMutation({
    mutationFn: ({ id, key }: { id: string; key: CommentReactionKey }) =>
      api.post(`/comments/${encodeURIComponent(id)}/reactions`, { emoji: key }),
    onSuccess: refresh,
  });
  const report = useMutation({
    mutationFn: ({
      id,
      reason,
      description,
    }: {
      id: string;
      reason: CommentReportReason;
      description?: string;
    }) =>
      api.post(`/comments/${encodeURIComponent(id)}/report`, {
        reason,
        ...(description ? { description } : {}),
      }),
  });
  return { create, update, remove, react, report };
}
