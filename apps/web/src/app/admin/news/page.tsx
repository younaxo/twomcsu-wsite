'use client';

import type { NewsCategory } from '@twomc/shared';
import { Newspaper, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { CATEGORY_LABEL } from '@/app/(site)/_components/news-section';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input, inputClassName } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import {
  ADMIN_NEWS_PAGE_SIZE,
  NEWS_STATUS_LABEL,
  useAdminNewsActions,
  useAdminNewsList,
  type AdminNewsFilter,
  type AdminNewsListItem,
  type NewsStatus,
} from '@/lib/admin/news';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDateTime } from '@/lib/format';

/// Новости в админке (срез 7.4, ADR-0143): список с фильтрами по статусу,
/// категории и заголовку; закреп, «главная» и архивация — по своим правам.

const STATUS_TONE: Record<NewsStatus, 'success' | 'warning' | 'neutral'> = {
  PUBLISHED: 'success',
  SCHEDULED: 'warning',
  DRAFT: 'neutral',
  ARCHIVED: 'neutral',
};

function NewsList() {
  const { can } = usePermissions();
  const [filter, setFilter] = useState<AdminNewsFilter>({
    status: '',
    category: '',
    search: '',
    page: 1,
  });
  const news = useAdminNewsList(filter);
  const { archive, toggle } = useAdminNewsActions();
  const [archiving, setArchiving] = useState<AdminNewsListItem | null>(null);
  const totalPages = news.data ? Math.max(1, Math.ceil(news.data.total / ADMIN_NEWS_PAGE_SIZE)) : 1;
  const run = (item: AdminNewsListItem, action: 'pin' | 'unpin' | 'feature' | 'unfeature') =>
    toggle.mutate(
      { id: item.id, action },
      { onError: (error) => toast.error(getErrorMessage(error)) },
    );

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {can('news.create') ? (
          <Button asChild>
            <Link href="/admin/news/new">
              <Plus />
              Новая новость
            </Link>
          </Button>
        ) : null}
        <Input
          aria-label="Поиск по заголовку"
          placeholder="Поиск по заголовку"
          className="w-56"
          value={filter.search}
          onChange={(e) => setFilter({ ...filter, search: e.target.value, page: 1 })}
        />
        <select
          aria-label="Статус"
          className={`${inputClassName} w-auto`}
          value={filter.status}
          onChange={(e) =>
            setFilter({ ...filter, status: e.target.value as NewsStatus | '', page: 1 })
          }
        >
          <option value="">Все статусы</option>
          {(Object.keys(NEWS_STATUS_LABEL) as NewsStatus[]).map((status) => (
            <option key={status} value={status}>
              {NEWS_STATUS_LABEL[status]}
            </option>
          ))}
        </select>
        <select
          aria-label="Категория"
          className={`${inputClassName} w-auto`}
          value={filter.category}
          onChange={(e) =>
            setFilter({ ...filter, category: e.target.value as NewsCategory | '', page: 1 })
          }
        >
          <option value="">Все категории</option>
          {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {news.isPending ? (
        <SkeletonRows rows={6} />
      ) : news.isError ? (
        <ErrorState error={news.error} onRetry={() => news.refetch()} />
      ) : news.data.items.length === 0 ? (
        <EmptyState
          icon={<Newspaper />}
          title="Новостей нет"
          description="По этим фильтрам пусто."
        />
      ) : (
        <>
          <ul
            className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
            data-testid="admin-news"
          >
            {news.data.items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {can('news.edit') ? (
                      <Link
                        href={`/admin/news/${encodeURIComponent(item.id)}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {item.title}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium">{item.title}</span>
                    )}
                    <Badge tone={STATUS_TONE[item.status]}>{NEWS_STATUS_LABEL[item.status]}</Badge>
                    <Badge tone="neutral">{CATEGORY_LABEL[item.category]}</Badge>
                    {item.isPinned ? <Badge tone="neutral">Закреплена</Badge> : null}
                    {item.isFeatured ? <Badge tone="neutral">На главной</Badge> : null}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {item.author?.username ?? '—'} ·{' '}
                    {formatDateTime(item.publishedAt ?? item.createdAt)} · просмотров:{' '}
                    {item.viewsCount}
                  </span>
                </div>
                <span className="flex flex-wrap gap-1">
                  {can('news.pin') ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => run(item, item.isPinned ? 'unpin' : 'pin')}
                    >
                      {item.isPinned ? 'Открепить' : 'Закрепить'}
                    </Button>
                  ) : null}
                  {can('news.feature') ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => run(item, item.isFeatured ? 'unfeature' : 'feature')}
                    >
                      {item.isFeatured ? 'Убрать с главной' : 'На главную'}
                    </Button>
                  ) : null}
                  {can('news.delete') && item.status !== 'ARCHIVED' ? (
                    <Button size="sm" variant="ghost" onClick={() => setArchiving(item)}>
                      В архив
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {totalPages > 1 ? (
            <Pagination
              page={filter.page}
              totalPages={totalPages}
              onPageChange={(page) => setFilter({ ...filter, page })}
            />
          ) : null}
        </>
      )}
      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(open) => !open && setArchiving(null)}
        title={`Убрать «${archiving?.title ?? ''}» в архив?`}
        description="Новость пропадёт с сайта. Вернуть можно, сменив статус в редакторе."
        confirmLabel="В архив"
        loading={archive.isPending}
        onConfirm={() =>
          archive.mutate(archiving!.id, {
            onSuccess: () => {
              toast.success('Новость в архиве');
              setArchiving(null);
            },
            onError: (error) => toast.error(getErrorMessage(error)),
          })
        }
      />
    </>
  );
}

export default function AdminNewsPage() {
  return (
    <PermissionGate requirement="news.view">
      <div className="flex flex-col gap-4">
        <PageHeader title="Новости" description="Новости, обновления и статьи сайта." />
        <NewsList />
      </div>
    </PermissionGate>
  );
}
