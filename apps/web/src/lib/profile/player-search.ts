'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';

/// Поиск игроков по нику (Q73, ADR-0192): только открытые профили, публичные поля.
export interface PlayerSearchItem {
  username: string;
  tag: string | null;
  avatar: string | null;
}

export interface PlayerSearchResult {
  items: PlayerSearchItem[];
  page: number;
  limit: number;
  hasMore: boolean;
}

export const PLAYER_SEARCH_MIN_LENGTH = 2;

/// Запрос после обрезки пробелов; короче минимума — поиск не выполняется.
export function normalizePlayerQuery(value: string): string {
  return value.trim();
}

export function isSearchableQuery(value: string): boolean {
  return normalizePlayerQuery(value).length >= PLAYER_SEARCH_MIN_LENGTH;
}

export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function usePlayerSearch(query: string) {
  const q = normalizePlayerQuery(query);
  return useQuery({
    queryKey: ['players', 'search', q.toLowerCase()],
    queryFn: () => api.get<PlayerSearchResult>('/users/search', { query: { q, limit: 20 } }),
    enabled: q.length >= PLAYER_SEARCH_MIN_LENGTH,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 30_000,
  });
}
