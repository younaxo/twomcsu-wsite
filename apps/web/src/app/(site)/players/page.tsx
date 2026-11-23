'use client';

import { Search, SearchX, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api/errors';
import {
  isSearchableQuery,
  normalizePlayerQuery,
  PLAYER_SEARCH_MIN_LENGTH,
  useDebouncedValue,
  usePlayerSearch,
} from '@/lib/profile/player-search';

/// «Игроки» (план 1.4, Q73): поиск по нику среди открытых профилей. Закрытые
/// и «только друзьям» сервер в выдачу не включает. Запрос идёт после паузы
/// набора и только от 2 символов; 429 — отдельное понятное состояние.
export default function PlayersPage() {
  const [value, setValue] = useState('');
  const debounced = useDebouncedValue(value);
  const search = usePlayerSearch(debounced);
  const typed = normalizePlayerQuery(value);
  const searchable = isSearchableQuery(debounced);
  const tooShort = typed.length > 0 && typed.length < PLAYER_SEARCH_MIN_LENGTH;
  const rateLimited = search.error instanceof ApiError && search.error.status === 429;
  const items = searchable ? (search.data?.items ?? []) : [];

  let status = '';
  if (searchable && search.isSuccess) {
    status = items.length ? `Найдено игроков: ${items.length}` : 'Ничего не найдено';
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-2">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Игроки</h1>
        <p className="text-sm text-muted-foreground">Поиск по нику среди открытых профилей.</p>
      </header>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="player-search" className="text-sm font-medium">
          Ник игрока
        </label>
        <Input
          id="player-search"
          type="search"
          inputMode="search"
          autoComplete="off"
          maxLength={32}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          leading={<Search aria-hidden className="size-4" />}
          placeholder="Например, Steve"
          aria-describedby="player-search-hint"
        />
        <p id="player-search-hint" className="text-xs text-muted-foreground">
          {tooShort
            ? `Введите минимум ${PLAYER_SEARCH_MIN_LENGTH} символа.`
            : 'Профили, закрытые владельцем, в поиске не показываются.'}
        </p>
      </div>

      <p role="status" aria-live="polite" className="sr-only" data-testid="players-status">
        {status}
      </p>

      {!searchable ? (
        <EmptyState
          icon={<Users aria-hidden />}
          title="Найдите игрока"
          description={`Введите минимум ${PLAYER_SEARCH_MIN_LENGTH} символа ника.`}
        />
      ) : rateLimited ? (
        <ErrorState
          title="Слишком много запросов"
          description="Подождите минуту и повторите поиск."
          onRetry={() => void search.refetch()}
        />
      ) : search.isError ? (
        <ErrorState error={search.error} onRetry={() => void search.refetch()} />
      ) : search.isPending ? (
        <SkeletonRows rows={3} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<SearchX aria-hidden />}
          title="Ничего не найдено"
          description="Проверьте ник. Закрытые профили в поиске не показываются."
        />
      ) : (
        <ul className="flex flex-col gap-2" data-testid="players-results">
          {items.map((item) => (
            <li key={item.username}>
              <Link
                href={`/u/${encodeURIComponent(item.username)}`}
                className="flex min-h-14 items-center gap-3 rounded-lg bg-surface p-3 transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Avatar src={item.avatar} name={item.username} size="md" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{item.username}</span>
                  {item.tag ? (
                    <span className="truncate text-xs text-muted-foreground">{item.tag}</span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
