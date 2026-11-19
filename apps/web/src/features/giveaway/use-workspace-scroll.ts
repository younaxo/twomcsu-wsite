'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from './hooks';

/// Рабочая область внизу страницы: цель всех якорей «Получить код».
export const WORKSPACE_ID = 'gw-workspace';
export const WORKSPACE_HASH = `#${WORKSPACE_ID}`;
/// Сколько держится мягкая подсветка (потом фон плавно возвращается).
export const HIGHLIGHT_MS = 900;

/// `scroll-behavior: smooth` на время жизни страницы розыгрыша; при
/// prefers-reduced-motion не включается. Прежнее значение возвращается при уходе.
export function useSmoothScroll(): void {
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = reduced ? 'auto' : 'smooth';
    return () => {
      root.style.scrollBehavior = previous;
    };
  }, [reduced]);
}

/// Любой якорь `#gw-workspace` (и вызов `goToWorkspace`): плавная прокрутка к рабочей
/// области, фокус в неё (a11y) и краткая подсветка фона. При prefers-reduced-motion
/// прокрутка мгновенная, подсветки нет. Работает и для кнопок с другим действием.
export function useWorkspaceNavigation(): { highlighted: boolean; goToWorkspace: () => void } {
  const reduced = usePrefersReducedMotion();
  const [highlighted, setHighlighted] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goToWorkspace = useCallback(() => {
    const el = document.getElementById(WORKSPACE_ID);
    if (!el) return;
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }
    el.focus({ preventScroll: true });
    if (reduced) return;
    setHighlighted(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHighlighted(false), HIGHLIGHT_MS);
  }, [reduced]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest(`a[href="${WORKSPACE_HASH}"]`)) return;
      event.preventDefault();
      goToWorkspace();
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [goToWorkspace]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { highlighted, goToWorkspace };
}
