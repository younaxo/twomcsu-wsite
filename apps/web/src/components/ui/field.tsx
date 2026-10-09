'use client';

import { CircleAlert } from 'lucide-react';
import { Label as RadixLabel } from 'radix-ui';
import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';

export const Label = forwardRef<
  ElementRef<typeof RadixLabel.Root>,
  ComponentPropsWithoutRef<typeof RadixLabel.Root> & { required?: boolean }
>(({ className, required, children, ...props }, ref) => (
  <RadixLabel.Root
    ref={ref}
    className={cn(
      'text-sm font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
      className,
    )}
    {...props}
  >
    {children}
    {required ? (
      <span aria-hidden className="ml-0.5 text-destructive">
        *
      </span>
    ) : null}
  </RadixLabel.Root>
));
Label.displayName = 'Label';

export interface FieldProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  label?: ReactNode;
  /// Подсказка под полем (формат, пример, ограничение).
  hint?: ReactNode;
  /// Текст ошибки — выводится под полем, объявляется screen reader'ом,
  /// у контрола выставляются aria-invalid/aria-describedby.
  error?: ReactNode | null;
  required?: boolean;
  /// Элемент справа от подписи (HelpTooltip, счётчик символов).
  labelAddon?: ReactNode;
  /// Один контрол (Input/Select/Textarea/…): ему проставятся id/aria-атрибуты.
  children: ReactElement;
}

/// Поле формы: подпись + контрол + подсказка/ошибка, связанные через id.
export function Field({
  label,
  hint,
  error,
  required,
  labelAddon,
  children,
  className,
  ...props
}: FieldProps) {
  const generatedId = useId();
  const childProps = isValidElement<Record<string, unknown>>(children)
    ? children.props
    : ({} as Record<string, unknown>);
  const id = (childProps.id as string | undefined) ?? generatedId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [childProps['aria-describedby'], hintId, errorId].filter(Boolean).join(' ');

  const control = isValidElement<Record<string, unknown>>(children)
    ? cloneElement(children, {
        id,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': error ? true : childProps['aria-invalid'],
        'aria-required': required || childProps['aria-required'] || undefined,
      })
    : children;

  return (
    <div className={cn('flex flex-col gap-1.5', className)} {...props}>
      {label ? (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={id} required={required}>
            {label}
          </Label>
          {labelAddon}
        </div>
      ) : null}
      {control}
      {error ? (
        <p id={errorId} role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
          <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
