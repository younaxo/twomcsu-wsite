import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  /// 0..100; `null` — неопределённый прогресс.
  value: number | null;
  label?: string;
  tone?: 'primary' | 'success' | 'warning' | 'destructive';
  size?: 'sm' | 'md';
}

const toneClass = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
} as const;

export function Progress({
  value,
  label = 'Прогресс',
  tone = 'primary',
  size = 'md',
  className,
  ...props
}: ProgressProps) {
  const clamped = value === null ? null : Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped ?? undefined}
      aria-valuetext={clamped === null ? 'Выполняется' : `${Math.round(clamped)}%`}
      className={cn(
        'relative w-full overflow-hidden rounded-full bg-surface-sunken',
        size === 'sm' ? 'h-1' : 'h-2',
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-slow',
          toneClass[tone],
          clamped === null && 'w-1/3 animate-shimmer bg-[length:200%_100%]',
        )}
        style={clamped === null ? undefined : { width: `${clamped}%` }}
      />
    </div>
  );
}

export interface ProgressRingProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  tone?: ProgressProps['tone'];
  /// Текст в центре (по умолчанию проценты).
  children?: React.ReactNode;
}

const toneStroke = {
  primary: 'stroke-primary',
  success: 'stroke-success',
  warning: 'stroke-warning',
  destructive: 'stroke-destructive',
} as const;

/// Кольцо прогресса для компактных мест (загрузка, прогресс достижения).
export function ProgressRing({
  value,
  size = 48,
  strokeWidth = 4,
  label = 'Прогресс',
  tone = 'primary',
  className,
  children,
  ...props
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      {...props}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-surface-sunken"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn('transition-[stroke-dashoffset] duration-slow', toneStroke[tone])}
        />
      </svg>
      <span className="absolute text-xs font-medium tabular">
        {children ?? `${Math.round(clamped)}%`}
      </span>
    </div>
  );
}
