import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TimelineItemProps extends Omit<HTMLAttributes<HTMLLIElement>, 'title'> {
  /// Маркер слева (иконка или точка); цвет через tone.
  icon?: ReactNode;
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'destructive' | 'info';
  title: ReactNode;
  /// Время/мета справа или под заголовком.
  meta?: ReactNode;
  children?: ReactNode;
}

const toneClass = {
  neutral: 'border-border-strong bg-surface text-muted-foreground',
  primary: 'border-primary bg-primary-soft text-primary-soft-foreground',
  success: 'border-success bg-success-soft text-success',
  warning: 'border-warning bg-warning-soft text-warning',
  destructive: 'border-destructive bg-destructive-soft text-destructive',
  info: 'border-info bg-info-soft text-info',
} as const;

/// Хронология (audit log, история наказаний, события). Семантически — список.
export function Timeline({ className, ...props }: HTMLAttributes<HTMLOListElement>) {
  return <ol className={cn('relative flex flex-col', className)} {...props} />;
}

export function TimelineItem({
  icon,
  tone = 'neutral',
  title,
  meta,
  children,
  className,
  ...props
}: TimelineItemProps) {
  return (
    <li className={cn('relative flex gap-3 pb-5 last:pb-0', className)} {...props}>
      <div className="flex flex-col items-center">
        <span
          aria-hidden
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-full border-2 [&_svg]:size-3',
            toneClass[tone],
          )}
        >
          {icon ?? <span className="size-1.5 rounded-full bg-current" />}
        </span>
        <span aria-hidden className="mt-1 w-px flex-1 bg-border group-last:hidden" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-sm font-medium">{title}</p>
          {meta ? <p className="text-xs tabular text-subtle-foreground">{meta}</p> : null}
        </div>
        {children ? <div className="mt-1 text-sm text-muted-foreground">{children}</div> : null}
      </div>
    </li>
  );
}
