'use client';

import type { NewsCategory, NewsListItem } from '@twomc/shared';
import { Newspaper } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { useHomeNews } from './home-hooks';
import { HomeSection } from './section';

type NewsTab = 'news' | 'updates' | 'articles';

const TABS: { value: NewsTab; label: string; categories: NewsCategory[] }[] = [
  { value: 'news', label: 'Новости', categories: ['ANNOUNCEMENT', 'EVENT', 'COMMUNITY', 'OTHER'] },
  { value: 'updates', label: 'Обновления', categories: ['UPDATE', 'PATCH_NOTES'] },
  { value: 'articles', label: 'Статьи', categories: ['GUIDE'] },
];

export const CATEGORY_LABEL: Record<NewsCategory, string> = {
  UPDATE: 'Обновление',
  EVENT: 'Событие',
  GUIDE: 'Статья',
  ANNOUNCEMENT: 'Объявление',
  PATCH_NOTES: 'Патч-ноут',
  COMMUNITY: 'Сообщество',
  OTHER: 'Новость',
};

export function filterNews(items: NewsListItem[], tab: NewsTab): NewsListItem[] {
  const categories = TABS.find((item) => item.value === tab)?.categories ?? [];
  return items.filter((item) => categories.includes(item.category));
}

export function NewsCard({ item, large }: { item: NewsListItem; large: boolean }) {
  return (
    <Link
      href={`/news/${encodeURIComponent(item.slug)}`}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <article
        data-testid={large ? 'news-featured' : 'news-compact'}
        className={cn(
          'flex overflow-hidden rounded-xl border bg-surface shadow',
          large ? 'flex-col' : 'flex-row items-stretch',
        )}
      >
        <div
          className={cn(
            'relative shrink-0 bg-surface-sunken',
            large ? 'aspect-[16/9] w-full' : 'w-28 sm:w-36',
          )}
        >
          {item.coverImage ? (
            <Image
              src={item.coverImage}
              alt=""
              fill
              sizes={large ? '(min-width: 1024px) 50vw, 100vw' : '160px'}
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Newspaper aria-hidden className="size-6 text-subtle-foreground" />
            </div>
          )}
        </div>
        <div className={cn('flex min-w-0 flex-1 flex-col gap-1', large ? 'p-5' : 'p-3')}>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge tone="neutral">{CATEGORY_LABEL[item.category]}</Badge>
            {item.publishedAt ? (
              <time dateTime={item.publishedAt}>{formatDate(item.publishedAt)}</time>
            ) : null}
          </div>
          <h3
            className={cn('font-display font-semibold', large ? 'text-xl' : 'line-clamp-2 text-sm')}
          >
            {item.title}
          </h3>
          {item.excerpt ? (
            <p
              className={cn(
                'text-sm text-muted-foreground',
                large ? 'line-clamp-3' : 'line-clamp-2 max-sm:hidden',
              )}
            >
              {item.excerpt}
            </p>
          ) : null}
        </div>
      </article>
    </Link>
  );
}

function NewsGrid({ items }: { items: NewsListItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={<Newspaper />}
        title="Публикаций пока нет"
        description="Раздел наполняется редакцией twomc.su."
      />
    );
  }
  const [first, ...rest] = items;
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <NewsCard item={first} large />
      {rest.length > 0 ? (
        <div className="flex flex-col gap-3">
          {rest.slice(0, 4).map((item) => (
            <NewsCard key={item.id} item={item} large={false} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/// «Последнее на twomc.su»: вкладки Новости / Обновления / Статьи, одна
/// большая публикация + компактные. Данные — GET /news/latest.
export function HomeNews() {
  const news = useHomeNews();
  const [tab, setTab] = useState<NewsTab>('news');
  return (
    <HomeSection id="news" eyebrow="Новости" title="Последнее на twomc.su">
      {news.isPending ? (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : (
        <Tabs value={tab} onValueChange={(value) => setTab(value as NewsTab)}>
          <TabsList aria-label="Тип публикаций">
            {TABS.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {TABS.map((item) => (
            <TabsContent key={item.value} value={item.value} className="pt-4">
              <NewsGrid items={filterNews(news.data ?? [], item.value)} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </HomeSection>
  );
}
