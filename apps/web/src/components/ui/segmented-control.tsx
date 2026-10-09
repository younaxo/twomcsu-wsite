'use client';

import { ToggleGroup } from 'radix-ui';
import { forwardRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/// SegmentedControl — переключатель вида/режима из 2–5 вариантов (список/сетка,
/// период, сортировка). Всегда ровно одно выбранное значение: пустого состояния
/// нет. Для навигации по разделам контента — `Tabs`.

export interface SegmentedOption {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps extends Omit<
  ToggleGroup.ToggleGroupSingleProps,
  'type' | 'value' | 'defaultValue' | 'onValueChange' | 'children'
> {
  options: SegmentedOption[];
  value?: string;
  /// По умолчанию — первая опция.
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  size?: 'sm' | 'md';
  /// Растянуть на ширину контейнера, опции делят ширину поровну.
  fullWidth?: boolean;
}

const sizeClass: Record<NonNullable<SegmentedControlProps['size']>, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-control-sm px-3 text-sm',
};

export const SegmentedControl = forwardRef<HTMLDivElement, SegmentedControlProps>(
  (
    {
      options,
      value,
      defaultValue,
      onValueChange,
      size = 'md',
      fullWidth = false,
      className,
      ...props
    },
    ref,
  ) => {
    const [internal, setInternal] = useState(defaultValue ?? options[0]?.value ?? '');
    const current = value ?? internal;

    return (
      <ToggleGroup.Root
        ref={ref}
        type="single"
        rovingFocus
        value={current}
        onValueChange={(next) => {
          /// Radix шлёт '' при клике по уже выбранному — пустое значение не допускаем.
          if (!next || next === current) {
            return;
          }
          if (value === undefined) {
            setInternal(next);
          }
          onValueChange?.(next);
        }}
        className={cn(
          'inline-flex max-w-full items-stretch gap-0.5 rounded bg-background-subtle p-0.5',
          fullWidth && 'flex w-full',
          className,
        )}
        {...props}
      >
        {options.map((option) => (
          <ToggleGroup.Item
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            className={cn(
              'inline-flex min-w-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-sm font-medium text-muted-foreground',
              'transition-[background-color,color,box-shadow] duration-fast',
              'hover:text-foreground',
              // Активный пункт — приподнятая поверхность с оранжевым акцентом текста.
              'data-[state=on]:bg-surface-raised data-[state=on]:text-primary data-[state=on]:shadow-sm',
              'focus-visible:z-10',
              'disabled:pointer-events-none disabled:opacity-50',
              '[&_svg]:size-4 [&_svg]:shrink-0',
              sizeClass[size],
              fullWidth && 'flex-1',
            )}
          >
            {option.icon ? (
              <span aria-hidden className="inline-flex">
                {option.icon}
              </span>
            ) : null}
            <span className="truncate">{option.label}</span>
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    );
  },
);
SegmentedControl.displayName = 'SegmentedControl';
