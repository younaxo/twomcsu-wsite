'use client';

import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover } from 'radix-ui';
import {
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
} from 'react';
import { cn } from '@/lib/cn';
import { Button, IconButton } from './button';
import { selectTriggerVariants } from './select';

/// DatePicker — выбор одной даты без внешних зависимостей: Radix Popover +
/// собственная месячная сетка (пн–вс), названия через Intl ru-RU.
/// Значение — строка `YYYY-MM-DD` (календарная дата без времени и пояса).
/// Клавиатура в сетке: стрелки — по дням/неделям, Home/End — начало/конец
/// недели, PageUp/PageDown — месяц, Enter/Space — выбрать, Esc — закрыть.

/// Дата в формате `YYYY-MM-DD`.
export type IsoDate = string;

const LOCALE = 'ru-RU';
const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const monthFormatter = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' });
const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const fullDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const weekdayFormatter = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' });

/// 1 января 2024 — понедельник: отсюда берём «пн … вс» в нужном порядке.
const WEEKDAYS = Array.from({ length: 7 }, (_, index) =>
  weekdayFormatter.format(new Date(2024, 0, 1 + index)),
);

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export function toIsoDate(date: Date): IsoDate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromIsoDate(value: IsoDate | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const match = ISO_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function addMonths(date: Date, amount: number): Date {
  const day = date.getDate();
  const next = new Date(date.getFullYear(), date.getMonth() + amount, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

/// Индекс дня недели с понедельника: пн = 0 … вс = 6.
function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface DatePickerProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'value' | 'onChange' | 'defaultValue'
> {
  value: IsoDate | null;
  onChange: (value: IsoDate | null) => void;
  /// Границы включительно, `YYYY-MM-DD`.
  min?: IsoDate;
  max?: IsoDate;
  invalid?: boolean;
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg';
  /// Кнопка «Очистить» в футере (по умолчанию есть).
  clearable?: boolean;
}

export const DatePicker = forwardRef<HTMLButtonElement, DatePickerProps>(
  (
    {
      value,
      onChange,
      min,
      max,
      invalid,
      placeholder = 'Выберите дату',
      size,
      clearable = true,
      className,
      disabled,
      /// Кнопка не поддерживает aria-invalid — ошибка связывается через aria-describedby
      /// (Field), а визуально — через data-invalid.
      'aria-invalid': ariaInvalid,
      ...props
    },
    ref,
  ) => {
    const headingId = useId();
    const [open, setOpen] = useState(false);
    const selected = useMemo(() => fromIsoDate(value), [value]);
    const minDate = useMemo(() => fromIsoDate(min), [min]);
    const maxDate = useMemo(() => fromIsoDate(max), [max]);
    const today = useMemo(() => startOfDay(new Date()), []);

    const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(selected ?? today));
    /// Дата с tabIndex=0 в сетке (roving tabindex), `YYYY-MM-DD`.
    const [focused, setFocused] = useState<IsoDate>(() => toIsoDate(selected ?? today));
    const gridRef = useRef<HTMLDivElement>(null);
    const pendingFocusRef = useRef(false);

    const isOutOfRange = (date: Date): boolean =>
      (minDate !== null && date < minDate) || (maxDate !== null && date > maxDate);

    /// После клавиатурной навигации переносим DOM-фокус на новую ячейку.
    useEffect(() => {
      if (!pendingFocusRef.current) {
        return;
      }
      pendingFocusRef.current = false;
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
    }, [focused, viewMonth]);

    const moveFocus = (next: Date) => {
      pendingFocusRef.current = true;
      setFocused(toIsoDate(next));
      if (
        next.getMonth() !== viewMonth.getMonth() ||
        next.getFullYear() !== viewMonth.getFullYear()
      ) {
        setViewMonth(startOfMonth(next));
      }
    };

    const select = (date: Date) => {
      onChange(toIsoDate(date));
      setOpen(false);
    };

    const handleOpenChange = (next: boolean) => {
      setOpen(next);
      if (next) {
        const base = selected ?? today;
        setViewMonth(startOfMonth(base));
        setFocused(toIsoDate(base));
      }
    };

    const handleGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      const current = fromIsoDate(focused) ?? today;
      let next: Date | null = null;
      switch (event.key) {
        case 'ArrowLeft':
          next = addDays(current, -1);
          break;
        case 'ArrowRight':
          next = addDays(current, 1);
          break;
        case 'ArrowUp':
          next = addDays(current, -7);
          break;
        case 'ArrowDown':
          next = addDays(current, 7);
          break;
        case 'Home':
          next = addDays(current, -weekdayIndex(current));
          break;
        case 'End':
          next = addDays(current, 6 - weekdayIndex(current));
          break;
        case 'PageUp':
          next = addMonths(current, -1);
          break;
        case 'PageDown':
          next = addMonths(current, 1);
          break;
        default:
          return;
      }
      event.preventDefault();
      moveFocus(next);
    };

    /// Сетка всегда 6 недель — высота поповера не прыгает между месяцами.
    const weeks = useMemo(() => {
      const first = addDays(viewMonth, -weekdayIndex(viewMonth));
      return Array.from({ length: 6 }, (_, week) =>
        Array.from({ length: 7 }, (_, day) => addDays(first, week * 7 + day)),
      );
    }, [viewMonth]);

    const prevDisabled = minDate !== null && addDays(viewMonth, -1) < minDate;
    const nextDisabled = maxDate !== null && addMonths(viewMonth, 1) > maxDate;
    const todayAllowed = !isOutOfRange(today);

    return (
      <Popover.Root open={open} onOpenChange={handleOpenChange}>
        <Popover.Trigger asChild>
          <button
            ref={ref}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open}
            data-invalid={
              invalid || ariaInvalid === true || ariaInvalid === 'true' ? '' : undefined
            }
            data-placeholder={selected ? undefined : ''}
            disabled={disabled}
            className={cn(selectTriggerVariants({ size }), className)}
            {...props}
          >
            <Calendar aria-hidden className="text-subtle-foreground" />
            <span className="min-w-0 flex-1 truncate">
              {selected ? dateFormatter.format(selected) : placeholder}
            </span>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            collisionPadding={8}
            className={cn(
              'z-popover w-auto max-w-[calc(100vw-2rem)] p-3',
              'rounded-lg border bg-surface-overlay text-foreground shadow-lg',
              'data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out',
              'data-[side=bottom]:[--pop-y:-4px] data-[side=top]:[--pop-y:4px]',
            )}
          >
            <div className="flex items-center justify-between gap-2 pb-2">
              <IconButton
                size="sm"
                aria-label="Предыдущий месяц"
                disabled={prevDisabled}
                onClick={() => setViewMonth(addMonths(viewMonth, -1))}
              >
                <ChevronLeft />
              </IconButton>
              <span
                id={headingId}
                aria-live="polite"
                className="text-sm font-medium text-foreground"
              >
                {capitalize(monthFormatter.format(viewMonth))}
              </span>
              <IconButton
                size="sm"
                aria-label="Следующий месяц"
                disabled={nextDisabled}
                onClick={() => setViewMonth(addMonths(viewMonth, 1))}
              >
                <ChevronRight />
              </IconButton>
            </div>

            <div
              ref={gridRef}
              role="grid"
              aria-labelledby={headingId}
              onKeyDown={handleGridKeyDown}
              className="flex flex-col"
            >
              <div role="row" className="grid grid-cols-7">
                {WEEKDAYS.map((weekday) => (
                  <div
                    key={weekday}
                    role="columnheader"
                    className="flex h-8 items-center justify-center text-xs font-medium text-muted-foreground"
                  >
                    {weekday}
                  </div>
                ))}
              </div>
              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} role="row" className="grid grid-cols-7">
                  {week.map((day) => {
                    const iso = toIsoDate(day);
                    const isSelected = selected !== null && toIsoDate(selected) === iso;
                    const isToday = toIsoDate(today) === iso;
                    const isOutside = day.getMonth() !== viewMonth.getMonth();
                    const isFocused = focused === iso;
                    const isDisabled = isOutOfRange(day);
                    return (
                      <div
                        key={iso}
                        role="gridcell"
                        aria-selected={isSelected || undefined}
                        className="flex items-center justify-center p-0.5"
                      >
                        <button
                          type="button"
                          data-date={iso}
                          tabIndex={isFocused ? 0 : -1}
                          disabled={isDisabled}
                          aria-label={fullDateFormatter.format(day)}
                          aria-current={isToday ? 'date' : undefined}
                          onClick={() => select(day)}
                          onFocus={() => setFocused(iso)}
                          className={cn(
                            'inline-flex size-9 items-center justify-center rounded-sm text-sm tabular',
                            'transition-[background-color,color] duration-fast',
                            'hover:bg-muted',
                            isOutside && 'text-subtle-foreground',
                            isToday && !isSelected && 'font-semibold text-primary-soft-foreground',
                            isSelected &&
                              'bg-primary font-medium text-primary-foreground hover:bg-primary-hover',
                            'disabled:pointer-events-none disabled:opacity-40',
                          )}
                        >
                          {day.getDate()}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-2 mt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => (todayAllowed ? select(today) : moveFocus(today))}
              >
                Сегодня
              </Button>
              {clearable && selected ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  Очистить
                </Button>
              ) : null}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  },
);
DatePicker.displayName = 'DatePicker';
