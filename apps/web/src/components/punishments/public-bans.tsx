'use client';

import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Gavel, Search } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { DescriptionItem, DescriptionList, PageHeader } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SkeletonRows } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime } from '@/lib/format';
import {
  KIND_LABELS,
  NAME_SEARCH_PATTERN,
  PUBLIC_REF_PATTERN,
  fetchPublicOne,
  fetchPublicPage,
  type PublicFilters,
  type PublicPunishmentView,
} from '@/lib/punishments/view';
import {
  ExecutorText,
  PunishmentsErrorState,
  ScopeText,
  StaleNote,
  StatusBadge,
  TermText,
} from './punishment-ui';

const DEFAULT_FILTERS: PublicFilters = { kind: 'ALL', status: 'ALL', name: '', order: 'desc' };

const KIND_OPTIONS = [
  { value: 'ALL', label: 'Все' },
  { value: 'BAN', label: 'Баны' },
  { value: 'MUTE', label: 'Муты' },
];
const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Все' },
  { value: 'active', label: 'Действуют' },
  { value: 'ended', label: 'Завершены' },
];

/// Ссылка на карточку `/bans/<ref>` только для ref допустимого формата.
function RefLink({ item }: { item: PublicPunishmentView }) {
  return PUBLIC_REF_PATTERN.test(item.ref) ? (
    <Link
      href={`/bans/${item.ref}`}
      className="rounded-sm font-medium text-primary-soft-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {item.subjectName}
    </Link>
  ) : (
    <span className="font-medium">{item.subjectName}</span>
  );
}

