'use client';

import { Bell, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { useMarkNotificationRead, useRecentNotifications, useUnreadCount } from '@/lib/site/hooks';

/// Колокольчик с непрочитанными и quick-панель последних уведомлений.
/// Отдельная страница не нужна для быстрого просмотра — только ссылка
/// «Все уведомления» внизу (маршрут появится в PHASE 31).
export function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount();
  const recent = useRecentNotifications(open);
  const { one, all } = useMarkNotificationRead();
  const count = unread.data?.count ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content={count > 0 ? `Уведомления: ${count} новых` : 'Уведомления'}>
        <PopoverTrigger asChild>
          <IconButton
            aria-label={count > 0 ? `Уведомления, ${count} новых` : 'Уведомления'}
            className="relative"
          >
            <Bell />
            {count > 0 ? (
              <span
                data-testid="unread-badge"
                className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular"
              >
                {count > 99 ? '99+' : count}
              </span>
            ) : null}
          </IconButton>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
          <p className="text-sm font-semibold">Уведомления</p>
          {count > 0 ? (
            <Button size="sm" variant="ghost" loading={all.isPending} onClick={() => all.mutate()}>
              <CheckCheck />
              Прочитать все
            </Button>
          ) : null}
        </div>
        <div className="max-h-96 overflow-y-auto scrollbar-thin">
          {recent.isPending ? (
            <div className="p-3">
              <SkeletonRows rows={3} />
            </div>
          ) : recent.isError ? (
            <p className="p-4 text-sm text-muted-foreground">Не удалось загрузить уведомления.</p>
          ) : recent.data && recent.data.items.length === 0 ? (
            <EmptyState
              size="sm"
              icon={<Bell />}
              title="Пока тихо"
              description="Новые уведомления появятся здесь."
            />
          ) : (
            <ul>
              {recent.data?.items.map((item) => (
                <li key={item.id} className="border-b border-border-subtle last:border-b-0">
                  <Link
                    href={item.actionUrl ?? item.link ?? '#'}
                    onClick={() => {
                      if (!item.isRead) one.mutate(item.id);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex gap-3 px-3 py-2.5 hover:bg-muted',
                      !item.isRead && 'bg-primary-soft/40',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'mt-1.5 size-2 shrink-0 rounded-full',
                        item.isRead ? 'bg-transparent' : 'bg-primary',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.title}</span>
                      {item.message ? (
                        <span className="line-clamp-2 text-xs text-muted-foreground">
                          {item.message}
                        </span>
                      ) : null}
                      <span className="block text-[11px] text-subtle-foreground">
                        {formatRelative(item.createdAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-border-subtle p-2">
          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link href="/notifications" onClick={() => setOpen(false)}>
              Все уведомления
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
