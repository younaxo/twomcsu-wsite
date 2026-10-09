import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface KbdProps extends HTMLAttributes<HTMLElement> {
  /// Инвертированная версия для тёмного фона tooltip.
  inverted?: boolean;
}

/// Клавиша: ⌘, K, Esc. Моноширинный, табличные цифры, не переносится.
export function Kbd({ className, inverted = false, ...props }: KbdProps) {
  return (
    <kbd
      translate="no"
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-sm border px-1 font-mono text-[11px] font-medium tabular',
        inverted
          ? 'border-background/25 bg-background/10 text-background'
          : 'border-border-strong bg-surface-sunken text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}
