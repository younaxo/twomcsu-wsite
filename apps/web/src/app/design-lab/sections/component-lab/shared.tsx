'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { demoUsers } from '../../demo-data';

/// Общие кирпичи Component lab: сетка, карточка демо-блока, строки
/// контролов/результата, безопасные таймеры и производные от demo-data.

/// Сетка демо-блоков: одна колонка на телефоне, две на md, три на xl.
export function DemoGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-gap md:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

export interface DemoBlockProps {
  title: string;
  /// Когда компонент уместен.
  use: string;
  /// Когда НЕ использовать / что взять вместо него.
  avoid?: string;
  /// Занять две колонки (на md+) или всю ширину сетки (таблицы, матрицы).
  span?: 2 | 3;
  className?: string;
  children: ReactNode;
}

const spanClass: Record<NonNullable<DemoBlockProps['span']>, string> = {
  2: 'md:col-span-2',
  3: 'md:col-span-2 xl:col-span-3',
};

/// Карточка одного демо: название, «когда/не для», живой пример.
export function DemoBlock({ title, use, avoid, span, className, children }: DemoBlockProps) {
  return (
    <Card
      variant="flat"
      className={cn('flex min-w-0 flex-col gap-4', span ? spanClass[span] : null, className)}
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold leading-tight">{title}</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Когда: </span>
          {use}
        </p>
        {avoid ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Не для: </span>
            {avoid}
          </p>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">{children}</div>
    </Card>
  );
}

/// Горизонтальный ряд контролов с переносом на узком экране.
export function DemoRow({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex flex-wrap items-center gap-2', className)}>{children}</div>;
}

/// Строка-результат под демо («Выбрано: …»); объявляется screen reader'ом.
export function DemoResult({ children }: { children: ReactNode }) {
  return (
    <p aria-live="polite" className="text-xs text-muted-foreground">
      {children}
    </p>
  );
}

/// Имитация запроса для toast.promise / ConfirmDialog / Wizard.
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/// Таймеры, которые снимаются при размонтировании блока (и по `clearAll`),
/// чтобы демо не обновляло state после ухода с вкладки.
export function useTimers() {
  const timersRef = useRef(new Set<number>());

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
    };
  }, []);

  const after = useCallback((ms: number, fn: () => void): number => {
    const id = window.setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
    return id;
  }, []);

  const clearAll = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current.clear();
  }, []);

  return { after, clearAll };
}

/* ---------- Производные от demo-data (цвета ролей, списки ролей) ---------- */

/// Уникальные цвета ролей из demoUsers — presets для ColorPicker.
export const ROLE_COLORS: string[] = Array.from(
  new Set(demoUsers.map((user) => user.roleColor).filter((color): color is string => !!color)),
);

/// Подписи presets: hex → название роли (первой встреченной).
export const ROLE_COLOR_LABELS: Record<string, string> = demoUsers.reduce<Record<string, string>>(
  (acc, user) => {
    if (user.roleColor && !(user.roleColor in acc)) {
      acc[user.roleColor] = user.role;
    }
    return acc;
  },
  {},
);

/// Уникальные роли из demoUsers — для MultiSelect/подменю.
export const ROLE_NAMES: string[] = Array.from(new Set(demoUsers.map((user) => user.role)));
