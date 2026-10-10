'use client';

import type { NewsCategory } from '@twomc/shared';
import { Newspaper, Rss } from 'lucide-react';
import { useState } from 'react';
import { NewsCard, CATEGORY_LABEL } from '@/app/(site)/_components/news-section';
import { PageHeader } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Pagination } from '@/components/ui/pagination';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SkeletonRows } from '@/components/ui/skeleton';
import { API_URL } from '@/lib/env';
import { NEWS_PAGE_SIZE, useNewsList } from '@/lib/news/hooks';

/// «Новости» (срез 3.3, ADR-0117): опубликованные новости, фильтр по категории,
/// страницы, ссылка на RSS.

const CATEGORIES = Object.keys(CATEGORY_LABEL) as NewsCategory[];

export default function NewsPage() {
  const [category, setCategory] = useState<NewsCategory | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const news = useNewsList(category, page);
  const pages = news.data ? Math.max(1, Math.ceil(news.data.total / NEWS_PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader title="Новости" description="Обновления, события и статьи twomc.su." />
        <Button asChild size="sm" variant="secondary">
          <a href={`${API_URL}/rss/news`} target="_blank" rel="noreferrer">
            <Rss />
            RSS
          </a>
        </Button>
      </div>
      <div className="max-w-full overflow-x-auto scrollbar-none">
        <SegmentedControl
          size="sm"
          value={category}
          onValueChange={(value) => {
            setCategory(value as NewsCategory | 'ALL');
            setPage(1);
          }}
          options={[
            { value: 'ALL', label: 'Все' },
            ...CATEGORIES.map((item) => ({ value: item, label: CATEGORY_LABEL[item] })),
          ]}
        />
      </div>
      {news.isPending ? (
        <SkeletonRows rows={6} />
      ) : news.isError ? (
        <ErrorState error={news.error} onRetry={() => news.refetch()} />
      ) : news.data.items.length === 0 ? (
        <EmptyState
          icon={<Newspaper />}
          title="Новостей пока нет"
          description="Загляните позже — здесь появятся обновления и анонсы."
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="news-list">
          {news.data.items.map((item) => (
            <li key={item.id}>
              <NewsCard item={item} large />
            </li>
          ))}
        </ul>
      )}
      {pages > 1 ? <Pagination page={page} totalPages={pages} onPageChange={setPage} /> : null}
    </div>
  );
}
