'use client';

import type { NotificationDto } from '@twomc/shared';
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
import { floatingClearance } from './floating-actions';
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
  // Не заходить на плавающие кнопки (см. floatingClearance) — замер при открытии.
  const [bottomClearance, setBottomClearance] = useState(8);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setBottomClearance(floatingClearance());
        setOpen(next);
      }}
    >
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
      <PopoverContent
        align="end"
        collisionPadding={{ top: 8, right: 8, left: 8, bottom: bottomClearance }}
        className="flex w-[22rem] max-w-[calc(100vw-1rem)] flex-col overflow-y-hidden p-0"
      >
        <NotificationsPanel
          count={count}
          items={recent.data?.items}
          state={recent.isPending ? 'loading' : recent.isError ? 'error' : 'ready'}
          onNavigate={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

/// Содержимое окна уведомлений — то же в popover колокольчика и в design-lab:
/// шапка с действиями, список (загрузка / ошибка / пусто / элементы), ссылка
/// «Все уведомления».
export function NotificationsPanel({
  count,
  items,
  state,
  onNavigate,
}: {
  count: number;
  items: NotificationDto[] | undefined;
  state: 'loading' | 'error' | 'ready';
  onNavigate?: () => void;
}) {
  return (
    <div data-testid="notifications-panel" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
        <p className="text-sm font-semibold">Уведомления</p>
        <NotificationBulkActions unreadCount={count} hasItems={(items?.length ?? 0) > 0} />
      </div>
      {/* Прокручивается только список: шапка и «Все уведомления» всегда видны. */}
      <div className="max-h-96 min-h-0 flex-1 overflow-y-auto border-y border-border-subtle scrollbar-thin">
        {state === 'loading' ? (
          <div className="p-3">
            <SkeletonRows rows={3} />
          </div>
        ) : state === 'error' ? (
          <p className="p-4 text-sm text-muted-foreground">Не удалось загрузить уведомления.</p>
        ) : !items || items.length === 0 ? (
          <EmptyState
            size="sm"
            icon={<Bell />}
            title="Пока тихо"
            description="Новые уведомления появятся здесь."
          />
        ) : (
          <ul>
            {items.map((item) => (
              <NotificationItem key={item.id} item={item} compact onNavigate={onNavigate} />
            ))}
          </ul>
        )}
      </div>
      <div className="shrink-0 p-2">
        <Button asChild variant="ghost" size="sm" className="w-full">
          <Link href="/notifications" onClick={onNavigate}>
            Все уведомления
          </Link>
        </Button>
      </div>
    </div>
  );
}
