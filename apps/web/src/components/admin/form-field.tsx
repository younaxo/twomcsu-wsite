'use client';

import { CircleAlert } from 'lucide-react';
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { Label } from '@/components/ui/field';
import { cn } from '@/lib/cn';

/// Поле админ-формы: как ui/Field (подпись, hint, aria-invalid/describedby), но
/// текст ошибки поля НЕ объявляется отдельным role="alert". Форма показывает одну
/// сводку (FormErrorSummary), иначе screen reader читает каждую ошибку дважды.
export function FormField({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode | null;
  required?: boolean;
  children: ReactElement;
  className?: string;
}) {
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
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <Label htmlFor={id} required={required}>
          {label}
        </Label>
      ) : null}
      {control}
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-xs text-destructive">
          <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs leading-snug text-subtle-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/// Единственная сводка ошибок формы (role="alert").
export function FormErrorSummary({
  children,
  className,
  ...props
}: {
  children: ReactNode;
  className?: string;
  'data-testid'?: string;
}) {
  return (
    <div
      role="alert"
      className={cn('rounded-lg bg-destructive-soft p-3 text-sm text-destructive', className)}
      {...props}
    >
      {children}
    </div>
  );
}

/// Селектор первого невалидного контрола. data-invalid — для кнопок и прочих
/// элементов, где aria-invalid неприменим.
const INVALID_SELECTOR = '[aria-invalid="true"], [data-invalid="true"]';

/// Возвращает ref контейнера и `focusFirstInvalid`: после ближайшего рендера
/// (когда ошибки уже в DOM) переводит фокус на первое невалидное поле.
export function useFocusFirstInvalid<T extends HTMLElement>(): {
  containerRef: RefObject<T>;
  focusFirstInvalid: () => void;
} {
  const containerRef = useRef<T>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (tick === 0) return;
    containerRef.current?.querySelector<HTMLElement>(INVALID_SELECTOR)?.focus();
  }, [tick]);
  const focusFirstInvalid = useCallback(() => setTick((value) => value + 1), []);
  return { containerRef, focusFirstInvalid };
}
