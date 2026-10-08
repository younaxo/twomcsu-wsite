'use client';

import { ChevronDown, CircleAlert, CircleCheck, Info, Loader2, X } from 'lucide-react';
import { Portal } from 'radix-ui';
import { forwardRef, useId, useState, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { IconButton } from './button';
import { Progress } from './progress';

export type DynamicIslandStatus = 'loading' | 'success' | 'error' | 'info';

export interface DynamicIslandProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  status: DynamicIslandStatus;
  /// Короткий статус в одну строку («Экспорт игроков…», «Бан применён»).
  title: ReactNode;
  /// Подробности — видны в развёрнутом состоянии.
  description?: ReactNode;
  /// 0..100 — полоса прогресса; `null` — неопределённый прогресс; без значения — нет полосы.
  progress?: number | null;
  /// Действие в развёрнутом состоянии (Button: «Отменить», «Показать»).
  action?: ReactNode;
  /// Кнопка закрытия; без неё элемент скрывает только вызывающий код.
  onDismiss?: () => void;
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

const STATUS: Record<DynamicIslandStatus, { icon: ReactNode; label: string }> = {
  loading: {
    icon: <Loader2 aria-hidden className="size-4 animate-spin text-muted-foreground" />,
    label: 'Выполняется',
  },
  success: { icon: <CircleCheck aria-hidden className="size-4 text-success" />, label: 'Готово' },
  error: { icon: <CircleAlert aria-hidden className="size-4 text-destructive" />, label: 'Ошибка' },
  info: { icon: <Info aria-hidden className="size-4 text-info" />, label: 'Информация' },
};

/// DynamicIsland — компактный статус фоновой операции вверху по центру:
/// экспорт, массовый бан, перезапуск сервера, синхронизация. Один на экран.
///
/// Только для реальных фоновых операций с понятным концом — не для декора,
/// не вместо `toast` (разовое сообщение) и не вместо `Progress` внутри формы.
/// Статус объявляется screen reader'ом через `aria-live="polite"`; смена
/// `status`/`title` — это и есть объявление, не перерисовывайте элемент заново.
export const DynamicIsland = forwardRef<HTMLDivElement, DynamicIslandProps>(
  (
    {
      status,
      title,
      description,
      progress,
      action,
      onDismiss,
      expanded,
      defaultExpanded = false,
      onExpandedChange,
      className,
      ...props
    },
    ref,
  ) => {
    const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
    const isExpanded = expanded ?? internalExpanded;
    const detailsId = useId();
    const expandable = Boolean(description || action);
    const meta = STATUS[status];

    const setExpanded = (next: boolean) => {
      if (expanded === undefined) {
        setInternalExpanded(next);
      }
      onExpandedChange?.(next);
    };

    const summary = (
      <>
        <span className="shrink-0">{meta.icon}</span>
        <span className="sr-only">{meta.label}: </span>
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        {typeof progress === 'number' ? (
          <span className="shrink-0 text-xs text-muted-foreground tabular">
            {Math.round(Math.max(0, Math.min(100, progress)))}%
          </span>
        ) : null}
        {expandable ? (
          <ChevronDown
            aria-hidden
            className={cn(
              'size-4 shrink-0 text-subtle-foreground transition-transform duration-fast',
              isExpanded && 'rotate-180',
            )}
          />
        ) : null}
      </>
    );

    return (
      <Portal.Root>
        {/* Обёртка центрирует без transform — его перебивают keyframes pop-in. */}
        <div className="pointer-events-none fixed inset-x-4 top-3 z-50 flex justify-center">
          <div
            ref={ref}
            role="status"
            aria-live="polite"
            data-status={status}
            className={cn(
              'pointer-events-auto flex w-max max-w-full flex-col',
              'rounded-lg glass-liquid text-sm text-foreground',
              'animate-pop-in [--pop-y:-8px]',
              isExpanded ? 'min-w-[min(20rem,100%)]' : 'min-w-0',
              className,
            )}
            {...props}
          >
            <div className="flex items-center gap-1 pr-1">
              {expandable ? (
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  aria-controls={detailsId}
                  onClick={() => setExpanded(!isExpanded)}
                  className="flex h-control min-w-0 flex-1 items-center gap-2 rounded-lg pl-3 pr-2 text-left hover:bg-muted"
                >
                  {summary}
                </button>
              ) : (
                <div className="flex h-control min-w-0 flex-1 items-center gap-2 pl-3 pr-2">
                  {summary}
                </div>
              )}
              {onDismiss ? (
                <IconButton size="sm" aria-label="Закрыть" onClick={onDismiss}>
                  <X />
                </IconButton>
              ) : null}
            </div>
            {progress !== undefined ? (
              <div className="px-3 pb-2.5">
                <Progress
                  value={progress}
                  size="sm"
                  tone={status === 'error' ? 'destructive' : 'primary'}
                />
              </div>
            ) : null}
            {expandable ? (
              <div
                id={detailsId}
                hidden={!isExpanded}
                className="animate-fade-in border-t border-border-subtle px-3 py-2.5"
              >
                {description ? <p className="text-muted-foreground">{description}</p> : null}
                {action ? (
                  <div className={cn('flex gap-2', description && 'mt-2')}>{action}</div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </Portal.Root>
    );
  },
);
DynamicIsland.displayName = 'DynamicIsland';
