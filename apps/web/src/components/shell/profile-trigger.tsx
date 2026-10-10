'use client';

import { ChevronDown } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/cn';

export interface ProfileTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  username: string;
  /// Готовый URL аватара из `/auth/me` (ADR-0088); нет — инициалы.
  avatar?: string | null;
}

/// Кнопка «свой профиль» для раскрывающихся меню/preview: [avatar] [ник] [˅].
/// Используется как child у Radix Trigger (asChild) — тот добавляет
/// aria-expanded / aria-haspopup; chevron (aria-hidden) поворачивается на 180°
/// по aria-expanded (не по data-state — его перезаписывает обёртка Tooltip),
/// motion-токен duration-fast, без bounce. Только там, где по нажатию
/// действительно что-то раскрывается.
export const ProfileTrigger = forwardRef<HTMLButtonElement, ProfileTriggerProps>(
  ({ username, avatar, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      data-testid="profile-trigger"
      className={cn(
        'group/profile flex h-control min-w-0 items-center gap-2 rounded pl-1.5 pr-2',
        'transition-colors duration-fast hover:bg-muted aria-expanded:bg-muted',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        className,
      )}
      {...props}
    >
      <Avatar src={avatar} name={username} size="sm" shape="round" />
      <span className="hidden min-w-0 max-w-32 truncate text-sm font-medium md:inline">
        {username}
      </span>
      <ChevronDown
        aria-hidden
        className="size-4 shrink-0 text-muted-foreground transition-transform duration-fast ease-out group-aria-expanded/profile:rotate-180 motion-reduce:transition-none"
      />
    </button>
  ),
);
ProfileTrigger.displayName = 'ProfileTrigger';
