'use client';

import {
  Bell,
  ChevronDown,
  Gavel,
  Info,
  LogOut,
  Settings,
  ShoppingBag,
  UserPlus,
  UserRound,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Avatar, AvatarStack } from '@/components/ui/avatar';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RolePrefix } from '@/components/ui/role-prefix';
import { toast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { formatDateTime, formatNumber } from '@/lib/format';
import { getRolePrefixAsset, type DisplayableRole } from '@/lib/roles/primary-role';
import {
  demoNotifications,
  demoUsers,
  type DemoEvent,
  type DemoNotification,
  type DemoUser,
} from '../../demo-data';

/* ------------------------------------------------------------------ */
/* Роли                                                                */
/* ------------------------------------------------------------------ */

/// Демо-роли → slug графического префикса TwoMC. У игроков и VIP префикса
/// нет: `RolePrefix` сам покажет текстовый бейдж с цветом роли.
const ROLE_META: Record<string, { slug: string; priority: number }> = {
  Owner: { slug: 'owner', priority: 1000 },
  'Chief Curator': { slug: 'chief-curator', priority: 900 },
  'Senior Curator': { slug: 'senior-curator', priority: 800 },
  'Старший модератор': { slug: 'senior-moderator', priority: 500 },
  Хелпер: { slug: 'helper', priority: 300 },
  VIP: { slug: 'vip', priority: 50 },
};

export function roleOf(user: DemoUser): DisplayableRole {
  const meta = ROLE_META[user.role] ?? { slug: 'player', priority: 0 };
  return { ...meta, displayName: user.role, color: user.roleColor };
}

/// Сотрудник проекта — тот, у чьей роли есть PNG-префикс.
export function isStaff(user: DemoUser): boolean {
  return getRolePrefixAsset(roleOf(user).slug) !== null;
}

export interface UserNameProps {
  user: DemoUser;
  size?: 'xs' | 'sm';
  /// `none` — у игроков без префикса ничего не показывать (таблицы, где роль
  /// есть отдельной колонкой); `badge` — текстовый бейдж роли.
  fallback?: 'badge' | 'none';
  className?: string;
}

/// Ник с префиксом роли, как в игровом чате: префикс слева от ника.
export function UserName({ user, size = 'xs', fallback = 'badge', className }: UserNameProps) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <RolePrefix role={roleOf(user)} size={size} fallback={fallback} />
      <span className="truncate font-medium">{user.username}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Форматирование                                                      */
/* ------------------------------------------------------------------ */

const PLURAL_RULES = new Intl.PluralRules('ru-RU');

/// Склонение существительного после числа: plural(42, {one:'комментарий', …}).
export function plural(count: number, forms: { one: string; few: string; many: string }): string {
  const category = PLURAL_RULES.select(count);
  if (category === 'one') {
    return forms.one;
  }
  if (category === 'few') {
    return forms.few;
  }
  return forms.many;
}

const DAY = new Intl.DateTimeFormat('ru-RU', { day: 'numeric' });
const MONTH = new Intl.DateTimeFormat('ru-RU', { month: 'short' });
const WEEKDAY_TIME = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/// Части даты для афиши: число крупно, месяц под ним, день недели и время строкой.
export function eventDateParts(iso: string): { day: string; month: string; when: string } {
  const date = new Date(iso);
  return { day: DAY.format(date), month: MONTH.format(date), when: WEEKDAY_TIME.format(date) };
}

/// Имитация запроса для overlay-демо (ConfirmDialog ждёт промис).
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ */
/* Уведомления                                                         */
/* ------------------------------------------------------------------ */

const KIND_ICON: Record<DemoNotification['kind'], ReactNode> = {
  friend: <UserPlus aria-hidden />,
  order: <ShoppingBag aria-hidden />,
  moderation: <Gavel aria-hidden />,
  system: <Info aria-hidden />,
};

export function NotificationList({
  items,
  className,
}: {
  items: DemoNotification[];
  className?: string;
}) {
  return (
    <ul className={cn('flex flex-col', className)}>
      {items.map((item) => (
        <li
          key={item.id}
          className="flex gap-3 border-b border-border-subtle py-3 first:pt-0 last:border-b-0 last:pb-0"
        >
          <span
            aria-hidden
            className={cn(
              'mt-0.5 inline-flex shrink-0 [&_svg]:size-4',
              item.read ? 'text-subtle-foreground' : 'text-primary-soft-foreground',
            )}
          >
            {KIND_ICON[item.kind]}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                'text-sm leading-snug',
                item.read ? 'font-medium text-muted-foreground' : 'font-semibold text-foreground',
              )}
            >
              {item.read ? null : <span className="sr-only">Непрочитано: </span>}
              {item.title}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">{item.message}</p>
            <p className="mt-1 text-xs tabular text-subtle-foreground">{formatDateTime(item.at)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/// Колокольчик со счётчиком непрочитанных; по нажатию — список в Popover.
export function NotificationBell({ align = 'end' }: { align?: 'end' | 'center' | 'start' }) {
  const unread = demoNotifications.filter((item) => !item.read).length;
  return (
    <Popover>
      <Tooltip content="Уведомления">
        <PopoverTrigger asChild>
          <IconButton
            aria-label={unread > 0 ? `Уведомления, непрочитанных: ${unread}` : 'Уведомления'}
            className="relative"
          >
            <Bell />
            {unread > 0 ? (
              <span
                aria-hidden
                className="absolute right-1.5 top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold leading-none tabular text-primary-foreground"
              >
                {unread}
              </span>
            ) : null}
          </IconButton>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align={align} className="w-80 p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border-subtle py-1.5 pl-4 pr-2">
          <p className="font-semibold">Уведомления</p>
          <Button variant="ghost" onClick={() => toast.success('Все уведомления прочитаны')}>
            Прочитать все
          </Button>
        </div>
        <NotificationList items={demoNotifications} className="px-4 py-3" />
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* Аккаунт                                                             */
/* ------------------------------------------------------------------ */

/// Меню аккаунта в шапке: аватар (+ ник на широких экранах) → DropdownMenu.
export function AccountMenu({ user }: { user: DemoUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Аккаунт: ${user.username}`}
          className={cn(
            'inline-flex h-control items-center gap-2 rounded pl-1 pr-1.5 text-sm font-medium',
            'transition-colors duration-fast hover:bg-muted data-[state=open]:bg-muted',
          )}
        >
          <Avatar name={user.username} src={user.avatar} size="sm" shape="round" />
          <span className="hidden lg:inline">{user.username}</span>
          <ChevronDown aria-hidden className="hidden size-4 text-subtle-foreground lg:inline" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-foreground">
          {user.username}
          <span className="block font-mono text-xs font-normal text-subtle-foreground">
            {user.tag}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => toast.message(`Профиль ${user.username}`)}>
          <UserRound />
          Профиль
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => toast.message('Настройки аккаунта')}>
          <Settings />
          Настройки
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => toast.message('Вы вышли из аккаунта')}>
          <LogOut />
          Выйти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/* Событие                                                             */
/* ------------------------------------------------------------------ */

export interface EventCardProps {
  event: DemoEvent;
  /// Подпись над названием («Ближайшее событие»); без неё — просто афиша.
  label?: string;
  /// Уровень заголовка по месту в документе.
  titleAs?: 'h5' | 'h6';
  className?: string;
}

/// Афиша события: дата как лист календаря, участники стопкой, «Участвовать».
export function EventCard({ event, label, titleAs: Title = 'h6', className }: EventCardProps) {
  const { day, month, when } = eventDateParts(event.startsAt);
  const going = demoUsers
    .filter((user) => user.online)
    .slice(0, 3)
    .map((user) => ({ id: user.id, name: user.username, src: user.avatar }));

  return (
    <Card className={cn('flex flex-col gap-5', className)}>
      <div className="flex items-start gap-4">
        <time
          dateTime={event.startsAt}
          className="flex w-14 shrink-0 flex-col items-center rounded bg-primary-soft py-2 text-primary-soft-foreground"
        >
          <span className="font-display text-2xl font-bold leading-none tabular">{day}</span>
          <span className="mt-1 text-xs font-medium">{month}</span>
        </time>
        <div className="min-w-0 flex-1">
          {label ? <p className="text-sm text-muted-foreground">{label}</p> : null}
          <Title className="font-display text-xl font-bold leading-tight tracking-tight">
            {event.title}
          </Title>
          <p className="mt-1 text-sm text-muted-foreground">
            {event.server}, {when}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <AvatarStack users={going} size="xs" max={3} />
        <p className="text-sm text-muted-foreground">
          <span className="font-medium tabular text-foreground">
            {formatNumber(event.participants)}
          </span>{' '}
          {plural(event.participants, { one: 'участник', few: 'участника', many: 'участников' })}
        </p>
      </div>
      <Button
        className="w-full"
        onClick={() =>
          toast.success('Вы записаны', {
            description: `${event.title}, ${formatDateTime(event.startsAt)}`,
          })
        }
      >
        Участвовать
      </Button>
    </Card>
  );
}
