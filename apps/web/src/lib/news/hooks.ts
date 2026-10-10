'use client';

import type { NewsCategory, NewsListItem } from '@twomc/shared';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Новости (срез 3.3, ADR-0117): список с фильтром категории и страницами,
/// статья, лайк, комментарии (реакции-ключи, счётчики считает сервер).

export interface NewsArticleDto extends NewsListItem {
  content: string;
  likesCount: number;
  commentsCount: number;
  allowComments: boolean;
  liked: boolean;
  tags: Array<{ id: string; name: string; slug: string }>;
}

export interface NewsCommentDto {
  id: string;
  parentId: string | null;
  content: string;
  createdAt: string;
  isEdited: boolean;
  isPinned: boolean;
  author: { id: string; username: string; tag?: string; avatar: string | null } | null;
  reactions: Array<{ key: string; count: number }>;
  myReaction: string | null;
  canEdit: boolean;
  canDelete: boolean;
}

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export const newsKeys = {
  list: (category: NewsCategory | 'ALL', page: number) => ['news', 'list', category, page] as const,
  article: (slug: string) => ['news', 'article', slug] as const,
  comments: (slug: string) => ['news', 'comments', slug] as const,
};

export const NEWS_PAGE_SIZE = 12;

export function useNewsList(category: NewsCategory | 'ALL', page: number) {
  return useQuery({
    queryKey: newsKeys.list(category, page),
    queryFn: () =>
      api.get<Page<NewsListItem>>('/news', {
        auth: false,
        query: {
          page,
          limit: NEWS_PAGE_SIZE,
          ...(category === 'ALL' ? {} : { category }),
        },
      }),
    placeholderData: keepPreviousData,
  });
}

export function useNewsArticle(slug: string) {
  return useQuery({
    queryKey: newsKeys.article(slug),
    queryFn: () =>
      api.get<NewsArticleDto>(`/news/${encodeURIComponent(slug)}`, { retryOn401: false }),
    retry: false,
  });
}

export function useNewsComments(slug: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: newsKeys.comments(slug),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<Page<NewsCommentDto>>(`/news/${encodeURIComponent(slug)}/comments`, {
        query: { page: pageParam, limit: 20 },
        retryOn401: false,
      }),
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
    enabled,
  });
}

export function useNewsActions(slug: string) {
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: newsKeys.article(slug) });
    void client.invalidateQueries({ queryKey: newsKeys.comments(slug) });
  };
  const like = useMutation({
    mutationFn: (newsId: string) => api.post(`/news/${encodeURIComponent(newsId)}/like`),
    onSuccess: refresh,
  });
  const comment = useMutation({
    mutationFn: (content: string) =>
      api.post(`/news/${encodeURIComponent(slug)}/comments`, { content }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (commentId: string) =>
      api.delete(`/news/${encodeURIComponent(slug)}/comments/${encodeURIComponent(commentId)}`),
    onSuccess: refresh,
  });
  const react = useMutation({
    mutationFn: ({ commentId, key }: { commentId: string; key: string }) =>
      api.post(
        `/news/${encodeURIComponent(slug)}/comments/${encodeURIComponent(commentId)}/reactions`,
        { emoji: key },
      ),
    onSuccess: refresh,
  });
  return { like, comment, remove, react };
}