/// Публичный банлист `/bans` (без входа): баны и муты, поиск по префиксу ника,
/// фильтры, курсорная пагинация. Ник ищется по кнопке «Найти», а не на каждый
/// символ: у публичного API лимит 60 запросов в минуту.
export function PublicBansList() {
  const [filters, setFilters] = useState<PublicFilters>(DEFAULT_FILTERS);
  const [draftName, setDraftName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const query = useInfiniteQuery({
    queryKey: ['punishments', 'public', filters],
    queryFn: ({ pageParam, signal }) => fetchPublicPage(filters, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = draftName.trim();
    if (name && !NAME_SEARCH_PATTERN.test(name)) {
      setNameError('Ник: от 3 до 16 символов, латиница, цифры, «_» и «.».');
      return;
    }
    setNameError(null);
    setFilters((current) => ({ ...current, name }));
  };

  const reset = () => {
    setDraftName('');
    setNameError(null);
    setFilters(DEFAULT_FILTERS);
  };

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const stale = query.data?.pages.some((page) => page.meta.stale) ?? false;
  const dirty =
    filters.name !== '' || filters.kind !== 'ALL' || filters.status !== 'ALL' || draftName !== '';

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-8 md:px-6">
      <PageHeader
        title="Список наказаний"
        description="Баны и муты на серверах twomc.su. Причины и сроки показываются так, как их передаёт сервер."
      />

      <form
        onSubmit={submit}
        role="search"
        aria-label="Поиск по списку наказаний"
        className="flex flex-col gap-4 rounded-xl bg-surface p-4 shadow-sm"
      >
        <div className="flex flex-wrap items-start gap-3">
          <Field
            label="Ник игрока"
            hint="Начало ника, от 3 символов"
            error={nameError}
            className="w-full sm:w-64"
          >
            <Input
              type="search"
              name="name"
              value={draftName}
              maxLength={16}
              autoComplete="off"
              spellCheck={false}
              leading={<Search aria-hidden className="size-4" />}
              onChange={(event) => setDraftName(event.target.value)}
            />
          </Field>
          <div className="flex items-center gap-2 pt-[1.625rem]">
            <Button type="submit" loading={query.isFetching && !query.isFetchingNextPage}>
              Найти
            </Button>
            {dirty ? (
              <Button type="button" variant="ghost" onClick={reset}>
                Сбросить
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <span id="bans-kind-label" className="text-sm font-medium">
              Тип
            </span>
            <SegmentedControl
              aria-labelledby="bans-kind-label"
              options={KIND_OPTIONS}
              value={filters.kind}
              onValueChange={(value) =>
                setFilters((current) => ({ ...current, kind: value as PublicFilters['kind'] }))
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span id="bans-status-label" className="text-sm font-medium">
              Статус
            </span>
            <SegmentedControl
              aria-labelledby="bans-status-label"
              options={STATUS_OPTIONS}
              value={filters.status}
              onValueChange={(value) =>
                setFilters((current) => ({ ...current, status: value as PublicFilters['status'] }))
              }
            />
          </div>
        </div>
      </form>

      <StaleNote stale={stale} />

      {query.isPending ? (
        <div aria-busy aria-live="polite">
          <span className="sr-only">Загрузка списка наказаний</span>
          <SkeletonRows rows={6} />
        </div>
      ) : query.isError && items.length === 0 ? (
        <PunishmentsErrorState
          error={query.error}
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
          unavailableTitle="Список наказаний временно недоступен"
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Gavel />}
          title="Ничего не найдено"
          description="По этим условиям наказаний нет. Измените ник или фильтры."
          role="status"
        />
      ) : (
        <>
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
            Показано записей: {items.length}
          </p>
          <Table data-testid="bans-table">
            <TableCaption className="sr-only">
              Наказания: игрок, тип, статус, причина, срок, выдавший, область и дата выдачи
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Игрок</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Причина</TableHead>
                <TableHead>Срок</TableHead>
                <TableHead>Выдавший</TableHead>
                <TableHead>Область</TableHead>
                <TableHead
                  sortable
                  sortDirection={filters.order}
                  onSort={() =>
                    setFilters((current) => ({
                      ...current,
                      order: current.order === 'desc' ? 'asc' : 'desc',
                    }))
                  }
                >
                  Выдано
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.ref} data-testid="ban-row">
                  <TableHead scope="row" className="text-sm text-foreground">
                    <RefLink item={item} />
                  </TableHead>
                  <TableCell>{KIND_LABELS[item.kind]}</TableCell>
                  <TableCell>
                    <StatusBadge status={item.status} />
                  </TableCell>
                  <TableCell className="min-w-40 max-w-xs break-words">
                    {item.reasonLabel}
                  </TableCell>
                  <TableCell>
                    <TermText item={item} />
                  </TableCell>
                  <TableCell>
                    <ExecutorText executor={item.executor} />
                  </TableCell>
                  <TableCell>
                    <ScopeText scope={item.scope} />
                  </TableCell>
                  <TableCell>
                    <time dateTime={item.startedAt}>{formatDateTime(item.startedAt)}</time>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
              className="self-center"
              onClick={() => query.fetchNextPage()}
              loading={query.isFetchingNextPage}
            >
              Показать ещё
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

/// Карточка одного наказания `/bans/<ref>`.
export function PublicBanCard({ reference }: { reference: string }) {
  const valid = PUBLIC_REF_PATTERN.test(reference);
  const query = useQuery({
    queryKey: ['punishments', 'public', 'one', reference],
    queryFn: ({ signal }) => fetchPublicOne(reference, signal),
    enabled: valid,
    staleTime: 15_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const item = query.data?.item ?? null;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8 md:px-6">
      <Link
        href="/bans"
        className="inline-flex items-center gap-1.5 self-start rounded-sm text-sm font-medium text-primary-soft-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowLeft aria-hidden className="size-4" />К списку наказаний
      </Link>
      {!valid ? (
        <EmptyState icon={<Gavel />} title="Наказание не найдено" role="status" />
      ) : query.isPending ? (
        <div aria-busy aria-live="polite">
          <span className="sr-only">Загрузка наказания</span>
          <SkeletonRows rows={4} />
        </div>
      ) : query.isError ? (
        <PunishmentsErrorState
          error={query.error}
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      ) : !item ? (
        <EmptyState icon={<Gavel />} title="Наказание не найдено" role="status" />
      ) : (
        <article
          aria-labelledby="ban-card-title"
          className="flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-sm"
          data-testid="ban-card"
        >
          <div className="flex flex-wrap items-center gap-3">
            <h1 id="ban-card-title" className="font-display text-2xl font-bold tracking-tight">
              {item.subjectName}
            </h1>
            <StatusBadge status={item.status} />
          </div>
          <StaleNote stale={query.data?.meta.stale ?? false} />
          <DescriptionList>
            <DescriptionItem term="Тип">{KIND_LABELS[item.kind]}</DescriptionItem>
            <DescriptionItem term="Причина">{item.reasonLabel}</DescriptionItem>
            <DescriptionItem term="Выдано">
              <time dateTime={item.startedAt}>{formatDateTime(item.startedAt)}</time>
            </DescriptionItem>
            <DescriptionItem term="Срок">
              <TermText item={item} />
            </DescriptionItem>
            <DescriptionItem term="Выдавший">
              <ExecutorText executor={item.executor} />
            </DescriptionItem>
            <DescriptionItem term="Область">
              <ScopeText scope={item.scope} />
            </DescriptionItem>
          </DescriptionList>
        </article>
      )}
    </div>
  );
}
