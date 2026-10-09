'use client';

import { CheckCheck, MoreHorizontal, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button, IconButton } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNotificationActions } from '@/lib/notifications/hooks';

type Pending = 'read' | 'all' | null;

/// «Прочитать все» + меню «Удалить прочитанные» / «Очистить все» (с
/// подтверждением) — одинаково в превью и на странице уведомлений.
export function NotificationBulkActions({
  unreadCount,
  hasItems,
}: {
  unreadCount: number;
  hasItems: boolean;
}) {
  const actions = useNotificationActions();
  const [confirm, setConfirm] = useState<Pending>(null);
  return (
    <div className="flex items-center gap-1">
      {unreadCount > 0 ? (
        <Button size="sm" variant="ghost" onClick={() => actions.markAllRead.mutate()}>
          <CheckCheck />
          Прочитать все
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton size="sm" aria-label="Другие действия с уведомлениями" disabled={!hasItems}>
            <MoreHorizontal />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setConfirm('read')}>
            <Trash2 />
            Удалить прочитанные
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm('all')}>
            <XCircle />
            Очистить все
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm === 'all' ? 'Очистить все уведомления?' : 'Удалить прочитанные?'}
        description={
          confirm === 'all'
            ? 'Все уведомления, включая непрочитанные, будут удалены без возможности восстановления.'
            : 'Прочитанные уведомления будут удалены. Непрочитанные останутся.'
        }
        confirmLabel={confirm === 'all' ? 'Очистить' : 'Удалить'}
        destructive
        onConfirm={() =>
          (confirm === 'all' ? actions.clearAll : actions.removeRead).mutateAsync().then(() => {
            setConfirm(null);
          })
        }
      />
    </div>
  );
}
