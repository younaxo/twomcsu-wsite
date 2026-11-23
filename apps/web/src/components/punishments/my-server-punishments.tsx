'use client';

import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { Link2, ServerOff } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageSection } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SkeletonRows } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/format';
import {
  KIND_LABELS,
  fetchMyPage,
  type MyFilters,
  type MyPunishmentView,
} from '@/lib/punishments/view';
import {
  ExecutorText,
  PunishmentsErrorState,
  ScopeText,
  StaleNote,
  StatusBadge,
  TermText,
} from './punishment-ui';

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Все' },
  { value: 'active', label: 'Действуют' },
  { value: 'ended', label: 'Завершены' },
];

function MyPunishmentItem({ item }: { item: MyPunishmentView }) {
  return (
    <li
      data-status={item.status}
      data-testid="server-punishment"
      className="flex flex-col gap-2 rounded-xl bg-surface p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{KIND_LABELS[item.kind]}</span>
        <StatusBadge status={item.status} />
        <span className="text-xs text-muted-foreground">
          <ScopeText scope={item.scope} />
        </span>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Причина</p>
        {item.reason ? (
          <p className="whitespace-pre-wrap break-words text-sm">{item.reason}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Причина не указана</p>
        )}
        {item.reasonMasked ? (
          <p className="mt-1 text-xs text-subtle-foreground">
            Часть текста скрыта автоматически (отмечена как «[скрыто]»).
          </p>
        ) : null}
      </div>
      <dl className="grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
        <div>
          <dt className="inline">Выдано: </dt>
          <dd className="inline">
            <time dateTime={item.startedAt}>{formatDateTime(item.startedAt)}</time>
          </dd>
        </div>
        <div>
          <dt className="inline">Срок: </dt>
          <dd className="inline">
            <TermText item={item} />
          </dd>
        </div>
        <div>
          <dt className="inline">Выдавший: </dt>
          <dd className="inline">
            <ExecutorText executor={item.executor} />
          </dd>
        </div>
      </dl>
      {item.status === 'ACTIVE' && (item.kind === 'BAN' || item.kind === 'MUTE') ? (
        <div className="flex flex-col items-start gap-1" data-testid="server-punishment-appeal">
          <Button asChild variant="secondary" size="sm">
            <Link
              href="/support/new/other"
              aria-label={`Подать обращение по наказанию: ${KIND_LABELS[item.kind]}, номер ${item.ref}`}
            >
              Подать обращение
            </Link>
          </Button>
          <p className="text-xs text-muted-foreground">Укажите номер наказания: {item.ref}</p>
        </div>
      ) : null}
    </li>
  );
}

/// «Настройки → Наказания → Наказания на серверах»: история игрока из зеркала
/// LiteBans (`GET /punishments/me`, этап 02 срез 2). Отдельно от наказаний на
/// сайте. Игрок видит полный очищенный текст причины. Раздел обжалования для
/// зеркальных наказаний не показывается: API отдаёт `appealable: false`.
export function MyServerPunishments() {
  const [filters, setFilters] = useState<MyFilters>({ status: 'ALL' });
  const query = useInfiniteQuery({
    queryKey: ['punishments', 'me', filters],
    queryFn: ({ pageParam, signal }) => fetchMyPage(filters, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const first = query.data?.pages[0];
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const stale = query.data?.pages.some((page) => page.meta.stale) ?? false;

  return (
    <PageSection
      aria-labelledby="server-punishments-title"
      title={<span id="server-punishments-title">Наказания на серверах</span>}
      description="Баны, муты, предупреждения и кики на игровых серверах. Наказания на сайте — выше."
    >
      {query.isPending ? (
        <div aria-busy aria-live="polite">
          <span className="sr-only">Загрузка наказаний на серверах</span>
          <SkeletonRows rows={3} />
        </div>
      ) : query.isError && !first ? (
        <PunishmentsErrorState
          error={query.error}
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
          size="sm"
        />
      ) : first && !first.linked ? (
        <EmptyState
          size="sm"
          icon={<Link2 />}
          title="Minecraft-аккаунт не привязан"
          description="Привяжите игровой аккаунт, чтобы увидеть наказания на серверах."
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/settings/linked-accounts">Привязать аккаунт</Link>
            </Button>
          }
        />
      ) : (
        <>
          <SegmentedControl
            aria-label="Статус наказаний на серверах"
            size="sm"
            className="self-start"
            options={STATUS_OPTIONS}
            value={filters.status}
            onValueChange={(value) => setFilters({ status: value as MyFilters['status'] })}
          />
          <StaleNote stale={stale} />
          {items.length === 0 ? (
            <EmptyState
              size="sm"
              icon={<ServerOff />}
              title="На серверах наказаний нет"
              description="По выбранному фильтру записей нет."
              role="status"
            />
          ) : (
            <ul className="flex flex-col gap-3" data-testid="server-punishments">
              {items.map((item) => (
                <MyPunishmentItem key={item.ref} item={item} />
              ))}
            </ul>
          )}
          {query.isFetchNextPageError ? (
            <PunishmentsErrorState
              size="sm"
              error={query.error}
              onRetry={() => query.fetchNextPage()}
              retrying={query.isFetchingNextPage}
            />
          ) : query.hasNextPage ? (
            <Button
              variant="secondary"
              className="self-start"
              onClick={() => query.fetchNextPage()}
              loading={query.isFetchingNextPage}
            >
              Показать ещё
            </Button>
          ) : null}
        </>
      )}
    </PageSection>
  );
}
