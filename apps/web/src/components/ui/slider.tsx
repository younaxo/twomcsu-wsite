'use client';

import { Slider as RadixSlider } from 'radix-ui';
import { forwardRef, useState, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { cn } from '@/lib/cn';

/// Slider — выбор числа в диапазоне (Radix). Несколько значений в `value`
/// дают несколько ползунков (диапазон цен). Доступное имя вешается на
/// ползунок (`aria-label`/`thumbLabel`), а не на корень — так работает Radix;
/// `Field` даёт корню id/aria-describedby, describedby пробрасывается на ползунки.

export interface SliderProps extends ComponentPropsWithoutRef<typeof RadixSlider.Root> {
  /// Подпись значения над ползунком (tooltip-подобный бейдж).
  showValue?: boolean;
  /// Отметки на треке в единицах шкалы: [0, 25, 50, 75, 100].
  marks?: number[];
  /// Форматирование подписи: единицы, проценты, деньги.
  formatValue?: (value: number) => string;
  /// Доступное имя ползунка; массив — по одному на каждый ползунок.
  thumbLabel?: string | string[];
}

export const Slider = forwardRef<ElementRef<typeof RadixSlider.Root>, SliderProps>(
  (
    {
      className,
      showValue = false,
      marks,
      formatValue = String,
      thumbLabel,
      value,
      defaultValue,
      onValueChange,
      min = 0,
      max = 100,
      orientation = 'horizontal',
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledBy,
      'aria-describedby': ariaDescribedBy,
      ...props
    },
    ref,
  ) => {
    /// Зеркало значения для uncontrolled-режима: нужно знать число ползунков и подписи.
    const [internal, setInternal] = useState<number[]>(defaultValue ?? [min]);
    const current = value ?? internal;
    const span = Math.max(max - min, 1);
    const vertical = orientation === 'vertical';

    const labelFor = (index: number): string | undefined => {
      if (Array.isArray(thumbLabel)) {
        return thumbLabel[index];
      }
      return thumbLabel ?? ariaLabel;
    };

    return (
      <RadixSlider.Root
        ref={ref}
        min={min}
        max={max}
        orientation={orientation}
        value={value}
        defaultValue={defaultValue}
        onValueChange={(next) => {
          if (value === undefined) {
            setInternal(next);
          }
          onValueChange?.(next);
        }}
        className={cn(
          'relative flex w-full touch-none select-none items-center',
          'data-[orientation=vertical]:h-full data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col',
          'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
          showValue && !vertical && 'pt-7',
          className,
        )}
        {...props}
      >
        <RadixSlider.Track
          className={cn(
            'relative h-1.5 w-full grow rounded-full bg-surface-sunken',
            'data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5',
          )}
        >
          <RadixSlider.Range className="absolute h-full rounded-full bg-primary data-[orientation=vertical]:h-auto data-[orientation=vertical]:w-full" />
          {marks?.map((mark) => {
            const percent = `${((Math.min(Math.max(mark, min), max) - min) / span) * 100}%`;
            return (
              <span
                key={mark}
                aria-hidden
                className={cn(
                  'absolute size-1 rounded-full bg-surface ring-1 ring-border-strong',
                  vertical
                    ? 'left-1/2 -translate-x-1/2 translate-y-1/2'
                    : 'top-1/2 -translate-x-1/2 -translate-y-1/2',
                )}
                style={vertical ? { bottom: percent } : { left: percent }}
              />
            );
          })}
        </RadixSlider.Track>
        {current.map((thumbValue, index) => (
          <RadixSlider.Thumb
            key={index}
            aria-label={labelFor(index)}
            aria-labelledby={ariaLabelledBy}
            aria-describedby={ariaDescribedBy}
            className={cn(
              'relative block size-4 rounded-full border-2 border-primary bg-surface shadow-sm',
              'transition-[box-shadow] duration-fast',
              'hover:ring-4 hover:ring-primary/15',
              'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30',
            )}
          >
            {showValue ? (
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute whitespace-nowrap rounded-sm bg-foreground px-1.5 py-0.5 text-xs leading-snug text-background shadow-lg tabular',
                  vertical
                    ? 'left-full top-1/2 ml-2 -translate-y-1/2'
                    : 'bottom-full left-1/2 mb-2 -translate-x-1/2',
                )}
              >
                {formatValue(thumbValue)}
              </span>
            ) : null}
          </RadixSlider.Thumb>
        ))}
      </RadixSlider.Root>
    );
  },
);
Slider.displayName = 'Slider';
