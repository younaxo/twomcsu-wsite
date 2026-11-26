'use client';

import { Plus, RefreshCw, Video } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckboxField } from '@/components/ui/checkbox';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import {
  STREAM_PLATFORM_LABEL,
  describeRefreshResult,
  useAdminStreams,
  useStreamActions,
  type StreamChannelRow,
  type StreamPlatform,
} from '@/lib/admin/streams';
import { getSafeErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';

/// Стрим-каналы в админке: таблица (на мобильном — карточки), создание,
/// правка, удаление с подтверждением и ручное обновление статусов. Каждое
/// действие — по своему праву `streams.*`. Статус «в эфире» ставит только
/// опрос платформ, вручную его не поменять.

const PLATFORMS: StreamPlatform[] = ['TWITCH', 'YOUTUBE'];

function initialForm(channel: StreamChannelRow | null) {
  return {
    platform: (channel?.platform ?? 'TWITCH') as StreamPlatform,
    channelKey: channel?.channelKey ?? '',
    channelUrl: channel?.channelUrl ?? '',
    displayName: channel?.displayName ?? '',
    avatarUrl: channel?.avatarUrl ?? '',
    userId: channel?.userId ?? '',
    isPartner: channel?.isPartner ?? false,
    isActive: channel?.isActive ?? true,
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function ChannelDialog({
  channel,
  onClose,
}: {
  channel: StreamChannelRow | null;
  onClose: () => void;
}) {
  const { create, update } = useStreamActions();
  const [form, setForm] = useState(() => initialForm(channel));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.displayName.trim()) next.displayName = 'Введите название';
    if (!channel) {
      if (!form.channelKey.trim()) next.channelKey = 'Введите ключ канала';
      if (!isHttpUrl(form.channelUrl.trim())) {
        next.channelUrl = 'Полная ссылка вида https://…';
      }
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const avatarUrl = form.avatarUrl.trim();
    const userId = form.userId.trim();
    const done = {
      onSuccess: () => {
        toast.success(channel ? 'Канал сохранён' : 'Канал добавлен');
        onClose();
      },
      onError: (error: unknown) => toast.error(getSafeErrorMessage(error)),
    };
    const common = {
      displayName: form.displayName.trim(),
      ...(avatarUrl ? { avatarUrl } : {}),
      ...(userId ? { userId } : {}),
      isPartner: form.isPartner,
    };
    if (channel) {
      update.mutate({ id: channel.id, body: { ...common, isActive: form.isActive } }, done);
    } else {
      create.mutate(
        {
          ...common,
          platform: form.platform,
          channelKey: form.channelKey.trim(),
          channelUrl: form.channelUrl.trim(),
        },
        done,
      );
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{channel ? 'Изменить канал' : 'Новый канал'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Платформа"
              hint={channel ? 'Платформа и ключ после создания не меняются' : undefined}
            >
              <Select
                value={form.platform}
                disabled={channel !== null}
                onValueChange={(value) => set({ platform: value as StreamPlatform })}
              >
                <SelectTrigger aria-label="Платформа">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((platform) => (
                    <SelectItem key={platform} value={platform}>
                      {STREAM_PLATFORM_LABEL[platform]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Ключ канала" required={!channel} error={errors.channelKey}>
              <Input
                value={form.channelKey}
                maxLength={100}
                spellCheck={false}
                disabled={channel !== null}
                onChange={(e) => set({ channelKey: e.target.value })}
              />
            </Field>
            <Field
              label="Ссылка на канал"
              required={!channel}
              error={errors.channelUrl}
              className="sm:col-span-2"
            >
              <Input
                value={form.channelUrl}
                spellCheck={false}
                inputMode="url"
                disabled={channel !== null}
                onChange={(e) => set({ channelUrl: e.target.value })}
              />
            </Field>
            <Field label="Название" required error={errors.displayName}>
              <Input
                value={form.displayName}
                maxLength={120}
                onChange={(e) => set({ displayName: e.target.value })}
              />
            </Field>
            <Field label="Ссылка на аватар">
              <Input
                value={form.avatarUrl}
                spellCheck={false}
                inputMode="url"
                onChange={(e) => set({ avatarUrl: e.target.value })}
              />
            </Field>
            <Field label="ID пользователя сайта" hint="Необязательно: привязка канала к профилю">
              <Input
                value={form.userId}
                spellCheck={false}
                onChange={(e) => set({ userId: e.target.value })}
              />
            </Field>
            <div className="flex flex-col justify-end gap-2">
              <CheckboxField
                label="Партнёр"
                checked={form.isPartner}
                onCheckedChange={(checked) => set({ isPartner: checked === true })}
              />
              {channel ? (
                <CheckboxField
                  label="Показывать на сайте"
                  checked={form.isActive}
                  onCheckedChange={(checked) => set({ isActive: checked === true })}
                />
              ) : null}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" loading={create.isPending || update.isPending}>
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StreamsTable() {
  const { can } = usePermissions();
  const list = useAdminStreams();
  const { remove, refresh } = useStreamActions();
  const [editing, setEditing] = useState<StreamChannelRow | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<StreamChannelRow | null>(null);

  const columns: DataGridColumn<StreamChannelRow>[] = [
    {
      key: 'name',
      header: 'Канал',
      cell: (r) => (
        <span className="flex flex-col">
          <span className="font-medium">{r.displayName}</span>
          <span className="font-mono text-xs text-muted-foreground">{r.channelKey}</span>
        </span>
      ),
    },
    { key: 'platform', header: 'Платформа', cell: (r) => STREAM_PLATFORM_LABEL[r.platform] },
    {
      key: 'state',
      header: 'Статус',
      cell: (r) => (
        <span className="flex flex-wrap gap-1">
          {r.isLive ? (
            <Badge tone="success">В эфире · {r.viewerCount}</Badge>
          ) : (
            <Badge tone="neutral">Не в эфире</Badge>
          )}
          {r.isPartner ? <Badge tone="info">Партнёр</Badge> : null}
          {r.isActive ? null : <Badge tone="warning">Скрыт</Badge>}
        </span>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Действия</span>,
      align: 'right',
      cell: (r) => (
        <span className="flex flex-wrap justify-end gap-1">
          {can('streams.edit') ? (
            <Button
              size="sm"
              variant="secondary"
              aria-label={`Изменить канал ${r.displayName}`}
              onClick={() => setEditing(r)}
            >
              Изменить
            </Button>
          ) : null}
          {can('streams.delete') ? (
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Удалить канал ${r.displayName}`}
              onClick={() => setDeleting(r)}
            >
              Удалить
            </Button>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {can('streams.create') || can('streams.refresh') ? (
        <div className="flex flex-wrap justify-end gap-2">
          {can('streams.refresh') ? (
            <Button
              variant="secondary"
              loading={refresh.isPending}
              onClick={() =>
                refresh.mutate(undefined, {
                  onSuccess: (result) =>
                    result.refreshed
                      ? toast.success(describeRefreshResult(result))
                      : toast.info(describeRefreshResult(result)),
                  onError: (error) => toast.error(getSafeErrorMessage(error)),
                })
              }
            >
              <RefreshCw />
              Обновить статусы
            </Button>
          ) : null}
          {can('streams.create') ? (
            <Button onClick={() => setEditing(null)}>
              <Plus />
              Добавить канал
            </Button>
          ) : null}
        </div>
      ) : null}
      <div data-testid="admin-streams">
        <DataGrid
          columns={columns}
          rows={list.data ?? []}
          getRowId={(r) => r.id}
          loading={list.isPending}
          error={list.isError ? list.error : undefined}
          onRetry={() => list.refetch()}
          empty={
            <EmptyState
              icon={<Video />}
              title="Каналов пока нет"
              description="Добавьте канал Twitch или YouTube, чтобы он появился на странице стримов."
            />
          }
          caption="Стрим-каналы: название, платформа, статус, действия"
        />
      </div>
      {editing !== undefined ? (
        <ChannelDialog
          key={editing?.id ?? 'new'}
          channel={editing}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Удалить канал «${deleting?.displayName ?? ''}»?`}
        description="Канал исчезнет со страницы стримов без возможности восстановления."
        confirmLabel="Удалить"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(deleting!.id, {
            onSuccess: () => {
              toast.success('Канал удалён');
              setDeleting(null);
            },
            onError: (error) => toast.error(getSafeErrorMessage(error)),
          })
        }
      />
    </div>
  );
}

export default function AdminStreamsPage() {
  return (
    <PermissionGate requirement="streams.view">
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Стримы"
          breadcrumbs={[{ label: 'Контент' }, { label: 'Стримы' }]}
          description="Каналы Twitch и YouTube для страницы стримов."
        />
        <StreamsTable />
      </div>
    </PermissionGate>
  );
}
