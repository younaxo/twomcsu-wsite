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
  /// Лимит длины поля: вставка, которая его превысит, не выполняется.
  maxLength?: number;
}

/// Результат поиска хранится вместе с запросом, для которого получен: при смене
/// запроса прежние варианты не показываются и не выбираются.
interface SearchResult {
  query: string;
  items: PlayerSearchItem[];
  error: string | null;
}

/// Закрытие списка по Esc привязано к позиции `@` и тексту до неё включительно.
interface Dismissal {
  start: number;
  prefix: string;
}

export const MENTION_NO_ROOM_MESSAGE = 'Не хватает места для ника в поле.';
export const MENTION_EMPTY_MESSAGE = 'Игроки не найдены.';

/// Автодополнение `@ник` для текстовых полей: токен определяется по курсору,
/// поиск — `GET /users/search` с задержкой и отменой устаревших запросов.
export function useMentionAutocomplete({
  value,
  commit,
  debounceMs = MENTION_DEBOUNCE_MS,
  maxLength,
}: UseMentionAutocompleteOptions) {
  const baseId = useId();
  const listboxId = `${baseId}-mentions`;
  const [caret, setCaret] = useState(0);
  const [dismissal, setDismissal] = useState<Dismissal | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const token: MentionToken | null = findMentionToken(value, caret);
  const query = token && token.query.length >= MENTION_MIN_LENGTH ? token.query : null;
  const tokenStart = token?.start ?? null;
  const dismissed =
    dismissal !== null &&
    tokenStart !== null &&
    dismissal.start === tokenStart &&
    value.slice(0, tokenStart + 1) === dismissal.prefix;

  // Сброс закрытия: токен исчез (в том числе после отправки — поле пусто)
  // или изменился текст до `@` включительно.
  useEffect(() => {
    if (dismissal !== null && !dismissed) setDismissal(null);
  }, [dismissal, dismissed]);

  useEffect(() => {
    setNotice(null);
    if (query === null || dismissed) {
      setResult(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .get<PlayerSearchResult>('/users/search', {
          query: { q: query, limit: MENTION_LIMIT },
          signal: controller.signal,
        })
        .then((response) => {
          if (controller.signal.aborted) return;
          const items = (response.items as Candidate[]).filter((i) => !i.hidden && !i.banned);
          setResult({ query, items, error: null });
          setActiveIndex(0);
        })
        .catch((e: unknown) => {
          if (controller.signal.aborted) return;
          setResult({
            query,
            items: [],
            error: publicErrorMessage(e, 'Не удалось найти игроков.'),
          });
        });
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, dismissed, debounceMs]);

  // Только результат текущего запроса (в окне debounce — пусто).
  const current = query !== null && !dismissed && result?.query === query ? result : null;
  const items = current?.items ?? [];
  const error = current?.error ?? null;
  const open = items.length > 0 || error !== null;
  const status =
    notice ??
    error ??
    (current && items.length === 0 ? MENTION_EMPTY_MESSAGE : null) ??
    (items.length > 0 ? `Найдено игроков: ${items.length}` : null);

  const select = useCallback(
    (item: PlayerSearchItem) => {
      if (!token) return;
      const next = applyMention(value, token, item.username);
      if (maxLength !== undefined && next.value.length > maxLength) {
        // Безопасный вариант: текст не трогаем, сообщаем через live-region.
        setNotice(MENTION_NO_ROOM_MESSAGE);
        return;
      }
      setResult(null);
      setCaret(next.caret);
      commit(next.value, next.caret);
    },
    [token, value, commit, maxLength],
  );

  const close = useCallback(() => {
    if (tokenStart === null) return;
    setDismissal({ start: tokenStart, prefix: value.slice(0, tokenStart + 1) });
  }, [tokenStart, value]);

  /// Возвращает true, если клавиша обработана списком (родитель её не обрабатывает).
  /// Пока список не открыт (окно debounce, загрузка, пусто), клавиши идут родителю:
  /// Enter отправляет сообщение, Tab переводит фокус. Устаревший ник не вставляется.
  const handleKeyDown = useCallback(
    (event: {
      key: string;
      shiftKey?: boolean;
      isComposing?: boolean;
      keyCode?: number;
      preventDefault: () => void;
    }) => {
      if (event.isComposing || event.keyCode === 229) return false;
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
  const activeOptionId =
    open && items.length > 0 && items[activeIndex] ? optionId(activeIndex) : undefined;

  return {
    open,
    status,
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
