import { Loader2 } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: 'sm' | 'md' | 'lg';
  /// Текст для screen reader (по умолчанию «Загрузка…»).
  label?: string;
}

const sizeClass = { sm: 'size-4', md: 'size-5', lg: 'size-8' } as const;

export function Spinner({ size = 'md', label = 'Загрузка…', className, ...props }: SpinnerProps) {
  return (
    <span role="status" className={cn('inline-flex items-center', className)} {...props}>
      <Loader2 aria-hidden className={cn('animate-spin text-muted-foreground', sizeClass[size])} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/// Центрированный спиннер на всю область (первичная загрузка страницы/секции).
export function LoadingBlock({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex min-h-40 items-center justify-center', className)}>
      <Spinner size="lg" label={label} />
    </div>
  );
}
