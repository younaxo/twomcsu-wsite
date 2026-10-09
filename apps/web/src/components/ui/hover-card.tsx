'use client';

import { HoverCard as RadixHoverCard } from 'radix-ui';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Avatar } from './avatar';
import { Badge, StatusBadge } from './badge';

/// HoverCard — превью по наведению/фокусу на ссылку (профиль игрока,
/// карточка сервера). На touch-устройствах hover нет — триггер обязан быть
/// настоящей ссылкой, по которой можно перейти; карточка лишь ускоряет.
/// Контент не для действий: кнопки и формы — в `Popover`.

export type HoverCardProps = ComponentPropsWithoutRef<typeof RadixHoverCard.Root>;

export function HoverCard({ openDelay = 300, closeDelay = 100, ...props }: HoverCardProps) {
  return <RadixHoverCard.Root openDelay={openDelay} closeDelay={closeDelay} {...props} />;
}

export const HoverCardTrigger = RadixHoverCard.Trigger;
export const HoverCardPortal = RadixHoverCard.Portal;

export const hoverCardContentClassName = cn(
  'z-popover w-72 max-w-[calc(100vw-2rem)] rounded-lg bg-surface-overlay p-4 text-foreground shadow-lg edge-highlight',
  'max-h-[var(--radix-hover-card-content-available-height)] overflow-y-auto overscroll-contain scrollbar-thin',
  'origin-[var(--radix-hover-card-content-transform-origin)]',
  'data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out',
  '[--pop-y:-4px] data-[side=top]:[--pop-y:4px] data-[side=left]:[--pop-y:0] data-[side=right]:[--pop-y:0]',
);

export const HoverCardContent = forwardRef<
  ElementRef<typeof RadixHoverCard.Content>,
  ComponentPropsWithoutRef<typeof RadixHoverCard.Content>
>(({ className, sideOffset = 6, collisionPadding = 8, ...props }, ref) => (
  <RadixHoverCard.Portal>
    <RadixHoverCard.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(hoverCardContentClassName, className)}
      {...props}
    />
  </RadixHoverCard.Portal>
));
HoverCardContent.displayName = 'HoverCardContent';

export interface UserHoverCardProps {
  username: string;
  /// Вторая строка под ником: «@tag», UUID, дискриминатор.
  tag?: ReactNode;
  role?: ReactNode;
  /// Цвет роли из API (hex) — `Badge` покажет его как outline.
  roleColor?: string | null;
  /// Не передавать, если статус неизвестен — бейдж не покажется.
  online?: boolean;
  avatar?: string | null;
  /// Дополнительная строка: «На сервере с 2021», «Наиграно 120 ч».
  description?: ReactNode;
  /// Триггер — ссылка/кнопка с ником (должна быть фокусируемой).
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  /// Если триггер уже является ссылкой/кнопкой — true (по умолчанию).
  asChild?: boolean;
}

/// Карточка пользователя при наведении на ник: аватар, ник, роль, статус.
export function UserHoverCard({
  username,
  tag,
  role,
  roleColor,
  online,
  avatar,
  description,
  children,
  side = 'bottom',
  align = 'start',
  asChild = true,
}: UserHoverCardProps) {
  return (
    <HoverCard>
      <HoverCardTrigger asChild={asChild}>{children}</HoverCardTrigger>
      <HoverCardContent side={side} align={align}>
        <div className="flex items-start gap-3">
          <Avatar name={username} src={avatar} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium leading-tight">{username}</p>
            {tag ? <p className="mt-0.5 truncate text-xs text-subtle-foreground">{tag}</p> : null}
            {role || online !== undefined ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {role ? (
                  <Badge tone="primary" color={roleColor}>
                    {role}
                  </Badge>
                ) : null}
                {online !== undefined ? (
                  <StatusBadge status={online ? 'online' : 'offline'} />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        {description ? <p className="mt-3 text-sm text-muted-foreground">{description}</p> : null}
      </HoverCardContent>
    </HoverCard>
  );
}
