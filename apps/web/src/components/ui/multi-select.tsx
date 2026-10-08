'use client';

import { Command } from 'cmdk';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { Popover } from 'radix-ui';
import { forwardRef, useId, useMemo, useRef, useState, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { Badge } from './badge';
import {
  commandInputClassName,
  commandItemClassName,
  commandListClassName,
  commandPopoverClassName,
  useDebouncedSearch,
  type ComboboxOption,
} from './combobox';
import { Spinner } from './spinner';

/// MultiSelect — выбор нескольких значений с поиском (роли, теги, серверы).
/// Выбранные показываются чипами в поле; Backspace в пустом поиске или на
/// кнопке-триггере убирает последний. `ref`/`id`/`aria-*` — на кнопке-триггере
/// (внутри поля), `className` — на самом поле.

export interface MultiSelectProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'value' | 'onChange' | 'defaultValue'
> {
  options: ComboboxOption[];
  value: string[];
  onValueChange: (value: string[]) => void;
  /// Максимум выбранных; остальные пункты блокируются.
  max?: number;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  loading?: boolean;
  invalid?: boolean;
  /// Серверный поиск (debounce 250 мс внутри).
  onSearch?: (query: string) => void;
  size?: 'sm' | 'md' | 'lg';
  /// Показывать не больше N чипов, остальные схлопываются в «+N».
  collapseAfter?: number;
  contentClassName?: string;
}

const sizeClass: Record<NonNullable<MultiSelectProps['size']>, string> = {
  sm: 'min-h-control-sm',
  md: 'min-h-control',
  lg: 'min-h-control-lg',
};

export const MultiSelect = forwardRef<HTMLButtonElement, MultiSelectProps>(
  (
    {
      options,
      value,
      onValueChange,
      max,
      placeholder = 'Выберите…',
      searchPlaceholder = 'Поиск…',
      emptyText = 'Ничего не найдено',
      loading = false,
      invalid,
      onSearch,
      size = 'md',
      collapseAfter,
      className,
      contentClassName,
      disabled,
      ...props
    },
    ref,
  ) => {
    const listId = useId();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    useDebouncedSearch(onSearch, query, open);

    /// Кэш подписей: при серверном поиске выбранного варианта может не быть в `options`.
    const cacheRef = useRef(new Map<string, ComboboxOption>());
    const byValue = useMemo(() => {
      const cache = cacheRef.current;
      for (const option of options) {
        cache.set(option.value, option);
      }
      return cache;
    }, [options]);

    const chips = value.map((item) => byValue.get(item) ?? { value: item, label: item });
    const visibleChips = collapseAfter === undefined ? chips : chips.slice(0, collapseAfter);
    const hiddenCount = chips.length - visibleChips.length;
    const limitReached = max !== undefined && value.length >= max;
    const isInvalid = Boolean(invalid || props['aria-invalid']);
    const summary =
      max === undefined ? `Выбрано ${value.length}` : `Выбрано ${value.length} из ${max}`;

    const remove = (item: string) => onValueChange(value.filter((current) => current !== item));
    const removeLast = () => {
      if (value.length > 0) {
        onValueChange(value.slice(0, -1));
      }
    };
    const toggle = (item: string) => {
      if (value.includes(item)) {
        remove(item);
      } else if (!limitReached) {
        onValueChange([...value, item]);
      }
    };

    return (
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setQuery('');
          }
        }}
      >
        <Popover.Anchor asChild>
          <div
            data-invalid={isInvalid ? '' : undefined}
            data-disabled={disabled ? '' : undefined}
            onClick={(event) => {
              /// Клик по полю вне чипов и кнопок открывает список.
              if (!disabled && !(event.target as HTMLElement).closest('button')) {
                setOpen(true);
              }
            }}
            className={cn(
              'flex w-full min-w-0 flex-wrap items-center gap-1 rounded border border-border bg-surface py-1 pl-1.5 pr-1 text-sm text-foreground',
              'transition-[border-color,box-shadow] duration-fast',
              'hover:border-border-strong',
              'focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30',
              'data-[invalid]:border-destructive data-[invalid]:focus-within:ring-destructive/30',
              'data-[disabled]:cursor-not-allowed data-[disabled]:bg-surface-sunken data-[disabled]:opacity-60',
              sizeClass[size],
              className,
            )}
          >
            {visibleChips.map((chip) => (
              <Badge key={chip.value} tone="neutral" className="max-w-full gap-1 pr-0.5">
                <span className="truncate">{chip.label}</span>
                <button
                  type="button"
                  aria-label={`Убрать ${chip.label}`}
                  disabled={disabled}
                  onClick={() => remove(chip.value)}
                  className={cn(
                    'inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground',
                    'transition-[background-color,color] duration-fast hover:bg-foreground/10 hover:text-foreground',
                    'focus-visible:-outline-offset-1 disabled:pointer-events-none',
                  )}
                >
                  <X aria-hidden />
                </button>
              </Badge>
            ))}
            {hiddenCount > 0 ? (
              <Badge tone="neutral" className="tabular">
                +{hiddenCount}
              </Badge>
            ) : null}
            <Popover.Trigger asChild>
              <button
                ref={ref}
                type="button"
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listId}
                aria-invalid={isInvalid || undefined}
                disabled={disabled}
                onKeyDown={(event) => {
                  if (event.key === 'Backspace' && !open) {
                    event.preventDefault();
                    removeLast();
                  }
                }}
                className={cn(
                  'flex h-6 min-w-20 flex-1 items-center justify-between gap-2 rounded-sm px-1 text-left',
                  'focus-visible:outline-none disabled:cursor-not-allowed',
                  '[&_svg]:size-4 [&_svg]:shrink-0',
                )}
                {...props}
              >
                <span className={cn('truncate', value.length === 0 && 'text-subtle-foreground')}>
                  {value.length === 0 ? placeholder : <span className="sr-only">{summary}</span>}
                </span>
                <ChevronsUpDown aria-hidden className="text-subtle-foreground" />
              </button>
            </Popover.Trigger>
          </div>
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            collisionPadding={8}
            className={cn(commandPopoverClassName, contentClassName)}
          >
            <Command shouldFilter={!onSearch} loop label={searchPlaceholder}>
              <div className="flex items-center gap-2 border-b border-border-subtle px-3">
                <Search aria-hidden className="size-4 shrink-0 text-subtle-foreground" />
                <Command.Input
                  value={query}
                  onValueChange={setQuery}
                  placeholder={searchPlaceholder}
                  onKeyDown={(event) => {
                    if (event.key === 'Backspace' && query === '') {
                      event.preventDefault();
                      removeLast();
                    }
                  }}
                  className={commandInputClassName}
                />
                {loading ? <Spinner size="sm" label="Поиск…" /> : null}
              </div>
              <Command.List id={listId} className={commandListClassName}>
                {loading && options.length === 0 ? (
                  <div className="flex justify-center py-6">
                    <Spinner size="sm" label="Загрузка списка…" />
                  </div>
                ) : (
                  <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                    {emptyText}
                  </Command.Empty>
                )}
                {options.map((option) => {
                  const checked = value.includes(option.value);
                  return (
                    <Command.Item
                      key={option.value}
                      value={option.value}
                      keywords={[option.label, ...(option.keywords ?? [])]}
                      disabled={option.disabled || (limitReached && !checked)}
                      onSelect={() => toggle(option.value)}
                      aria-selected={checked}
                      className={commandItemClassName}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'inline-flex size-4 shrink-0 items-center justify-center rounded-sm border border-border-strong bg-surface text-primary-foreground',
                          'transition-[background-color,border-color] duration-fast',
                          checked && 'border-primary bg-primary',
                        )}
                      >
                        {checked ? <Check strokeWidth={3} className="size-3" /> : null}
                      </span>
                      {option.icon ? (
                        <span aria-hidden className="inline-flex shrink-0 text-muted-foreground">
                          {option.icon}
                        </span>
                      ) : null}
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{option.label}</span>
                        {option.description ? (
                          <span className="truncate text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        ) : null}
                      </span>
                    </Command.Item>
                  );
                })}
              </Command.List>
              <div
                aria-live="polite"
                className="border-t border-border-subtle px-3 py-1.5 text-xs text-muted-foreground tabular"
              >
                {summary}
              </div>
            </Command>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  },
);
MultiSelect.displayName = 'MultiSelect';
