'use client';

import { Bell } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { RequireSession } from '@/components/auth/require-session';
import { NotificationBulkActions } from '@/components/notifications/notification-bulk-actions';
import { NotificationItem } from '@/components/notifications/notification-item';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SkeletonRows } from '@/components/ui/skeleton';
import { formatBadgeCount } from '@/lib/site/document-badge';
import { useNotificationList, type NotificationFilter } from '@/lib/notifications/hooks';
import { useUnreadCount } from '@/lib/site/hooks';
import { ModuleGate } from '@/components/system/site-availability';

function NotificationsList() {
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const list = useNotificationList(filter);
  const unread = useUnreadCount();
  const count = unread.data?.count ?? 0;
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section className="flex flex-col gap-3 rounded-xl bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
        <SegmentedControl
          value={filter}
          onValueChange={(value) => setFilter(value as NotificationFilter)}
          options={[
            { value: 'all', label: 'Все' },
            {
              value: 'unread',
              label: count > 0 ? `Непрочитанные · ${formatBadgeCount(count)}` : 'Непрочитанные',
            },
            { value: 'system', label: 'От twomc.su' },
          ]}
        />
        <NotificationBulkActions unreadCount={count} hasItems={items.length > 0} />
      </div>
      {list.isPending ? (
        <div className="p-4">
          <SkeletonRows rows={5} />
        </div>
      ) : list.isError ? (
        <p className="p-4 text-sm text-muted-foreground" role="alert">
          Не удалось загрузить уведомления. Обновите страницу.
        </p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell />}
          title={
            filter === 'unread'
              ? 'Всё прочитано'
              : filter === 'system'
                ? 'Сообщений от twomc.su нет'
                : 'Уведомлений нет'
          }
          description={
            filter === 'unread'
              ? 'Новых уведомлений нет.'
              : filter === 'system'
                ? 'Здесь появятся системные сообщения администрации сайта.'
                : 'Здесь появятся заявки в друзья, ответы, заказы и новости twomc.su.'
          }
        />
      ) : (
        <ul className="border-t border-border-subtle" data-testid="notifications-list">
          {items.map((item) => (
            <NotificationItem key={item.id} item={item} />
          ))}
        </ul>
      )}
      {list.hasNextPage ? (
        <div className="px-4 pb-4">
          <Button
            variant="secondary"
            className="w-full"
            loading={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            Показать ещё
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/// /notifications — все уведомления (ADR-0074): фильтр, действия, ПКМ.
function NotificationsPageContent() {
  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-6 px-4 py-8 md:px-6">
      <PageHeader title="Уведомления" description="Всё, что произошло в вашем аккаунте twomc.su." />
      <RequireSession>
        <NotificationsList />
      </RequireSession>
    </div>
  );
}

/// Страница модуля «notifications» (ADR-0082): выключен или на техработах — понятное состояние.
export default function NotificationsPage() {
  return (
    <ModuleGate module="notifications">
      <NotificationsPageContent />
    </ModuleGate>
  );
}
