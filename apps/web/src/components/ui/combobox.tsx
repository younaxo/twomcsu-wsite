'use client';

import { Command } from 'cmdk';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { Popover } from 'radix-ui';
import {
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';
import { selectTriggerVariants } from './select';
import { Spinner } from './spinner';

/// Combobox — выбор одного значения из длинного списка с поиском
/// (Radix Popover + cmdk). Для коротких списков без поиска — `Select`,
/// для нескольких значений — `MultiSelect`.
///
/// Серверный поиск: передайте `onSearch(q)` — локальная фильтрация отключается,
/// запрос приходит с debounce 250 мс, родитель обновляет `options` и `loading`.

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
  /// Дополнительные слова для локального поиска (синонимы, ник, e-mail).
  keywords?: string[];
}

export interface ComboboxProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'value' | 'onChange' | 'defaultValue'
> {
  options: ComboboxOption[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  loading?: boolean;
  invalid?: boolean;
  /// Повторный выбор текущего значения снимает выбор.
  clearable?: boolean;
  /// Серверный поиск (debounce 250 мс внутри). Без него — локальная фильтрация cmdk.
  onSearch?: (query: string) => void;
  size?: 'sm' | 'md' | 'lg';
  /// Класс выпадающего списка (ширина по умолчанию — как у триггера).
  contentClassName?: string;
}

/// Общие классы пункта cmdk-списка — используются и в MultiSelect.
export const commandItemClassName = cn(
  'relative flex min-h-control-sm cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground outline-none',
  'data-[selected=true]:bg-muted',
  'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
  '[&_svg]:size-4 [&_svg]:shrink-0',
);

/// Общие классы выпадающего списка (overlay-поверхность, анимация, z-index).
export const commandPopoverClassName = cn(
  'z-popover w-[var(--radix-popover-trigger-width)] min-w-56 max-w-[calc(100vw-2rem)] overflow-hidden p-0',
  'rounded-lg border bg-surface-overlay text-foreground shadow-lg',
  'data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out',
  'data-[side=bottom]:[--pop-y:-4px] data-[side=top]:[--pop-y:4px]',
);

export const commandInputClassName = cn(
  'h-control w-full min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-subtle-foreground',
  'disabled:cursor-not-allowed',
);

export const commandListClassName =
  'max-h-72 overflow-y-auto overscroll-contain p-1 scrollbar-thin';

/// Хук серверного поиска с debounce: вызывает `onSearch` при открытии и при
/// каждом изменении запроса, не чаще раза в 250 мс.
export function useDebouncedSearch(
  onSearch: ((query: string) => void) | undefined,
  query: string,
  active: boolean,
): void {
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  });
  const enabled = Boolean(onSearch);
  useEffect(() => {
    if (!enabled || !active) {
      return;
    }
    const timer = window.setTimeout(() => onSearchRef.current?.(query), 250);
    return () => window.clearTimeout(timer);
  }, [enabled, active, query]);
}

export const Combobox = forwardRef<HTMLButtonElement, ComboboxProps>(
  (
    {
      options,
      value,
      onValueChange,
      placeholder = 'Выберите…',
      searchPlaceholder = 'Поиск…',
      emptyText = 'Ничего не найдено',
      loading = false,
      invalid,
      clearable = false,
      onSearch,
      size,
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
    /// Последний выбранный вариант: при серверном поиске его может не быть в `options`.
    const [lastSelected, setLastSelected] = useState<ComboboxOption | null>(null);

    useDebouncedSearch(onSearch, query, open);

    const selected = useMemo(
      () =>
        options.find((option) => option.value === value) ??
        (lastSelected && lastSelected.value === value ? lastSelected : null),
      [options, value, lastSelected],
    );

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
        <Popover.Trigger asChild>
          <button
            ref={ref}
            type="button"
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listId}
            aria-invalid={invalid || props['aria-invalid'] || undefined}
            data-placeholder={selected ? undefined : ''}
            disabled={disabled}
            className={cn(selectTriggerVariants({ size }), className)}
            {...props}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              {selected?.icon ? (
                <span aria-hidden className="inline-flex shrink-0 text-muted-foreground">
                  {selected.icon}
                </span>
              ) : null}
              <span className="truncate">{selected ? selected.label : placeholder}</span>
            </span>
            <ChevronsUpDown aria-hidden className="text-subtle-foreground" />
          </button>
        </Popover.Trigger>
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
                {options.map((option) => (
                  <Command.Item
                    key={option.value}
                    value={option.value}
                    keywords={[option.label, ...(option.keywords ?? [])]}
                    disabled={option.disabled}
                    onSelect={() => {
                      const next = clearable && option.value === value ? null : option.value;
                      setLastSelected(next ? option : null);
                      onValueChange(next);
                      setOpen(false);
                    }}
                    className={commandItemClassName}
                  >
                    <span className="inline-flex size-4 shrink-0 items-center justify-center">
                      {option.value === value ? <Check aria-hidden /> : null}
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
                ))}
              </Command.List>
            </Command>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  },
);
Combobox.displayName = 'Combobox';
