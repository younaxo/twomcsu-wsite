import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface SeparatorProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
  /// Декоративный разделитель скрыт от assistive tech; семантический — `<hr>`-роль.
  decorative?: boolean;
}

export function Separator({
  orientation = 'horizontal',
  decorative = true,
  className,
  ...props
}: SeparatorProps) {
  return (
    <div
      role={decorative ? 'none' : 'separator'}
      aria-orientation={decorative ? undefined : orientation}
      className={cn(
        'shrink-0 bg-border-subtle',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  );
}

/// Разделитель с подписью по центру («или» между способами входа): тонкие
/// линии темы, подпись приглушённая, линии не ярче основной сетки.
export function LabeledSeparator({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      className={cn('flex items-center gap-3 text-xs text-subtle-foreground', className)}
    >
      <span aria-hidden className="h-px flex-1 bg-border-subtle" />
      <span className="shrink-0 select-none">{children}</span>
      <span aria-hidden className="h-px flex-1 bg-border-subtle" />
    </div>
  );
}
