import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/// Заглушка загрузки. Размер задаётся классами (`h-4 w-40`). Под
/// reduced-motion мерцание отключено глобально (globals.css).
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-shimmer rounded-sm bg-[linear-gradient(90deg,rgb(var(--muted))_0%,rgb(var(--surface-sunken))_50%,rgb(var(--muted))_100%)] bg-[length:200%_100%]',
        className,
      )}
      {...props}
    />
  );
}

export interface SkeletonTextProps extends HTMLAttributes<HTMLDivElement> {
  lines?: number;
}

/// Несколько строк текста; последняя короче — как настоящий абзац.
export function SkeletonText({ lines = 3, className, ...props }: SkeletonTextProps) {
  return (
    <div aria-hidden className={cn('flex flex-col gap-2', className)} {...props}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={cn('h-3.5', index === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  );
}

export function SkeletonRows({
  rows = 5,
  className,
  ...props
}: { rows?: number } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn('flex flex-col divide-y divide-border-subtle', className)}
      {...props}
    >
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex h-row items-center gap-4 px-4">
          <Skeleton className="size-6 shrink-0" />
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3.5 w-1/5" />
          <Skeleton className="ml-auto h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}
