'use client';

import { Switch as RadixSwitch } from 'radix-ui';
import {
  forwardRef,
  useId,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';

/// Switch — «включено/выключено» с мгновенным эффектом (настройки, флаги).
/// Если изменение требует «Сохранить» — это `Checkbox`.
///
/// Трек и ползунок ВСЕГДА `rounded-full`, минуя radius-токен: переключатель
/// читается как переключатель только в форме «пилюли» — в SIGNAL (radius 2px)
/// прямоугольный трек с квадратным ползунком выглядит как кнопка, а не как
/// тумблер. Это единственное сознательное исключение из правила радиусов.

export interface SwitchProps extends ComponentPropsWithoutRef<typeof RadixSwitch.Root> {
  invalid?: boolean;
}

export const Switch = forwardRef<ElementRef<typeof RadixSwitch.Root>, SwitchProps>(
  ({ className, invalid, ...props }, ref) => (
    <RadixSwitch.Root
      ref={ref}
      aria-invalid={invalid || props['aria-invalid'] || undefined}
      className={cn(
        'peer relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-border-strong',
        'transition-[background-color] duration-fast',
        'hover:bg-subtle-foreground',
        'data-[state=checked]:bg-primary data-[state=checked]:hover:bg-primary-hover',
        'aria-[invalid=true]:bg-destructive/60',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <RadixSwitch.Thumb
        className={cn(
          'pointer-events-none block size-4 rounded-full bg-surface shadow-sm',
          'transition-transform duration-fast',
          'data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0',
        )}
      />
    </RadixSwitch.Root>
  ),
);
Switch.displayName = 'Switch';

export interface SwitchFieldProps extends SwitchProps {
  label: ReactNode;
  description?: ReactNode;
  /// Класс для обёртки-label (сам `className` уходит на контрол).
  wrapperClassName?: string;
}

/// Строка настройки: подпись слева, переключатель справа; label оборачивает
/// контрол — вся строка одна кликабельная цель ≥ 40px.
export const SwitchField = forwardRef<ElementRef<typeof RadixSwitch.Root>, SwitchFieldProps>(
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
          'flex min-h-10 cursor-pointer select-none items-center justify-between gap-4 py-2',
          disabled && 'cursor-not-allowed opacity-60',
          wrapperClassName,
        )}
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium leading-5 text-foreground">{label}</span>
          {description ? (
            <span id={descriptionId} className="text-xs text-muted-foreground">
              {description}
            </span>
          ) : null}
        </span>
        <Switch
          ref={ref}
          id={id}
          disabled={disabled}
          aria-describedby={describedBy}
          className={className}
          {...props}
        />
      </label>
    );
  },
);
SwitchField.displayName = 'SwitchField';
