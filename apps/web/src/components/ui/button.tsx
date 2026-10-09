'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { Slot } from 'radix-ui';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export const buttonVariants = cva(
  [
    'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap',
    'rounded font-medium transition-[background-color,color,border-color,box-shadow] duration-fast',
    // Недоступность видна курсором (не pointer-events-none — иначе курсор не
    // меняется); у недоступных hover/active сброшены к исходному виду в вариантах.
    // Во время загрузки — курсор ожидания.
    'disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
    'data-[loading=true]:cursor-wait',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground shadow-edge hover:bg-primary-hover active:bg-primary-active disabled:hover:bg-primary aria-disabled:hover:bg-primary disabled:active:bg-primary aria-disabled:active:bg-primary',
        secondary:
          'border border-border bg-surface text-foreground shadow-sm hover:bg-muted active:bg-surface-sunken disabled:hover:bg-surface aria-disabled:hover:bg-surface disabled:active:bg-surface aria-disabled:active:bg-surface',
        ghost:
          'text-foreground hover:bg-muted active:bg-surface-sunken disabled:hover:bg-transparent aria-disabled:hover:bg-transparent disabled:active:bg-transparent aria-disabled:active:bg-transparent',
        outline:
          'border border-border-strong bg-transparent text-foreground hover:bg-muted active:bg-surface-sunken disabled:hover:bg-transparent aria-disabled:hover:bg-transparent disabled:active:bg-transparent aria-disabled:active:bg-transparent',
        destructive:
          'bg-destructive text-destructive-foreground hover:brightness-110 active:brightness-95 disabled:hover:brightness-100 aria-disabled:hover:brightness-100 disabled:active:brightness-100 aria-disabled:active:brightness-100',
        'destructive-outline':
          'border border-destructive/40 bg-transparent text-destructive hover:bg-destructive-soft disabled:hover:bg-transparent aria-disabled:hover:bg-transparent',
        link: 'h-auto px-0 text-primary-soft-foreground underline-offset-4 hover:underline disabled:hover:no-underline aria-disabled:hover:no-underline',
      },
      size: {
        sm: 'h-control-sm px-3 text-sm',
        md: 'h-control px-control-px text-sm',
        lg: 'h-control-lg px-5 text-base',
        icon: 'size-[var(--control-h)] p-0',
        'icon-sm': 'size-[var(--control-h-sm)] p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /// Рендерить дочерний элемент (например `<Link>`) с классами кнопки.
  asChild?: boolean;
  /// Показать спиннер и заблокировать повторный клик; текст остаётся.
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, disabled, children, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot.Root : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        data-loading={loading || undefined}
        type={asChild ? undefined : (props.type ?? 'button')}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading ? <Loader2 aria-hidden className="animate-spin" /> : null}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export interface IconButtonProps extends Omit<ButtonProps, 'size' | 'children'> {
  /// Обязательная доступная подпись: у icon-only кнопки нет текста.
  'aria-label': string;
  size?: 'md' | 'sm';
  children: React.ReactNode;
}

/// Кнопка-иконка: квадратная, с обязательным aria-label.
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ size = 'md', variant = 'ghost', ...props }, ref) => (
    <Button ref={ref} variant={variant} size={size === 'sm' ? 'icon-sm' : 'icon'} {...props} />
  ),
);
IconButton.displayName = 'IconButton';
