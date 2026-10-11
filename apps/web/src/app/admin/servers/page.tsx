'use client';

import { Plus, Server as ServerIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckboxField } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Field } from '@/components/ui/field';
import { Input, Textarea, inputClassName } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import {
  useAdminServerActions,
  useAdminServers,
  useServerCategories,
  useServerLogs,
  type AdminServer,
  type ServerInput,
} from '@/lib/admin/servers';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDateTime } from '@/lib/format';

/// Серверы в админке (срез 7.5, ADR-0131): список, создание и правка,
/// удаление с подтверждением, журнал последних статусов. Каждое действие —
/// по своему праву `servers.*`.

const SLUG = /^[a-z0-9-]+$/;
const digits = (value: string) => value.replace(/\D/g, '');

function emptyForm(server?: AdminServer) {
  return {
    name: server?.name ?? '',
    slug: server?.slug ?? '',
    address: server?.address ?? '',
    port: String(server?.port ?? 25565),
    type: server?.type ?? 'survival',
    description: server?.description ?? '',
    maxPlayers: String(server?.maxPlayers ?? 100),
    order: String(server?.order ?? 0),
    isActive: server?.isActive ?? true,
    categoryId: server?.categoryId ?? '',
  };
}

function ServerDialog({
  server,
  open,
  onOpenChange,
}: {
  server: AdminServer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { can } = usePermissions();
  const categories = useServerCategories(open && can('server_categories.view'));
  const { create, update } = useAdminServerActions();
  const [form, setForm] = useState(() => emptyForm(server ?? undefined));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Введите название';
    if (!SLUG.test(form.slug)) next.slug = 'Только строчные латинские буквы, цифры и дефис';
    if (!form.address.trim()) next.address = 'Введите адрес';
    const port = Number(form.port);
    if (!port || port > 65535) next.port = 'Порт от 1 до 65535';
    if (!form.type.trim()) next.type = 'Укажите тип';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const body: ServerInput = {
      name: form.name.trim(),
      slug: form.slug,
      address: form.address.trim(),
      port,
      type: form.type.trim(),
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
      maxPlayers: Number(form.maxPlayers) || 1,
      order: Number(form.order) || 0,
      isActive: form.isActive,
      ...(form.categoryId ? { categoryId: form.categoryId } : {}),
    };
    const done = {
      onSuccess: () => {
        toast.success(server ? 'Сервер сохранён' : 'Сервер добавлен');
        onOpenChange(false);
      },
      onError: (error: unknown) => toast.error(getErrorMessage(error)),
    };
    if (server) update.mutate({ id: server.id, body }, done);
    else create.mutate(body, done);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{server ? 'Изменить сервер' : 'Новый сервер'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-3 sm:grid-cols-2">
            <Field label="Название" required error={errors.name}>
              <Input
                value={form.name}
                maxLength={100}
                onChange={(e) => set({ name: e.target.value })}
              />
            </Field>
            <Field label="Slug" required error={errors.slug} hint="Адрес страницы: /servers/slug">
              <Input
                value={form.slug}
                maxLength={160}
                spellCheck={false}
                onChange={(e) => set({ slug: e.target.value.toLowerCase() })}
              />
            </Field>
            <Field label="Адрес" required error={errors.address}>
              <Input
                value={form.address}
                maxLength={255}
                spellCheck={false}
                onChange={(e) => set({ address: e.target.value })}
              />
            </Field>
            <Field label="Порт" required error={errors.port}>
              <Input
                inputMode="numeric"
                value={form.port}
                onChange={(e) => set({ port: digits(e.target.value) })}
              />
            </Field>
            <Field label="Тип" required error={errors.type} hint="survival, anarchy…">
              <Input
                value={form.type}
                maxLength={50}
                onChange={(e) => set({ type: e.target.value })}
              />
            </Field>
            <Field label="Слотов">
              <Input
                inputMode="numeric"
                value={form.maxPlayers}
                onChange={(e) => set({ maxPlayers: digits(e.target.value) })}
              />
            </Field>
            {categories.data ? (
              <Field label="Категория">
                <select
                  className={inputClassName}
                  value={form.categoryId}
                  onChange={(e) => set({ categoryId: e.target.value })}
                >
                  <option value="">Без категории</option>
                  {categories.data.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field label="Порядок">
              <Input
                inputMode="numeric"
                value={form.order}
                onChange={(e) => set({ order: digits(e.target.value) })}
              />
            </Field>
            <Field label="Описание" className="sm:col-span-2">
              <Textarea
                value={form.description}
                maxLength={1000}
                rows={3}
                onChange={(e) => set({ description: e.target.value })}
              />
            </Field>
            <CheckboxField
              label="Показывать на сайте"
              checked={form.isActive}
              onCheckedChange={(checked) => set({ isActive: checked === true })}
            />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
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

function Logs({ serverId }: { serverId: string }) {
  const logs = useServerLogs(serverId);
  if (logs.isPending) return <SkeletonRows rows={3} />;
  if (logs.isError) return <ErrorState error={logs.error} onRetry={() => logs.refetch()} />;
  if (logs.data.items.length === 0) {
    return <p className="text-xs text-muted-foreground">Записей статуса пока нет.</p>;
  }
  return (
    <ul className="flex flex-col gap-1 text-xs" data-testid="server-logs">
      {logs.data.items.map((log) => (
        <li key={log.id} className="flex flex-wrap gap-x-3 text-muted-foreground">
          <span>{formatDateTime(log.timestamp)}</span>
          <span className={log.online ? 'text-success' : 'text-destructive'}>
            {log.online ? `онлайн ${log.playerCount}/${log.maxPlayers}` : 'офлайн'}
          </span>
          {log.ping !== null ? <span>{log.ping} мс</span> : null}
        </li>
      ))}
    </ul>
  );
}

function ServersList() {
  const { can } = usePermissions();
  const servers = useAdminServers();
  const { remove } = useAdminServerActions();
  const [editing, setEditing] = useState<AdminServer | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<AdminServer | null>(null);
  const [logsFor, setLogsFor] = useState<string | null>(null);

  return (
    <>
      {can('servers.create') ? (
        <Button className="self-start" onClick={() => setEditing(null)}>
          <Plus />
          Добавить сервер
        </Button>
      ) : null}
      {servers.isPending ? (
        <SkeletonRows rows={4} />
      ) : servers.isError ? (
        <ErrorState error={servers.error} onRetry={() => servers.refetch()} />
      ) : servers.data.length === 0 ? (
        <EmptyState icon={<ServerIcon />} title="Серверов пока нет" />
      ) : (
        <ul
          className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
          data-testid="admin-servers"
        >
          {servers.data.map((server) => (
            <li key={server.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-medium">{server.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {server.address}:{server.port}
                </span>
                <Badge tone="neutral">{server.type}</Badge>
                {server.category ? <Badge tone="neutral">{server.category.name}</Badge> : null}
                {server.isActive ? null : <Badge tone="warning">Скрыт</Badge>}
                <span className="flex flex-1 justify-end gap-1">
                  {can('servers.logs') ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setLogsFor(logsFor === server.id ? null : server.id)}
                    >
                      Журнал
                    </Button>
                  ) : null}
                  {can('servers.edit') ? (
                    <Button size="sm" variant="secondary" onClick={() => setEditing(server)}>
                      Изменить
                    </Button>
                  ) : null}
                  {can('servers.delete') ? (
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(server)}>
                      Удалить
                    </Button>
                  ) : null}
                </span>
              </div>
              {logsFor === server.id ? <Logs serverId={server.id} /> : null}
            </li>
          ))}
        </ul>
      )}
      {editing !== undefined ? (
        <ServerDialog
          key={editing?.id ?? 'new'}
          server={editing}
          open
          onOpenChange={(open) => !open && setEditing(undefined)}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Удалить сервер «${deleting?.name ?? ''}»?`}
        description="Сервер и история его статусов будут удалены. Действие необратимо."
        confirmLabel="Удалить"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(deleting!.id, {
            onSuccess: () => {
              toast.success('Сервер удалён');
              setDeleting(null);
            },
            onError: (error) => toast.error(getErrorMessage(error)),
          })
        }
      />
    </>
  );
}

export default function AdminServersPage() {
  return (
    <PermissionGate requirement="servers.view">
      <div className="flex flex-col gap-4">
        <PageHeader title="Серверы" description="Игровые серверы на сайте и их статус." />
        <ServersList />
      </div>
    </PermissionGate>
  );
}
