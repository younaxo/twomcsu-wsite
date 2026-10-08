'use client';

import { RadioGroup as RadixRadioGroup } from 'radix-ui';
import {
  forwardRef,
  useId,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';

/// RadioGroup — выбор одного из нескольких взаимоисключающих вариантов (Radix).
/// `RadioField` — пункт с подписью (одна кликабельная цель);
/// `RadioCards` — карточки-опции для выбора тарифа/длительности.

export interface RadioGroupProps extends ComponentPropsWithoutRef<typeof RadixRadioGroup.Root> {
  invalid?: boolean;
}

export const RadioGroup = forwardRef<ElementRef<typeof RadixRadioGroup.Root>, RadioGroupProps>(
  ({ className, invalid, ...props }, ref) => (
    <RadixRadioGroup.Root
      ref={ref}
      aria-invalid={invalid || props['aria-invalid'] || undefined}
      data-invalid={invalid || props['aria-invalid'] ? '' : undefined}
      className={cn(
        'group/radio flex flex-col gap-2',
        'aria-[orientation=horizontal]:flex-row aria-[orientation=horizontal]:flex-wrap aria-[orientation=horizontal]:gap-4',
        className,
      )}
      {...props}
    />
  ),
);
RadioGroup.displayName = 'RadioGroup';

export const RadioGroupItem = forwardRef<
  ElementRef<typeof RadixRadioGroup.Item>,
  ComponentPropsWithoutRef<typeof RadixRadioGroup.Item>
>(({ className, ...props }, ref) => (
  <RadixRadioGroup.Item
    ref={ref}
    className={cn(
      'peer inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface',
      'transition-[border-color] duration-fast',
      'hover:border-foreground/40',
      'data-[state=checked]:border-primary',
      'group-data-[invalid]/radio:border-destructive',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <RadixRadioGroup.Indicator className="flex items-center justify-center">
      <span aria-hidden className="size-2 rounded-full bg-primary" />
    </RadixRadioGroup.Indicator>
  </RadixRadioGroup.Item>
));
RadioGroupItem.displayName = 'RadioGroupItem';

export interface RadioFieldProps extends ComponentPropsWithoutRef<typeof RadixRadioGroup.Item> {
  label: ReactNode;
  description?: ReactNode;
  /// Класс для обёртки-label (сам `className` уходит на контрол).
  wrapperClassName?: string;
}

/// Пункт группы с подписью: label оборачивает контрол — одна цель ≥ 40px.
export const RadioField = forwardRef<ElementRef<typeof RadixRadioGroup.Item>, RadioFieldProps>(
  (
    {
      label,
      description,
      id: idProp,
      wrapperClassName,
      className,
      disabled,
      'aria-describedby': describedByProp,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const id = idProp ?? generatedId;
    const descriptionId = description ? `${id}-description` : undefined;
    const describedBy = [describedByProp, descriptionId].filter(Boolean).join(' ') || undefined;
    return (
      <label
        htmlFor={id}
        className={cn(
          'flex min-h-10 cursor-pointer select-none items-start gap-3 py-2.5',
          disabled && 'cursor-not-allowed opacity-60',
          wrapperClassName,
        )}
      >
        <RadioGroupItem
          ref={ref}
          id={id}
          disabled={disabled}
          aria-describedby={describedBy}
          className={cn('mt-0.5', className)}
          {...props}
        />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium leading-5 text-foreground">{label}</span>
          {description ? (
            <span id={descriptionId} className="text-xs text-muted-foreground">
              {description}
            </span>
          ) : null}
        </span>
      </label>
    );
  },
);
RadioField.displayName = 'RadioField';

export interface RadioCardOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  /// Справа: цена, бейдж «популярно», срок.
  addon?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface RadioCardsProps extends Omit<RadioGroupProps, 'children' | 'orientation'> {
  options: RadioCardOption[];
  /// Колонки на ≥ sm; на mobile всегда одна.
  columns?: 1 | 2 | 3;
}

const columnsClass: Record<NonNullable<RadioCardsProps['columns']>, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
};

/// Карточки-опции: вся карточка — radio (`role="radio"`), выбранная —
/// `border-primary bg-primary-soft/40`. Для тарифов, длительности, планов.
export const RadioCards = forwardRef<ElementRef<typeof RadixRadioGroup.Root>, RadioCardsProps>(
  ({ options, columns = 1, className, ...props }, ref) => (
    <RadioGroup
      ref={ref}
      className={cn('grid grid-cols-1 gap-2', columnsClass[columns], className)}
      {...props}
    >
      {options.map((option) => (
        <RadixRadioGroup.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className={cn(
            'group/card flex w-full items-start gap-3 rounded border border-border bg-surface p-3 text-left',
            'transition-[border-color,background-color] duration-fast',
            'hover:border-border-strong',
            'data-[state=checked]:border-primary data-[state=checked]:bg-primary-soft/40',
            'group-data-[invalid]/radio:border-destructive',
            'disabled:cursor-not-allowed disabled:opacity-50',
            '[&_svg]:size-4 [&_svg]:shrink-0',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface',
              'transition-[border-color] duration-fast group-data-[state=checked]/card:border-primary',
            )}
          >
            <RadixRadioGroup.Indicator asChild>
              <span className="size-2 rounded-full bg-primary" />
            </RadixRadioGroup.Indicator>
          </span>
          {option.icon ? (
            <span aria-hidden className="mt-0.5 inline-flex text-muted-foreground">
              {option.icon}
            </span>
          ) : null}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-medium leading-5 text-foreground">{option.label}</span>
            {option.description ? (
              <span className="text-xs text-muted-foreground">{option.description}</span>
            ) : null}
          </span>
          {option.addon ? (
            <span className="shrink-0 text-sm font-medium leading-5 text-foreground tabular">
              {option.addon}
            </span>
          ) : null}
        </RadixRadioGroup.Item>
      ))}
    </RadioGroup>
  ),
);
RadioCards.displayName = 'RadioCards';
