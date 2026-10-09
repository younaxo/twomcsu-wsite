import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /// `raised` — поверхность с тенью/кромкой (модули дашборда);
  /// `flat` — без тени, только граница (вложенные блоки, таблицы);
  /// `sunken` — утопленная зона (фильтры, код, служебные блоки).
  variant?: 'raised' | 'flat' | 'sunken';
  /// Убрать внутренние отступы (таблица на всю ширину карточки).
  flush?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'raised', flush = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border text-foreground',
        variant === 'raised' && 'bg-surface-raised shadow',
        variant === 'flat' && 'bg-surface',
        variant === 'sunken' && 'border-border-subtle bg-surface-sunken',
        !flush && 'p-card-p',
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-start justify-between gap-3 pb-4', className)} {...props} />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-base font-semibold leading-tight', className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center gap-2 border-t border-border-subtle pt-4', className)}
      {...props}
    />
  );
}
