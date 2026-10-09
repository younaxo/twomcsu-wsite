'use client';

import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { Portal } from 'radix-ui';
import { forwardRef, useId, useState, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { IconButton } from './button';

export type FloatingPanelPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export interface FloatingPanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /// Иконка слева от заголовка (16px).
  icon?: ReactNode;
  /// Контролируемое состояние «свёрнуто»; без него — внутреннее.
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /// Можно ли сворачивать (кнопка в заголовке).
  collapsible?: boolean;
  position?: FloatingPanelPosition;
  /// Нижняя полоса с действиями (видна только в развёрнутом состоянии).
  footer?: ReactNode;
  children: ReactNode;
}

const positionClass: Record<FloatingPanelPosition, string> = {
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'top-right': 'top-4 right-4',
  'top-left': 'top-4 left-4',
};

/// FloatingPanel — немодальная рабочая панель поверх страницы: прогресс
/// массовой операции, черновик ответа, мини-консоль. Не перехватывает фокус
/// и не блокирует страницу; z-40 — ниже модальных overlay (z-50).
/// Перетаскивание не поддерживается — позиция задаётся `position`.
export const FloatingPanel = forwardRef<HTMLElement, FloatingPanelProps>(
  (
    {
      open,
      onOpenChange,
      title,
      icon,
      collapsed,
      defaultCollapsed = false,
      onCollapsedChange,
      collapsible = true,
      position = 'bottom-right',
      footer,
      children,
      className,
      ...props
    },
    ref,
  ) => {
    const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
    const isCollapsed = collapsed ?? internalCollapsed;
    const bodyId = useId();

    const setCollapsed = (next: boolean) => {
      if (collapsed === undefined) {
        setInternalCollapsed(next);
      }
      onCollapsedChange?.(next);
    };

    if (!open) {
      return null;
    }

    return (
      <Portal.Root>
        <section
          ref={ref}
          aria-label={typeof title === 'string' ? title : props['aria-label']}
          className={cn(
            'fixed z-40 flex w-80 max-w-[calc(100vw-2rem)] flex-col',
            'rounded-lg border bg-surface-overlay text-foreground shadow-lg edge-highlight',
            'animate-pop-in [--pop-y:8px]',
            positionClass[position],
            className,
          )}
          {...props}
        >
          <header
            className={cn(
              'flex h-control shrink-0 items-center gap-2 pl-4 pr-2',
              !isCollapsed && 'border-b border-border-subtle',
            )}
          >
            {icon ? (
              <span
                aria-hidden
                className="inline-flex shrink-0 text-muted-foreground [&_svg]:size-4"
              >
                {icon}
              </span>
            ) : null}
            <h2 className="min-w-0 flex-1 truncate font-sans text-sm font-medium tracking-normal">
              {title}
            </h2>
            {collapsible ? (
              <IconButton
                size="sm"
                aria-label={isCollapsed ? 'Развернуть' : 'Свернуть'}
                aria-expanded={!isCollapsed}
                aria-controls={bodyId}
                onClick={() => setCollapsed(!isCollapsed)}
              >
                {isCollapsed ? <ChevronUp /> : <ChevronDown />}
              </IconButton>
            ) : null}
            <IconButton size="sm" aria-label="Закрыть" onClick={() => onOpenChange(false)}>
              <X />
            </IconButton>
          </header>
          <div id={bodyId} hidden={isCollapsed} className="flex min-h-0 flex-col">
            <div className="max-h-[min(24rem,calc(100dvh-8rem))] overflow-y-auto overscroll-contain p-4 text-sm scrollbar-thin">
              {children}
            </div>
            {footer ? (
              <div className="flex items-center gap-2 border-t border-border-subtle px-4 py-3">
                {footer}
              </div>
            ) : null}
          </div>
        </section>
      </Portal.Root>
    );
  },
);
FloatingPanel.displayName = 'FloatingPanel';
