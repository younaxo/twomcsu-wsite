import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/cn';

/// Неготовый раздел («Скоро»): не ссылка и не кнопка — без href и role=link,
/// курсор cursor-not-allowed, aria-disabled="true", скринридер читает «Скоро».
export const SoonItem = forwardRef<
  HTMLSpanElement,
  ComponentPropsWithoutRef<'span'> & {
    /// Видимая метка «скоро» (в узких местах — только для скринридера).
    badge?: boolean;
  }
>(({ children, className, badge = true, ...rest }, ref) => (
  <span
    {...rest}
    ref={ref}
    aria-disabled="true"
    data-soon="true"
    className={cn('cursor-not-allowed text-muted-foreground/70', className)}
  >
    {children}
    {badge ? (
      <span
        aria-hidden
        className="ml-1 rounded-sm bg-muted px-1 text-[10px] uppercase tracking-wide text-subtle-foreground"
      >
        скоро
      </span>
    ) : null}
    <span className="sr-only"> — Скоро</span>
  </span>
));
SoonItem.displayName = 'SoonItem';
