'use client';

import { useSyncExternalStore } from 'react';

/// Подписка на media query без useEffect-мерцания (useSyncExternalStore).
/// На сервере и при первом рендере — `defaultValue`.
export function useMediaQuery(query: string, defaultValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined') {
        return () => undefined;
      }
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => (typeof window === 'undefined' ? defaultValue : window.matchMedia(query).matches),
    () => defaultValue,
  );
}

/// Узкий экран (< 768px) — для выбора mobile-паттерна overlay:
/// dropdown → bottom sheet, большой dialog → sheet, context menu → action sheet.
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}

/// Основной указатель — палец: hover-подсказки недоступны, нужны touch-target ≥ 44px.
export function useIsCoarsePointer(): boolean {
  return useMediaQuery('(pointer: coarse)');
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
