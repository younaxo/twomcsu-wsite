'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { api } from '@/lib/api/client';
import { publicErrorMessage } from '@/lib/api/safe-error';
import type { PlayerSearchItem, PlayerSearchResult } from '@/lib/profile/player-search';
import {
  applyMention,
  findMentionToken,
  MENTION_MIN_LENGTH,
  type MentionToken,
} from './mention-token';

export const MENTION_DEBOUNCE_MS = 250;
const MENTION_LIMIT = 8;

type Candidate = PlayerSearchItem & { hidden?: boolean; banned?: boolean };

export interface UseMentionAutocompleteOptions {
  value: string;
  /// Вставка нового текста: хук сам не владеет значением поля.
  commit: (next: string, caret: number) => void;
  debounceMs?: number;
}

/// Автодополнение `@ник` для текстовых полей: токен определяется по курсору,
/// поиск — `GET /users/search` с задержкой и отменой устаревших запросов.
export function useMentionAutocomplete({
  value,
  commit,
  debounceMs = MENTION_DEBOUNCE_MS,
}: UseMentionAutocompleteOptions) {
  const baseId = useId();
  const listboxId = `${baseId}-mentions`;
  const [caret, setCaret] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [items, setItems] = useState<PlayerSearchItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const token: MentionToken | null = findMentionToken(value, caret);
  const query = token && token.query.length >= MENTION_MIN_LENGTH ? token.query : null;
  const tokenStart = token?.start ?? null;
  const dismissed = tokenStart !== null && dismissedAt === tokenStart;

  useEffect(() => {
    if (query === null || dismissed) {
      setItems([]);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .get<PlayerSearchResult>('/users/search', {
          query: { q: query, limit: MENTION_LIMIT },
          signal: controller.signal,
        })
        .then((result) => {
          if (controller.signal.aborted) return;
          setItems((result.items as Candidate[]).filter((i) => !i.hidden && !i.banned));
          setActiveIndex(0);
          setError(null);
        })
        .catch((e: unknown) => {
          if (controller.signal.aborted) return;
          setItems([]);
          setError(publicErrorMessage(e, 'Не удалось найти игроков.'));
        });
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, dismissed, debounceMs]);

  const open = query !== null && !dismissed && (items.length > 0 || error !== null);

  const select = useCallback(
    (item: PlayerSearchItem) => {
      if (!token) return;
      const next = applyMention(value, token, item.username);
      setItems([]);
      setCaret(next.caret);
      commit(next.value, next.caret);
    },
    [token, value, commit],
  );

  const close = useCallback(() => setDismissedAt(tokenStart), [tokenStart]);

  /// Возвращает true, если клавиша обработана списком (родитель её не обрабатывает).
  const handleKeyDown = useCallback(
    (event: { key: string; shiftKey?: boolean; preventDefault: () => void }) => {
      if (!open) return false;
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return true;
      }
      if (items.length === 0) return false;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((i) => (i - 1 + items.length) % items.length);
        return true;
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
        event.preventDefault();
        const item = items[activeIndex];
        if (item) select(item);
        return true;
      }
      return false;
    },
    [open, items, activeIndex, select, close],
  );

  const optionId = (index: number) => `${baseId}-opt-${index}`;
  const activeOptionId = open && items.length > 0 ? optionId(activeIndex) : undefined;

  return {
    open,
    items,
    error,
    activeIndex,
    setActiveIndex,
    listboxId,
    optionId,
    activeOptionId,
    setCaret,
    select,
    close,
    handleKeyDown,
  };
}
