'use client';

import { unstable_OneTimePasswordField as RadixOtp } from 'radix-ui';
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from 'react';
import { cn } from '@/lib/cn';
import { inputClassName } from './input';

/// OtpInput — ввод кода подтверждения по одной цифре в ячейку. Автопереход,
/// вставка целого кода, Backspace/стрелки и автозаполнение из SMS
/// (`autocomplete="one-time-code"`) делает Radix OneTimePasswordField.
/// `id` ставится на группу, `aria-describedby`/`aria-invalid` — на каждую ячейку
/// (так `Field` связывает ошибку с полем).
///
/// `autoFocus` Radix 0.1.x в ячейки не передаёт, поэтому фокус ставим сами:
/// первая ячейка получает фокус при монтировании и каждый раз, когда поле снова
/// доступно и пустое — после неверного кода или повторной отправки (на время
/// проверки ячейки `disabled` и теряют фокус).
///
/// Backspace в пустой ячейке у Radix только переводит фокус назад, и цифру
/// приходится стирать вторым нажатием. В контролируемом режиме стираем
/// предыдущую цифру сразу — каретка стоит после последней введённой цифры.

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
    const rootRef = useRef<HTMLDivElement | null>(null);
    const setRootRef = useCallback(
      (node: HTMLDivElement | null) => {
        rootRef.current = node;
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [ref],
    );
    const empty = (value ?? '') === '';
    useEffect(() => {
      if (!autoFocus || disabled || !empty) {
        return;
      }
      rootRef.current?.querySelector<HTMLInputElement>('input[data-radix-otp-input]')?.focus();
    }, [autoFocus, disabled, empty]);
    return (
      <RadixOtp.Root
        ref={setRootRef}
        value={value}
        defaultValue={defaultValue}
        onValueChange={(next) => {
          onChange?.(next);
          if (next.length === length) {
            onComplete?.(next);
          }
        }}
        disabled={disabled}
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
            onKeyDown={(event) => {
              const plain = !event.metaKey && !event.ctrlKey && !event.altKey;
              if (
                event.key !== 'Backspace' ||
                !plain ||
                value === undefined ||
                index === 0 ||
                event.currentTarget.value !== ''
              ) {
                return;
              }
              // preventDefault отменяет обработчик Radix (composeEventHandlers).
              event.preventDefault();
              const cells = rootRef.current?.querySelectorAll<HTMLInputElement>(
                'input[data-radix-otp-input]',
              );
              onChange?.(value.slice(0, index - 1) + value.slice(index));
              cells?.[index - 1]?.focus();
            }}
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
