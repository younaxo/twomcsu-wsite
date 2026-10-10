'use client';

import type { NotificationDto } from '@twomc/shared';
import { Check, CircleDot, ExternalLink, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { IconButton } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { useNotificationActions } from '@/lib/notifications/hooks';
import { notificationHref } from '@/lib/notifications/in-app';
import { SystemSender, isSystemMessage } from './system-sender';

/// Пункт уведомления (ADR-0074): переход по ссылке отмечает прочитанным;
/// действия — видимые кнопки (при наведении/фокусе, на touch всегда) и то же
/// самое в контекстном меню (ПКМ — не единственный путь).
export function NotificationItem({
  item,
  onNavigate,
  compact = false,
}: {
  item: NotificationDto;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const actions = useNotificationActions();
  const href = notificationHref(item);
  const system = isSystemMessage(item);
  const toggleRead = () =>
    item.isRead ? actions.markUnread.mutate(item.id) : actions.markRead.mutate(item.id);
  const open = () => {
    if (!item.isRead) actions.markRead.mutate(item.id);
    onNavigate?.();
  };

  const body = (
    <>
      <span
        aria-hidden
        className={cn(
          'mt-1.5 size-2 shrink-0 rounded-full',
          item.isRead ? 'bg-transparent' : 'bg-primary',
        )}
      />
      <span className="min-w-0 flex-1">
        {system ? <SystemSender className="mb-0.5" /> : null}
        <span
          className={cn('block truncate text-sm', item.isRead ? 'font-normal' : 'font-semibold')}
        >
          {item.title}
        </span>
        {item.message ? (
          <span
            className={cn(
              'text-xs text-muted-foreground',
              compact ? 'line-clamp-2' : 'line-clamp-3',
            )}
          >
            {item.message}
          </span>
        ) : null}
        <span className="block text-[11px] text-subtle-foreground">
          {formatRelative(item.createdAt)}
          {item.isRead ? null : <span className="sr-only"> · не прочитано</span>}
        </span>
      </span>
    </>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <li
          className={cn(
            // Фон строки (непрочитанное и наведение) — на всей строке, включая
            // колонку кнопок; скругление последней строки задаёт контейнер.
            'group relative flex items-start gap-1 border-b border-border-subtle transition-colors duration-fast last:border-b-0',
            item.isRead ? 'hover:bg-muted/60' : 'bg-primary-soft/30 hover:bg-primary-soft/50',
          )}
          data-testid="notification-item"
          data-read={item.isRead}
          data-system={system || undefined}
        >
          {href ? (
            <Link
              href={href}
              onClick={open}
              className="flex min-w-0 flex-1 gap-3 rounded-[inherit] px-3 py-2.5"
            >
              {body}
            </Link>
          ) : (
            <div className="flex min-w-0 flex-1 gap-3 px-3 py-2.5">{body}</div>
          )}
          <div
            className={cn(
              'flex shrink-0 gap-0.5 py-1.5 pr-1.5 transition-opacity duration-fast',
              'opacity-0 focus-within:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100',
            )}
          >
            <IconButton
              size="sm"
              aria-label={item.isRead ? 'Отметить непрочитанным' : 'Отметить прочитанным'}
              onClick={toggleRead}
            >
              {item.isRead ? <CircleDot /> : <Check />}
            </IconButton>
            <IconButton
              size="sm"
              aria-label="Удалить уведомление"
              onClick={() => actions.remove.mutate(item.id)}
            >
              <Trash2 />
            </IconButton>
          </div>
        </li>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {href ? (
          <ContextMenuItem asChild>
            <Link href={href} onClick={open}>
              <ExternalLink />
              Открыть
            </Link>
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem onSelect={toggleRead}>
          {item.isRead ? <CircleDot /> : <Check />}
          {item.isRead ? 'Отметить непрочитанным' : 'Отметить прочитанным'}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={() => actions.remove.mutate(item.id)}>
          <Trash2 />
          Удалить
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
