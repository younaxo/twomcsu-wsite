'use client';

import type { ReactNode } from 'react';
import { TopicArticle } from './topic-article';

/// Юридический документ (срез 3.1, ADR-0116): текст — из темы с тем же slug
/// (`terms`, `privacy`, `personal-data`, `cookies`, `refunds`), с датой редакции.
/// Владелец ещё не опубликовал текст — честная заглушка страницы.
export function LegalTopic({ slug, fallback }: { slug: string; fallback: ReactNode }) {
  return <TopicArticle slug={slug} fallback={fallback} />;
}
