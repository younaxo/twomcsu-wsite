import { cva, type VariantProps } from 'class-variance-authority';
import { Ban, Check, CircleDot, Clock, Minus, TriangleAlert } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-xs font-medium leading-4 [&_svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-muted text-muted-foreground',
        primary: 'border-transparent bg-primary-soft text-primary-soft-foreground',
        success: 'border-transparent bg-success-soft text-success',
        warning: 'border-transparent bg-warning-soft text-warning',
        destructive: 'border-transparent bg-destructive-soft text-destructive',
        info: 'border-transparent bg-info-soft text-info',
        outline: 'border-border-strong bg-transparent text-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'color'>, VariantProps<typeof badgeVariants> {
  /// Цветная точка/иконка слева — чтобы статус читался не только цветом.
  icon?: ReactNode;
  /// Произвольный цвет роли (`Role.color`, hex из API) — только для ролей.
  color?: string | null;
}

export function Badge({ className, tone, icon, color, style, children, ...props }: BadgeProps) {
  const roleStyle = color
    ? { ...style, borderColor: color, color, backgroundColor: `${color}1a` }
    : style;
  return (
    <span
      className={cn(badgeVariants({ tone: color ? 'outline' : tone }), className)}
      style={roleStyle}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}

export type Status = 'online' | 'offline' | 'idle' | 'pending' | 'active' | 'blocked' | 'warning';

const STATUS: Record<Status, { tone: BadgeProps['tone']; icon: ReactNode; label: string }> = {
  online: { tone: 'success', icon: <CircleDot aria-hidden />, label: 'Онлайн' },
  active: { tone: 'success', icon: <Check aria-hidden />, label: 'Активен' },
  offline: { tone: 'neutral', icon: <Minus aria-hidden />, label: 'Офлайн' },
  idle: { tone: 'neutral', icon: <Clock aria-hidden />, label: 'Неактивен' },
  pending: { tone: 'warning', icon: <Clock aria-hidden />, label: 'Ожидает' },
  warning: { tone: 'warning', icon: <TriangleAlert aria-hidden />, label: 'Внимание' },
  blocked: { tone: 'destructive', icon: <Ban aria-hidden />, label: 'Заблокирован' },
};

export interface StatusBadgeProps extends Omit<BadgeProps, 'tone' | 'icon' | 'children'> {
  status: Status;
  /// Переопределить подпись (например «Забанен до 12.10»).
  children?: ReactNode;
}

/// Статус с иконкой и текстом: цвет никогда не единственный носитель смысла.
export function StatusBadge({ status, children, ...props }: StatusBadgeProps) {
  const meta = STATUS[status];
  return (
    <Badge tone={meta.tone} icon={meta.icon} {...props}>
      {children ?? meta.label}
    </Badge>
  );
}
