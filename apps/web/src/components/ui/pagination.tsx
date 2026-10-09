'use client';

import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { forwardRef, useId, type HTMLAttributes, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { Button, IconButton } from './button';
import { inputClassName } from './input';

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

export interface LimitSelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'value' | 'onChange' | 'size'
> {
  value: number;
  onChange: (limit: number) => void;
  options?: number[];
  size?: 'sm' | 'md';
  /// Подпись слева от селекта.
  label?: string;
}

const DEFAULT_LIMITS = [10, 20, 50, 100];

/// Нативный `<select>` «строк на странице», стилизованный под Input.
export const LimitSelect = forwardRef<HTMLSelectElement, LimitSelectProps>(
  (
    {
      value,
      onChange,
      options = DEFAULT_LIMITS,
      size = 'sm',
      label = 'Строк на странице',
      className,
      id,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const selectId = id ?? generatedId;
    const values = options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
    return (
      <div className={cn('inline-flex items-center gap-2', className)}>
        <label htmlFor={selectId} className="whitespace-nowrap text-sm text-muted-foreground">
          {label}
        </label>
        <span className="relative inline-flex">
          <select
            ref={ref}
            id={selectId}
            value={value}
            onChange={(event) => onChange(Number(event.target.value))}
            className={cn(
              inputClassName,
              'inline-block w-auto cursor-pointer appearance-none pr-8 tabular',
              size === 'sm' ? 'h-control-sm' : 'h-control',
            )}
            {...props}
          >
            {values.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground"
          />
        </span>
      </div>
    );
  },
);
LimitSelect.displayName = 'LimitSelect';
