'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { NotificationBulkActions } from '@/components/notifications/notification-bulk-actions';
import { NotificationItem } from '@/components/notifications/notification-item';
import { Button, IconButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { formatBadgeCount } from '@/lib/site/document-badge';
import { useRecentNotifications, useUnreadCount } from '@/lib/site/hooks';

/// Колокольчик с непрочитанными и превью последних уведомлений (ADR-0074).
/// Число — из единого источника (`useUnreadCount`), формат — `formatBadgeCount`
/// (1–99, «99+», 0 — без бейджа), как в title и favicon.
export function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount();
  const recent = useRecentNotifications(open);
  const count = unread.data?.count ?? 0;
  const label = count > 0 ? `Уведомления, ${count} новых` : 'Уведомления';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content={count > 0 ? `Уведомления: ${count} новых` : 'Уведомления'}>
        <PopoverTrigger asChild>
          <IconButton aria-label={label} className="relative">
            <Bell />
            {count > 0 ? (
              <span
                data-testid="unread-badge"
                className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular"
              >
                {formatBadgeCount(count)}
              </span>
            ) : null}
          </IconButton>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="end" className="w-[22rem] max-w-[calc(100vw-1rem)] p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <p className="text-sm font-semibold">Уведомления</p>
          <NotificationBulkActions
            unreadCount={count}
            hasItems={(recent.data?.items.length ?? 0) > 0}
          />
        </div>
        <div className="max-h-96 overflow-y-auto border-y border-border-subtle scrollbar-thin">
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
                <NotificationItem
                  key={item.id}
                  item={item}
                  compact
                  onNavigate={() => setOpen(false)}
                />
              ))}
            </ul>
          )}
        </div>
        <div className="p-2">
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
