'use client';

import type { AdminAnnouncementDto } from '@twomc/shared';
import { Megaphone, Pencil, Plus, Send, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { useAdminAnnouncements, useAnnouncementAction } from '@/lib/admin/announcements';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import {
  ANNOUNCEMENT_KIND_META,
  ANNOUNCEMENT_PLACEMENT_LABELS,
  ANNOUNCEMENT_STATUS_META,
} from '@/lib/site/announcements';
import { AnnouncementEditor } from './announcement-editor';

const dateTime = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' });

function period(item: AdminAnnouncementDto): string {
  const from = item.showFrom ? dateTime.format(new Date(item.showFrom)) : null;
  const until = item.showUntil ? dateTime.format(new Date(item.showUntil)) : null;
  if (!from && !until) return 'Бессрочно';
  if (from && until) return `${from} — ${until}`;
  return from ? `с ${from}` : `до ${until}`;
}

function audience(item: AdminAnnouncementDto): string {
  if (item.audience === 'users') return 'Вошедшим';
  if (item.audience === 'role') return `Роль «${item.targetRole ?? '—'}»`;
  return 'Всем';
}

type Pending = { item: AdminAnnouncementDto; action: 'publish' | 'unpublish' | 'delete' };

/// Список объявлений: статус по времени сервера, период в поясе админа,
/// публикация/снятие/удаление — через подтверждение.
export function AnnouncementsPanel() {
  const { can } = usePermissions();
  const manage = can('announcements.manage');
  const query = useAdminAnnouncements();
  const action = useAnnouncementAction();
  const [editing, setEditing] = useState<AdminAnnouncementDto | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);

  const openEditor = (item: AdminAnnouncementDto | null) => {
    setEditing(item);
    setEditorOpen(true);
  };

  // `?new=1` — быстрое действие «Создать объявление» с дашборда.
  useEffect(() => {
    if (manage && new URLSearchParams(window.location.search).get('new') === '1') {
      setEditing(null);
      setEditorOpen(true);
    }
  }, [manage]);

  const confirm = async () => {
    if (!pending) return;
    try {
      await action.mutateAsync({ id: pending.item.id, action: pending.action });
      toast.success(
        pending.action === 'publish'
          ? 'Объявление опубликовано'
          : pending.action === 'unpublish'
            ? 'Объявление снято'
            : 'Объявление удалено',
      );
      setPending(null);
    } catch (error) {
      setPending(null);
      toast.error(getErrorMessage(error));
    }
  };

  const confirmText = (() => {
    if (!pending) return { title: '', description: '' };
    const { item } = pending;
    if (pending.action === 'publish') {
      const places = item.placements.map((p) => ANNOUNCEMENT_PLACEMENT_LABELS[p].toLowerCase());
      return {
        title: `Опубликовать «${item.title}»?`,
        description: `Будет показано: ${places.join(', ') || '—'}. Аудитория: ${audience(item).toLowerCase()}. ${
          item.placements.includes('notifications') && !item.notifiedAt
            ? 'Уведомления уйдут один раз — когда начнётся показ.'
            : ''
        }`,
      };
    }
    if (pending.action === 'unpublish') {
      return {
        title: `Снять «${item.title}» с публикации?`,
        description: 'Объявление пропадёт с сайта. Уже отправленные уведомления останутся.',
      };
    }
    return {
      title: `Удалить «${item.title}»?`,
      description: 'Объявление будет удалено без возможности восстановления.',
    };
  })();

  return (
    <section className="flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Объявления сайта</h3>
        {manage ? (
          <Button onClick={() => openEditor(null)}>
            <Plus />
            Новое объявление
          </Button>
        ) : null}
      </div>
      <QueryBoundary query={query} skeleton={<SkeletonRows rows={4} />}>
        {(data) =>
          data.items.length === 0 ? (
            <EmptyState
              icon={<Megaphone />}
              title="Объявлений пока нет"
              description="Создайте объявление: обновление, событие, технические работы."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Объявление</TableHead>
                  <TableHead className="hidden sm:table-cell">Статус</TableHead>
                  <TableHead className="hidden lg:table-cell">Показ</TableHead>
                  <TableHead className="hidden lg:table-cell">Где и кому</TableHead>
                  {manage ? <TableHead className="text-right">Действия</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => {
                  const kind = ANNOUNCEMENT_KIND_META[item.kind];
                  const status = ANNOUNCEMENT_STATUS_META[item.status];
                  const live = item.status === 'active' || item.status === 'scheduled';
                  return (
                    <TableRow
                      key={item.id}
                      data-testid="announcement-row"
                      data-status={item.status}
                    >
                      <TableCell className="max-w-[22rem]">
                        <p className="truncate font-medium">{item.title}</p>
                        <span className="flex flex-wrap gap-1">
                          <Badge tone={kind.tone}>{kind.label}</Badge>
                          {/* На узком экране статус и период — под заголовком. */}
                          <Badge tone={status.tone} className="sm:hidden">
                            {status.label}
                          </Badge>
                        </span>
                        <p className="mt-1 text-xs text-muted-foreground lg:hidden">
                          {period(item)} · {audience(item)}
                        </p>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell">
                        {period(item)}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                        <p>
                          {item.placements.length
                            ? item.placements
                                .map((p) => ANNOUNCEMENT_PLACEMENT_LABELS[p])
                                .join(', ')
                            : 'Места не выбраны'}
                        </p>
                        <p>{audience(item)}</p>
                      </TableCell>
                      {manage ? (
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <IconButton
                              size="sm"
                              aria-label={`Изменить «${item.title}»`}
                              onClick={() => openEditor(item)}
                            >
                              <Pencil />
                            </IconButton>
                            {live ? (
                              <IconButton
                                size="sm"
                                aria-label={`Снять «${item.title}»`}
                                onClick={() => setPending({ item, action: 'unpublish' })}
                              >
                                <Undo2 />
                              </IconButton>
                            ) : (
                              <IconButton
                                size="sm"
                                aria-label={`Опубликовать «${item.title}»`}
                                disabled={item.placements.length === 0 || item.status === 'expired'}
                                onClick={() => setPending({ item, action: 'publish' })}
                              >
                                <Send />
                              </IconButton>
                            )}
                            {!live ? (
                              <IconButton
                                size="sm"
                                aria-label={`Удалить «${item.title}»`}
                                onClick={() => setPending({ item, action: 'delete' })}
                              >
                                <Trash2 />
                              </IconButton>
                            ) : null}
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )
        }
      </QueryBoundary>

      <AnnouncementEditor open={editorOpen} onOpenChange={setEditorOpen} item={editing} />
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={confirmText.title}
        description={confirmText.description}
        confirmLabel={
          pending?.action === 'publish'
            ? 'Опубликовать'
            : pending?.action === 'unpublish'
              ? 'Снять'
              : 'Удалить'
        }
        destructive={pending?.action === 'delete'}
        loading={action.isPending}
        onConfirm={confirm}
      />
    </section>
  );
}
