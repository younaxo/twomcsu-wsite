import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface BreadcrumbItem {
  label: ReactNode;
  /// Без href — текущая страница (aria-current).
  href?: string;
}

export interface BreadcrumbsProps extends HTMLAttributes<HTMLElement> {
  items: BreadcrumbItem[];
}

/// Хлебные крошки: настоящие ссылки (Cmd-click работает), последний элемент — текущий.
export function Breadcrumbs({ items, className, ...props }: BreadcrumbsProps) {
  return (
    <nav aria-label="Навигация по разделам" className={cn('text-sm', className)} {...props}>
      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-muted-foreground">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={index} className="flex min-w-0 items-center gap-1">
              {index > 0 ? (
                <ChevronRight aria-hidden className="size-3.5 shrink-0 text-subtle-foreground" />
              ) : null}
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="truncate rounded-sm px-0.5 hover:text-foreground hover:underline underline-offset-4"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? 'page' : undefined}
                  className={cn('truncate px-0.5', last && 'font-medium text-foreground')}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
