'use client';

import { Check } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './button';

export interface WizardStep {
  id: string;
  title: ReactNode;
  description?: ReactNode;
}

export interface WizardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  steps: WizardStep[];
  /// Индекс текущего шага (с 0).
  current: number;
  /// Переход по клику на пройденный шаг в индикаторе; без пропа шаги некликабельны.
  onStepChange?: (index: number) => void;
  /// Содержимое текущего шага.
  children: ReactNode;
  /// Валидацию делает вызывающий код — здесь только блокировка кнопок.
  canBack?: boolean;
  canNext?: boolean;
  onBack?: () => void;
  onNext?: () => void;
  onFinish?: () => void;
  /// Отправка/проверка шага — спиннер на основной кнопке, остальное заблокировано.
  loading?: boolean;
  backLabel?: string;
  nextLabel?: string;
  finishLabel?: string;
}

type StepState = 'complete' | 'current' | 'upcoming';

/// Контейнер многошаговой формы (регистрация, покупка, создание тикета):
/// индикатор шагов, заголовок шага, содержимое и футер «Назад / Далее / Завершить».
export function Wizard({
  steps,
  current,
  onStepChange,
  children,
  canBack = true,
  canNext = true,
  onBack,
  onNext,
  onFinish,
  loading = false,
  backLabel = 'Назад',
  nextLabel = 'Далее',
  finishLabel = 'Завершить',
  className,
  ...props
}: WizardProps) {
  const total = steps.length;
  const index = Math.min(Math.max(0, current), Math.max(0, total - 1));
  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const progress = total > 0 ? Math.round(((index + 1) / total) * 100) : 0;

  return (
    <div className={cn('flex flex-col gap-gap', className)} {...props}>
      {/* Desktop: индикатор шагов с соединительными линиями. */}
      <ol aria-label="Шаги" className="hidden items-center md:flex">
        {steps.map((item, itemIndex) => {
          const state: StepState =
            itemIndex < index ? 'complete' : itemIndex === index ? 'current' : 'upcoming';
          const clickable = state === 'complete' && !!onStepChange && !loading;
          const content = (
            <>
              <span
                aria-hidden
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular',
                  state === 'complete' && 'border-primary bg-primary text-primary-foreground',
                  state === 'current' && 'border-primary text-primary-soft-foreground',
                  state === 'upcoming' && 'border-border-strong text-muted-foreground',
                )}
              >
                {state === 'complete' ? <Check className="size-3.5" /> : itemIndex + 1}
              </span>
              <span
                className={cn(
                  'whitespace-nowrap text-sm',
                  state === 'current' ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {item.title}
              </span>
              {state === 'complete' ? <span className="sr-only">, выполнен</span> : null}
            </>
          );
          return (
            <li
              key={item.id}
              aria-current={state === 'current' ? 'step' : undefined}
              className="flex min-w-0 items-center [&:not(:last-child)]:flex-1"
            >
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onStepChange(itemIndex)}
                  className="flex items-center gap-2 rounded-sm transition-colors duration-fast hover:text-foreground"
                >
                  {content}
                </button>
              ) : (
                <span className="flex items-center gap-2">{content}</span>
              )}
              {itemIndex < total - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    'mx-3 h-px min-w-4 flex-1',
                    itemIndex < index ? 'bg-primary' : 'bg-border',
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>

      {/* Mobile: «Шаг 2 из 4» + тонкий прогресс. */}
      <div className="flex flex-col gap-2 md:hidden">
        <p aria-live="polite" className="text-xs text-muted-foreground tabular">
          Шаг {index + 1} из {total}
        </p>
        <div
          role="progressbar"
          aria-label="Прогресс"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="h-1 w-full overflow-hidden rounded-full bg-surface-sunken"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-slow"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {step ? (
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold leading-tight">{step.title}</h2>
          {step.description ? (
            <p className="text-sm text-muted-foreground">{step.description}</p>
          ) : null}
        </div>
      ) : null}

      <div key={step?.id} className="animate-fade-in" aria-busy={loading || undefined}>
        {children}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-4">
        <Button variant="secondary" onClick={onBack} disabled={isFirst || !canBack || loading}>
          {backLabel}
        </Button>
        {isLast ? (
          <Button onClick={onFinish} loading={loading} disabled={!canNext}>
            {finishLabel}
          </Button>
        ) : (
          <Button onClick={onNext} loading={loading} disabled={!canNext}>
            {nextLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
