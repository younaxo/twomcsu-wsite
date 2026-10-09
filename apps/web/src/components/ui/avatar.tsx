'use client';

import { Avatar as RadixAvatar } from 'radix-ui';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const sizeClass: Record<AvatarSize, string> = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-base',
  xl: 'size-20 text-xl',
};

export interface AvatarProps extends ComponentPropsWithoutRef<typeof RadixAvatar.Root> {
  src?: string | null;
  /// Имя пользователя — для alt и инициалов-fallback.
  name: string;
  size?: AvatarSize;
  /// Квадратный (голова скина Minecraft) или круглый — решает направление дизайна
  /// через `--avatar-radius`; здесь только override.
  shape?: 'auto' | 'square' | 'round';
}

function initials(name: string): string {
  return (
    name
      .replace(/[^\p{L}\p{N}]/gu, '')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}

export const Avatar = forwardRef<ElementRef<typeof RadixAvatar.Root>, AvatarProps>(
  ({ className, src, name, size = 'md', shape = 'auto', ...props }, ref) => (
    <RadixAvatar.Root
      ref={ref}
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden bg-muted font-medium text-muted-foreground',
        sizeClass[size],
        shape === 'round' && 'rounded-full',
        shape === 'square' && 'rounded-sm',
        shape === 'auto' && 'rounded-[var(--avatar-radius,var(--radius-sm))]',
        className,
      )}
      {...props}
    >
      {src ? (
        <RadixAvatar.Image
          src={src}
          alt={name}
          draggable={false}
          className="size-full object-cover [image-rendering:pixelated]"
        />
      ) : null}
      <RadixAvatar.Fallback delayMs={src ? 400 : 0} aria-label={name}>
        {initials(name)}
      </RadixAvatar.Fallback>
    </RadixAvatar.Root>
  ),
);
Avatar.displayName = 'Avatar';

export interface AvatarStackProps extends HTMLAttributes<HTMLDivElement> {
  users: { id: string; name: string; src?: string | null }[];
  size?: AvatarSize;
  /// Сколько показать, остальные схлопываются в «+N».
  max?: number;
}

/// Стопка аватаров («сейчас онлайн 128»): первые `max` + счётчик.
export function AvatarStack({
  users,
  size = 'sm',
  max = 4,
  className,
  ...props
}: AvatarStackProps) {
  const visible = users.slice(0, max);
  const rest = users.length - visible.length;
  return (
    <div
      className={cn('flex items-center -space-x-2 [&>*]:ring-2 [&>*]:ring-surface', className)}
      role="group"
      aria-label={`Пользователи: ${users.map((u) => u.name).join(', ')}`}
      {...props}
    >
      {visible.map((user) => (
        <Avatar key={user.id} name={user.name} src={user.src} size={size} />
      ))}
      {rest > 0 ? (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-[var(--avatar-radius,var(--radius-sm))] bg-surface-sunken font-medium tabular text-muted-foreground',
            sizeClass[size],
          )}
        >
          +{rest}
        </span>
      ) : null}
    </div>
  );
}
