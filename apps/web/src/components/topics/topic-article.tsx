'use client';

import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ErrorState } from '@/components/ui/error-state';
import { SafeMarkdown } from '@/components/ui/safe-markdown';
import { SkeletonRows } from '@/components/ui/skeleton';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { formatDate } from '@/lib/format';

/// Тема сайта (правила, документы, информация, FAQ) по slug — срезы 3.1/3.2,
/// ADR-0116. Текст — безопасный Markdown (`SafeMarkdown`, без HTML), дата
/// редакции — `updatedAt`. Темы нет или она скрыта — `fallback` (честная
/// заглушка вызывающей страницы), без выдуманного текста.

export interface TopicDto {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string | null;
  content: string;
  isPinned: boolean;
  updatedAt: string;
}

export const topicKeys = {
  one: (slug: string) => ['site', 'topic', slug] as const,
  list: (category: string) => ['site', 'topics', category] as const,
};

export function useTopic(slug: string) {
  return useQuery({
    queryKey: topicKeys.one(slug),
    queryFn: () => api.get<TopicDto>(`/topics/${encodeURIComponent(slug)}`, { auth: false }),
    retry: false,
  });
}

export function useTopics(category: string) {
  return useQuery({
    queryKey: topicKeys.list(category),
    queryFn: () => api.get<TopicDto[]>('/topics', { auth: false, query: { category } }),
  });
}

export function TopicBody({ topic }: { topic: TopicDto }) {
  return (
    <article
      className="flex flex-col gap-4 rounded-xl bg-surface p-6 shadow-sm"
      data-testid="topic-article"
    >
      <p className="text-xs text-subtle-foreground" data-testid="topic-revision">
        Редакция от {formatDate(topic.updatedAt)}
      </p>
      {topic.content.trim() ? (
        <SafeMarkdown source={topic.content} className="text-sm leading-relaxed" />
      ) : (
        <p className="text-sm text-muted-foreground">Текст пока не добавлен.</p>
      )}
    </article>
  );
}

export function TopicArticle({
  slug,
  fallback,
  onTitle,
}: {
  slug: string;
  /// Темы нет (404) — что показать вместо неё.
  fallback: ReactNode;
  /// Заголовок темы для шапки страницы.
  onTitle?: (title: string) => ReactNode;
}) {
  const topic = useTopic(slug);
  if (topic.isPending) return <SkeletonRows rows={6} />;
  if (topic.isError) {
    if (topic.error instanceof ApiError && topic.error.status === 404) return <>{fallback}</>;
    return <ErrorState error={topic.error} onRetry={() => topic.refetch()} />;
  }
  return (
    <>
      {onTitle ? onTitle(topic.data.title) : null}
      <TopicBody topic={topic.data} />
    </>
  );
}
