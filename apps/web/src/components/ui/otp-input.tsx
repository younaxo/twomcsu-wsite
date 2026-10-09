'use client';

import { unstable_OneTimePasswordField as RadixOtp } from 'radix-ui';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { cn } from '@/lib/cn';
import { inputClassName } from './input';

/// OtpInput — ввод кода подтверждения по одной цифре в ячейку. Автопереход,
/// вставка целого кода, Backspace/стрелки и автозаполнение из SMS
/// (`autocomplete="one-time-code"`) делает Radix OneTimePasswordField.
/// `id` ставится на группу, `aria-describedby`/`aria-invalid` — на каждую ячейку
/// (так `Field` связывает ошибку с полем).

export interface OtpInputProps extends Omit<
  ComponentPropsWithoutRef<typeof RadixOtp.Root>,
  'value' | 'defaultValue' | 'onValueChange' | 'onChange' | 'children' | 'validationType'
> {
  /// Количество цифр (по умолчанию 6).
  length?: number;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /// Вызывается, когда введены все цифры.
  onComplete?: (value: string) => void;
  invalid?: boolean;
  size?: 'md' | 'lg';
  /// Имя скрытого input для нативной отправки формы.
  name?: string;
  /// Доступное имя группы (по умолчанию «Код подтверждения»).
  'aria-label'?: string;
}

const cellSizeClass = {
  md: 'h-control w-10 text-base',
  lg: 'h-control-lg w-12 text-lg',
} as const;

export const OtpInput = forwardRef<ElementRef<typeof RadixOtp.Root>, OtpInputProps>(
  (
    {
      length = 6,
      value,
      defaultValue,
      onChange,
      onComplete,
      invalid,
      size = 'md',
      name,
      disabled,
      autoFocus = false,
      className,
      'aria-label': ariaLabel = 'Код подтверждения',
      'aria-describedby': describedBy,
      'aria-invalid': ariaInvalid,
      ...props
    },
    ref,
  ) => {
    const isInvalid = invalid || ariaInvalid === true || ariaInvalid === 'true' || undefined;
    return (
      <RadixOtp.Root
        ref={ref}
        value={value}
        defaultValue={defaultValue}
        onValueChange={(next) => {
          onChange?.(next);
          if (next.length === length) {
            onComplete?.(next);
          }
        }}
        disabled={disabled}
        autoFocus={autoFocus}
        validationType="numeric"
        autoComplete="one-time-code"
        aria-label={ariaLabel}
        className={cn('flex max-w-full items-center gap-2', className)}
        {...props}
      >
        {Array.from({ length }, (_, index) => (
          <RadixOtp.Input
            key={index}
            index={index}
            aria-label={`Код, цифра ${index + 1}`}
            aria-invalid={isInvalid}
            aria-describedby={describedBy}
            className={cn(
              inputClassName,
              'shrink-0 px-0 text-center font-mono tabular caret-primary',
              cellSizeClass[size],
            )}
          />
        ))}
        {name ? <RadixOtp.HiddenInput name={name} /> : null}
      </RadixOtp.Root>
    );
  },
);
OtpInput.displayName = 'OtpInput';
