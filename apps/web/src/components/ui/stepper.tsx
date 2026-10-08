'use client';

import { Check, Minus, Plus } from 'lucide-react';
import {
  Children,
  cloneElement,
  createContext,
  forwardRef,
  isValidElement,
  useContext,
  useState,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';
import { IconButton } from './button';
import { inputClassName } from './input';
import { Progress } from './progress';

/// Два компонента: `NumberStepper` — числовое поле с кнопками −/+ (количество,
/// длительность), `Steps`/`StepsItem` — индикатор шагов мастера.

/* ---------------------------------- NumberStepper --------------------------------- */

export interface NumberStepperProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'defaultValue' | 'onChange' | 'size' | 'min' | 'max' | 'step'
> {
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  size?: 'sm' | 'md';
  invalid?: boolean;
  /// Класс для обёртки; `className` уходит на сам input.
  wrapperClassName?: string;
  decrementLabel?: string;
  incrementLabel?: string;
}

const stepperSizeClass = {
  sm: { input: 'h-control-sm px-7', button: 'left-1 size-6', buttonRight: 'right-1 size-6' },
  md: { input: 'h-control px-9', button: 'left-1', buttonRight: 'right-1' },
} as const;

function clamp(value: number, min?: number, max?: number): number {
  let next = value;
  if (min !== undefined) {
    next = Math.max(min, next);
  }
  if (max !== undefined) {
    next = Math.min(max, next);
  }
  return next;
}

/// Количество знаков после запятой у шага — чтобы 0.1 + 0.2 не давало 0.30000000000000004.
function precisionOf(step: number): number {
  const text = String(step);
  const index = text.indexOf('.');
  return index === -1 ? 0 : text.length - index - 1;
}

/// Числовое поле с кнопками −/+. `ref`, `id`, `aria-*` — на `<input>` (так его
/// оборачивает `Field`); кнопки вне tab-порядка: с клавиатуры работают
/// стрелки ↑/↓ самого поля. Значение прижимается к min/max на blur и кнопками.
export const NumberStepper = forwardRef<HTMLInputElement, NumberStepperProps>(
  (
    {
      value,
      defaultValue,
      onValueChange,
      min,
      max,
      step = 1,
      size = 'md',
      invalid,
      className,
      wrapperClassName,
      disabled,
      readOnly,
      decrementLabel = 'Уменьшить',
      incrementLabel = 'Увеличить',
      onFocus,
      onBlur,
      ...props
    },
    ref,
  ) => {
    const [internal, setInternal] = useState<number>(defaultValue ?? min ?? 0);
    const current = value ?? internal;
    const [draft, setDraft] = useState('');
    const [editing, setEditing] = useState(false);
    const displayed = editing ? draft : String(current);
    const precision = precisionOf(step);

    const commit = (next: number) => {
      const rounded = Number(next.toFixed(precision));
      if (value === undefined) {
        setInternal(rounded);
      }
      if (rounded !== current) {
        onValueChange?.(rounded);
      }
    };

    const canDecrement = !disabled && !readOnly && (min === undefined || current > min);
    const canIncrement = !disabled && !readOnly && (max === undefined || current < max);
    const sizes = stepperSizeClass[size];

    return (
      <div className={cn('relative inline-flex w-full items-center', wrapperClassName)}>
        <IconButton
          type="button"
          size="sm"
          variant="ghost"
          tabIndex={-1}
          aria-label={decrementLabel}
          disabled={!canDecrement}
          onClick={() => commit(clamp(current - step, min, max))}
          className={cn('absolute top-1/2 z-10 -translate-y-1/2', sizes.button)}
        >
          <Minus />
        </IconButton>
        <input
          ref={ref}
          type="number"
          inputMode={precision > 0 ? 'decimal' : 'numeric'}
          min={min}
          max={max}
          step={step}
          value={displayed}
          disabled={disabled}
          readOnly={readOnly}
          aria-invalid={invalid || props['aria-invalid'] || undefined}
          onFocus={(event) => {
            setDraft(String(current));
            setEditing(true);
            onFocus?.(event);
          }}
          onChange={(event) => {
            setDraft(event.target.value);
            const parsed = event.target.valueAsNumber;
            if (Number.isFinite(parsed)) {
              commit(parsed);
            }
          }}
          onBlur={(event) => {
            setEditing(false);
            const parsed = Number(draft);
            commit(
              clamp(draft.trim() === '' || !Number.isFinite(parsed) ? current : parsed, min, max),
            );
            onBlur?.(event);
          }}
          className={cn(
            inputClassName,
            'text-center tabular [appearance:textfield]',
            '[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
            sizes.input,
            className,
          )}
          {...props}
        />
        <IconButton
          type="button"
          size="sm"
          variant="ghost"
          tabIndex={-1}
          aria-label={incrementLabel}
          disabled={!canIncrement}
          onClick={() => commit(clamp(current + step, min, max))}
          className={cn('absolute top-1/2 z-10 -translate-y-1/2', sizes.buttonRight)}
        >
          <Plus />
        </IconButton>
      </div>
    );
  },
);
NumberStepper.displayName = 'NumberStepper';

/* -------------------------------------- Steps ------------------------------------- */

export type StepStatus = 'done' | 'current' | 'upcoming';

interface StepsContextValue {
  current: number;
  total: number;
}

const StepsContext = createContext<StepsContextValue>({ current: 0, total: 0 });

export interface StepsItemProps extends Omit<HTMLAttributes<HTMLLIElement>, 'children'> {
  label: ReactNode;
  description?: ReactNode;
  /// Порядковый номер — проставляет `Steps`, вручную не задаётся.
  index?: number;
  /// Переопределить статус (по умолчанию считается от `current` у Steps).
  status?: StepStatus;
}

const STATUS_TEXT: Record<StepStatus, string> = {
  done: 'Выполнен',
  current: 'Текущий шаг',
  upcoming: 'Предстоит',
};

export function StepsItem({
  label,
  description,
  index = 0,
  status: statusProp,
  className,
  ...props
}: StepsItemProps) {
  const { current, total } = useContext(StepsContext);
  const status: StepStatus =
    statusProp ?? (index < current ? 'done' : index === current ? 'current' : 'upcoming');
  const isLast = index === total - 1;
  return (
    <li
      aria-current={status === 'current' ? 'step' : undefined}
      className={cn('flex min-w-0 items-start gap-3', !isLast && 'flex-1', className)}
      {...props}
    >
      <span
        className={cn(
          'inline-flex size-7 shrink-0 items-center justify-center rounded-sm border text-sm font-medium tabular',
          status === 'done' && 'border-primary bg-primary-soft text-primary-soft-foreground',
          status === 'current' && 'border-primary bg-primary text-primary-foreground shadow-edge',
          status === 'upcoming' && 'border-border bg-muted text-muted-foreground',
        )}
      >
        {status === 'done' ? <Check aria-hidden className="size-4" /> : index + 1}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 pt-1">
        <span
          className={cn(
            'text-sm font-medium leading-5',
            status === 'upcoming' ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          <span className="sr-only">{STATUS_TEXT[status]}: </span>
          {label}
        </span>
        {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
      </span>
      {!isLast ? (
        <span
          aria-hidden
          className={cn(
            'mt-3.5 h-px min-w-6 flex-1',
            status === 'done' ? 'bg-primary' : 'bg-border',
          )}
        />
      ) : null}
    </li>
  );
}

export interface StepsProps extends HTMLAttributes<HTMLElement> {
  /// Индекс текущего шага, с нуля.
  current: number;
  /// Всегда показывать компактный вид («Шаг 2 из 4» + прогресс), а не только на mobile.
  compact?: boolean;
  /// Элементы `StepsItem` по порядку.
  children: ReactNode;
}

/// Индикатор шагов мастера. На ≥ md — горизонтальный список с номерами и
/// соединительными линиями; на mobile — строка «Шаг N из M» и полоса прогресса.
export const Steps = forwardRef<HTMLElement, StepsProps>(
  ({ current, compact = false, children, className, ...props }, ref) => {
    const items = Children.toArray(children).filter(
      (child): child is ReactElement<StepsItemProps> => isValidElement<StepsItemProps>(child),
    );
    const total = items.length;
    const safeCurrent = Math.max(0, Math.min(current, Math.max(total - 1, 0)));
    const currentLabel = items[safeCurrent]?.props.label;
    const progress = total === 0 ? 0 : ((safeCurrent + 1) / total) * 100;
    const summary = `Шаг ${safeCurrent + 1} из ${total}`;

    return (
      <nav ref={ref} aria-label="Шаги" className={className} {...props}>
        <div className={cn('flex flex-col gap-2', !compact && 'md:hidden')}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium text-foreground">{currentLabel}</span>
            <span className="shrink-0 text-muted-foreground tabular">{summary}</span>
          </div>
          <Progress value={progress} size="sm" label={summary} />
        </div>
        <StepsContext.Provider value={{ current: safeCurrent, total }}>
          <ol className={cn('items-start gap-2', compact ? 'hidden' : 'hidden md:flex')}>
            {items.map((child, index) => cloneElement(child, { index, key: child.key ?? index }))}
          </ol>
        </StepsContext.Provider>
      </nav>
    );
  },
);
Steps.displayName = 'Steps';
