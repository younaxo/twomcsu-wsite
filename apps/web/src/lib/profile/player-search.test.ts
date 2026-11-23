import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  isSearchableQuery,
  normalizePlayerQuery,
  PLAYER_SEARCH_MIN_LENGTH,
  useDebouncedValue,
} from './player-search';

describe('player-search (Q73)', () => {
  it('минимум 2 символа после обрезки пробелов', () => {
    expect(PLAYER_SEARCH_MIN_LENGTH).toBe(2);
    expect(normalizePlayerQuery('  Steve ')).toBe('Steve');
    expect(isSearchableQuery(' a ')).toBe(false);
    expect(isSearchableQuery('  ab')).toBe(true);
    expect(isSearchableQuery('')).toBe(false);
  });

  it('debounce сразу отдаёт начальное значение', () => {
    const { result } = renderHook(() => useDebouncedValue('x'));
    expect(result.current).toBe('x');
  });
});
