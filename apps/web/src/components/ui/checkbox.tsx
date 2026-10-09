'use client';

import { Check, Minus } from 'lucide-react';
import { Checkbox as RadixCheckbox } from 'radix-ui';
import {
  forwardRef,
  useId,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';

/// Checkbox — переключатель «да/нет» (Radix). Поддерживает `indeterminate`
/// («выбрана часть», например шапка таблицы). Для «включить функцию» —
/// `Switch`, для выбора одного из нескольких — `RadioGroup`.

export type CheckedState = RadixCheckbox.CheckedState;

export interface CheckboxProps extends ComponentPropsWithoutRef<typeof RadixCheckbox.Root> {
  invalid?: boolean;
  /// `round` — индикатор выбора строки в таблицах (DataGrid); в формах —
  /// обычный квадратный Checkbox. Семантика одна: role="checkbox".
  shape?: 'square' | 'round';
}

export const Checkbox = forwardRef<ElementRef<typeof RadixCheckbox.Root>, CheckboxProps>(
  ({ className, invalid, shape = 'square', ...props }, ref) => (
    <RadixCheckbox.Root
      ref={ref}
      aria-invalid={invalid || props['aria-invalid'] || undefined}
      className={cn(
        'peer relative inline-flex size-4 shrink-0 cursor-pointer items-center justify-center border border-border-strong bg-surface',
        shape === 'round' ? 'rounded-full' : 'rounded-sm',
        // Зона касания ≥ 32px без увеличения самого квадрата.
        "before:absolute before:-inset-2 before:content-['']",
        'transition-[background-color,border-color,box-shadow] duration-fast',
        'hover:border-foreground/40 hover:bg-surface-hover',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        'data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground',
        'aria-[invalid=true]:border-destructive',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border-strong disabled:hover:bg-surface',
        className,
      )}
      {...props}
    >
      <RadixCheckbox.Indicator className="group/indicator flex items-center justify-center text-current">
        <Check
          aria-hidden
          strokeWidth={3}
          className="size-3 group-data-[state=indeterminate]/indicator:hidden"
        />
        <Minus
          aria-hidden
          strokeWidth={3}
          className="hidden size-3 group-data-[state=indeterminate]/indicator:block"
        />
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  ),
);
Checkbox.displayName = 'Checkbox';

export interface CheckboxFieldProps extends CheckboxProps {
  label: ReactNode;
  description?: ReactNode;
  /// Класс для обёртки-label (сам `className` уходит на контрол).
  wrapperClassName?: string;
}

/// Чекбокс с подписью: label оборачивает контрол, поэтому вся строка —
/// одна кликабельная цель высотой ≥ 40px (touch-friendly).
/// Внутри `Field` id/aria-describedby/aria-invalid попадают на контрол.
export const CheckboxField = forwardRef<ElementRef<typeof RadixCheckbox.Root>, CheckboxFieldProps>(
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
        <Checkbox
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
CheckboxField.displayName = 'CheckboxField';
