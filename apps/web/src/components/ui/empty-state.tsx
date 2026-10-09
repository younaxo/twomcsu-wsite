import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: ReactNode;
  title: ReactNode;
  /// Что делать дальше — пустой экран приглашает действовать.
  description?: ReactNode;
  /// Основное действие (Button) и/или вторичное.
  action?: ReactNode;
  size?: 'sm' | 'md';
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = 'md',
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        size === 'md' ? 'min-h-56 gap-3 p-8' : 'min-h-32 gap-2 p-6',
        className,
      )}
      {...props}
    >
      {icon ? (
        <div
          aria-hidden
          className="flex size-10 items-center justify-center text-subtle-foreground [&_svg]:size-6"
        >
          {icon}
        </div>
      ) : null}
      <p className={cn('font-medium', size === 'md' ? 'text-base' : 'text-sm')}>{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
