'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { forwardRef, useId, type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { Button, IconButton } from './button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

/// Pagination — постраничная навигация списков (игроки, логи, транзакции).
/// Состояние страницы хранит вызывающий код (URL/запрос); компонент только
/// рисует и сообщает о смене страницы.

export type PaginationItem = number | 'dots-start' | 'dots-end';

function range(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => from + index);
}

/// Номера страниц с многоточиями: всегда первая/последняя, вокруг текущей —
/// `siblingCount` соседей с каждой стороны.
export function getPaginationRange(
  page: number,
  totalPages: number,
  siblingCount = 1,
): PaginationItem[] {
  const total = Math.max(1, totalPages);
  const current = Math.min(Math.max(1, page), total);
  // первая + последняя + текущая + 2 многоточия + соседи
  const slots = siblingCount * 2 + 5;
  if (total <= slots) {
    return range(1, total);
  }
  const left = Math.max(current - siblingCount, 1);
  const right = Math.min(current + siblingCount, total);
  const showStartDots = left > 2;
  const showEndDots = right < total - 1;
  const edgeCount = 3 + siblingCount * 2;
  if (!showStartDots && showEndDots) {
    return [...range(1, edgeCount), 'dots-end', total];
  }
  if (showStartDots && !showEndDots) {
    return [1, 'dots-start', ...range(total - edgeCount + 1, total)];
  }
  return [1, 'dots-start', ...range(left, right), 'dots-end', total];
}

export interface PaginationProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  /// Текущая страница, с 1.
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /// Сколько соседних номеров показывать с каждой стороны от текущей.
  siblingCount?: number;
  size?: 'sm' | 'md';
  /// Доступное имя навигации (несколько пагинаций на странице — разные имена).
  label?: string;
}

export const Pagination = forwardRef<HTMLElement, PaginationProps>(
  (
    {
      page,
      totalPages,
      onPageChange,
      siblingCount = 1,
      size = 'md',
      label = 'Пагинация',
      className,
      ...props
    },
    ref,
  ) => {
    const total = Math.max(1, totalPages);
    const current = Math.min(Math.max(1, page), total);
    const items = getPaginationRange(current, total, siblingCount);
    const minWidth = size === 'sm' ? 'min-w-[var(--control-h-sm)]' : 'min-w-[var(--control-h)]';

    return (
      <nav
        ref={ref}
        aria-label={label}
        className={cn('flex items-center gap-1', className)}
        {...props}
      >
        <IconButton
          aria-label="Назад"
          size={size}
          disabled={current <= 1}
          onClick={() => onPageChange(current - 1)}
        >
          <ChevronLeft />
        </IconButton>
        <ol className="flex items-center gap-1">
          {items.map((item) =>
            typeof item === 'number' ? (
              <li key={item}>
                <Button
                  variant="ghost"
                  size={size === 'sm' ? 'icon-sm' : 'icon'}
                  aria-label={`Страница ${formatNumber(item)}`}
                  aria-current={item === current ? 'page' : undefined}
                  onClick={() => onPageChange(item)}
                  className={cn(
                    'w-auto px-1.5 tabular',
                    minWidth,
                    item === current &&
                      'bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft active:bg-primary-soft',
                  )}
                >
                  {formatNumber(item)}
                </Button>
              </li>
            ) : (
              <li
                key={item}
                aria-hidden
                className={cn(
                  'flex h-full items-center justify-center text-subtle-foreground',
                  minWidth,
                )}
              >
                …
              </li>
            ),
          )}
        </ol>
        <IconButton
          aria-label="Вперёд"
          size={size}
          disabled={current >= total}
          onClick={() => onPageChange(current + 1)}
        >
          <ChevronRight />
        </IconButton>
      </nav>
    );
  },
);
Pagination.displayName = 'Pagination';

export interface PaginationSummaryProps extends HTMLAttributes<HTMLParagraphElement> {
  page: number;
  limit: number;
  total: number;
}

/// «1–20 из 1 234» — диапазон записей на текущей странице.
export function PaginationSummary({
  page,
  limit,
  total,
  className,
  ...props
}: PaginationSummaryProps) {
  const from = total === 0 ? 0 : (Math.max(1, page) - 1) * limit + 1;
  const to = Math.min(Math.max(1, page) * limit, total);
  return (
    <p
      className={cn('whitespace-nowrap text-sm text-muted-foreground tabular', className)}
      {...props}
    >
      {total === 0
        ? 'Нет записей'
        : `${formatNumber(from)}–${formatNumber(to)} из ${formatNumber(total)}`}
    </p>
  );
}

export interface LimitSelectProps {
  value: number;
  onChange: (limit: number) => void;
  options?: number[];
  size?: 'sm' | 'md';
  /// Подпись слева от селекта.
  label?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
}

const DEFAULT_LIMITS = [10, 20, 50, 100];

/// «Строк на странице» — общий Select дизайн-системы (Radix, Portal, solid),
/// никакого нативного popup браузера. Подпись связана с триггером через
/// aria-labelledby; клавиатура (стрелки/Enter/Escape) — из Radix.
export function LimitSelect({
  value,
  onChange,
  options = DEFAULT_LIMITS,
  size = 'sm',
  label = 'Строк на странице',
  className,
  id,
  disabled,
}: LimitSelectProps) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const labelId = `${triggerId}-label`;
  const values = options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <span id={labelId} className="whitespace-nowrap text-sm text-muted-foreground">
        {label}
      </span>
      <Select
        value={String(value)}
        onValueChange={(next) => onChange(Number(next))}
        disabled={disabled}
      >
        <SelectTrigger
          id={triggerId}
          aria-labelledby={labelId}
          size={size}
          className="w-[4.75rem] tabular"
          data-testid="limit-select"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end" className="min-w-[5.5rem]">
          {values.map((option) => (
            <SelectItem key={option} value={String(option)} className="tabular">
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
