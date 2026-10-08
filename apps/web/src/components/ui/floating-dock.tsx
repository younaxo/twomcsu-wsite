'use client';

import Link from 'next/link';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface FloatingDockItem {
  id: string;
  /// Подпись: aria-label и видимая подсказка при hover/focus.
  label: string;
  icon: ReactNode;
  /// Ссылка (next/link) — либо `onClick` для действия.
  href?: string;
  onClick?: () => void;
  active?: boolean;
  /// Счётчик/метка в углу (непрочитанные, уведомления).
  badge?: ReactNode;
  disabled?: boolean;
}

export interface FloatingDockProps extends HTMLAttributes<HTMLElement> {
  items: FloatingDockItem[];
  /// Доступное имя панели.
  label?: string;
}

const itemClassName = cn(
  'group relative flex size-11 shrink-0 items-center justify-center rounded text-muted-foreground',
  'transition-colors duration-fast hover:bg-muted hover:text-foreground active:bg-surface-sunken',
  'disabled:pointer-events-none disabled:opacity-50',
  'data-[active]:bg-primary-soft data-[active]:text-primary-soft-foreground data-[active]:hover:bg-primary-soft',
  '[&_svg]:size-5 [&_svg]:shrink-0',
);

/// Нижняя плавающая панель иконок: mobile-навигация или quick actions.
/// Подписи видимы при hover/focus (не через `title`), активный пункт —
/// `bg-primary-soft` + `aria-current`.
export function FloatingDock({
  items,
  label = 'Быстрые действия',
  className,
  ...props
}: FloatingDockProps) {
  return (
    <nav
      aria-label={label}
      className={cn(
        'fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-40 max-w-[calc(100vw-2rem)] -translate-x-1/2',
        'rounded-lg glass-liquid p-1',
        className,
      )}
      {...props}
    >
      <ul className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
        {items.map((item) => {
          const badgeText =
            typeof item.badge === 'string' || typeof item.badge === 'number'
              ? ` (${item.badge})`
              : '';
          const content = (
            <>
              <span aria-hidden className="inline-flex">
                {item.icon}
              </span>
              {item.badge !== undefined && item.badge !== null ? (
                <span
                  aria-hidden
                  className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-none text-primary-foreground tabular"
                >
                  {item.badge}
                </span>
              ) : null}
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap',
                  'rounded-sm glass-frosted-strong px-2 py-1 text-xs text-foreground',
                  'opacity-0 transition-opacity duration-fast group-hover:opacity-100 group-focus-visible:opacity-100',
                )}
              >
                {item.label}
              </span>
            </>
          );
          return (
            <li key={item.id} className="shrink-0">
              {item.href && !item.disabled ? (
                <Link
                  href={item.href}
                  aria-label={`${item.label}${badgeText}`}
                  aria-current={item.active ? 'page' : undefined}
                  data-active={item.active || undefined}
                  onClick={item.onClick}
                  className={itemClassName}
                >
                  {content}
                </Link>
              ) : (
                <button
                  type="button"
                  aria-label={`${item.label}${badgeText}`}
                  aria-current={item.active ? 'true' : undefined}
                  data-active={item.active || undefined}
                  disabled={item.disabled}
                  onClick={item.onClick}
                  className={itemClassName}
                >
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
