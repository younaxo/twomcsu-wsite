'use client';

import { BellRing, Plus, Webhook } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { PageHeader, PageSection } from '@/components/admin/page-header';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import {
  BROADCAST_PRIORITY_LABEL,
  BROADCAST_TYPE_LABEL,
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LABEL,
  useBroadcast,
  useNotificationStats,
  useWebhookActions,
  useWebhooks,
  type BroadcastInput,
  type BroadcastPriority,
  type BroadcastType,
  type WebhookRow,
} from '@/lib/admin/notifications';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDate, formatNumber } from '@/lib/format';

/// Уведомления в админке: рассылка всем пользователям (с подтверждением),
/// Discord-вебхуки и статистика. Вкладки и действия — по правам
/// `notifications.*`; адрес вебхука показывается только маской.

const HTTPS_LINK = /^https:\/\/\S+$/;
const TITLE_MAX = 200;
const MESSAGE_MAX = 2000;
const typeLabel = (key: string) => (NOTIFICATION_TYPE_LABEL as Record<string, string>)[key] ?? key;

/* ---------------- Рассылка ---------------- */

function BroadcastTab() {
  const send = useBroadcast();
  const [form, setForm] = useState({
    title: '',
    message: '',
    link: '',
    type: 'ANNOUNCEMENT' as BroadcastType,
    priority: 'NORMAL' as BroadcastPriority,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<BroadcastInput | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = 'Введите заголовок';
    const link = form.link.trim();
    if (link && !HTTPS_LINK.test(link)) next.link = 'Ссылка вида https://…';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setConfirming({
      title: form.title.trim(),
      message: form.message.trim() || undefined,
      link: link || undefined,
      type: form.type,
      priority: form.priority,
    });
  };

  return (
    <form onSubmit={submit} noValidate className="flex max-w-2xl flex-col gap-3">
      <Field label="Заголовок" required error={errors.title}>
        <Input
          value={form.title}
          maxLength={TITLE_MAX}
          onChange={(e) => set({ title: e.target.value })}
        />
      </Field>
      <Field label="Текст">
        <Textarea
          rows={4}
          value={form.message}
          maxLength={MESSAGE_MAX}
          onChange={(e) => set({ message: e.target.value })}
        />
      </Field>
      <Field label="Ссылка" error={errors.link} hint="Необязательно, только https://">
        <Input
          value={form.link}
          spellCheck={false}
          onChange={(e) => set({ link: e.target.value })}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Тип">
          <select
            className={inputClassName}
            value={form.type}
            onChange={(e) => set({ type: e.target.value as BroadcastType })}
          >
            {(Object.keys(BROADCAST_TYPE_LABEL) as BroadcastType[]).map((value) => (
              <option key={value} value={value}>
                {BROADCAST_TYPE_LABEL[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Приоритет">
          <select
            className={inputClassName}
            value={form.priority}
            onChange={(e) => set({ priority: e.target.value as BroadcastPriority })}
          >
            {(Object.keys(BROADCAST_PRIORITY_LABEL) as BroadcastPriority[]).map((value) => (
              <option key={value} value={value}>
                {BROADCAST_PRIORITY_LABEL[value]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p role="note" className="rounded-lg bg-warning-soft px-4 py-2 text-sm text-warning">
        Уведомление получат все пользователи сайта, а копия уйдёт в системные Discord-вебхуки.
        Отозвать рассылку нельзя.
      </p>
      <Button type="submit" className="self-start">
        Отправить всем
      </Button>
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Отправить уведомление всем?"
        description={`«${confirming?.title ?? ''}» получат все пользователи. Действие необратимо.`}
        confirmLabel="Отправить всем"
        destructive
        loading={send.isPending}
        onConfirm={() =>
          send.mutate(confirming!, {
            onSuccess: (result) => {
              toast.success(`Отправлено получателям: ${formatNumber(result.count)}`);
              setConfirming(null);
              setForm((current) => ({ ...current, title: '', message: '', link: '' }));
            },
            onError: (error) => toast.error(getErrorMessage(error)),
          })
        }
      />
    </form>
  );
}

/* ---------------- Вебхуки ---------------- */

function WebhookDialog({ webhook, onClose }: { webhook: WebhookRow | null; onClose: () => void }) {
  const { create, update } = useWebhookActions();
  const [name, setName] = useState(webhook?.name ?? '');
  const [url, setUrl] = useState('');
  const [types, setTypes] = useState<string[]>(webhook?.eventTypes ?? []);
  const [isActive, setIsActive] = useState(webhook?.isActive ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const toggle = (type: string, checked: boolean) =>
    setTypes((current) =>
      checked ? [...current, type] : current.filter((value) => value !== type),
    );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Введите название';
    if (!webhook && !/^https:\/\/\S+$/.test(url.trim())) next.url = 'Адрес вида https://…';
    if (webhook && url.trim() && !/^https:\/\/\S+$/.test(url.trim())) {
      next.url = 'Адрес вида https://…';
    }
    if (types.length === 0) next.types = 'Выберите хотя бы один тип событий';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const done = {
      onSuccess: () => {
        toast.success(webhook ? 'Вебхук сохранён' : 'Вебхук добавлен');
        onClose();
      },
      onError: (error: unknown) => toast.error(getErrorMessage(error)),
    };
    const body = { name: name.trim(), eventTypes: types, isActive };
    if (webhook) {
      update.mutate(
        { id: webhook.id, body: { ...body, ...(url.trim() ? { url: url.trim() } : {}) } },
        done,
      );
    } else {
      create.mutate({ ...body, url: url.trim() }, done);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{webhook ? 'Изменить вебхук' : 'Новый вебхук'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            <Field label="Название" required error={errors.name}>
              <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field
              label="Адрес Discord-вебхука"
              required={!webhook}
              error={errors.url}
              hint={
                webhook
                  ? `Сейчас: ${webhook.maskedUrl}. Оставьте пустым, чтобы не менять.`
                  : 'Адрес хранится на сервере и больше не показывается целиком.'
              }
            >
              <Input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </Field>
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-[13px] font-medium">Типы событий</legend>
              <div className="grid max-h-56 gap-x-4 overflow-y-auto sm:grid-cols-2">
                {NOTIFICATION_TYPES.map((type) => (
                  <CheckboxField
                    key={type}
                    label={typeLabel(type)}
                    checked={types.includes(type)}
                    onCheckedChange={(checked) => toggle(type, checked === true)}
                  />
                ))}
              </div>
              {errors.types ? (
                <p role="alert" className="text-xs text-destructive">
                  {errors.types}
                </p>
              ) : null}
            </fieldset>
            <CheckboxField
              label="Вебхук включён"
              checked={isActive}
              onCheckedChange={(checked) => setIsActive(checked === true)}
            />
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

function WebhooksTab() {
  const { can } = usePermissions();
  const webhooks = useWebhooks(true);
  const { remove, update } = useWebhookActions();
  const [editing, setEditing] = useState<WebhookRow | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<WebhookRow | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {can('notifications.webhooks.create') ? (
        <Button className="self-start" onClick={() => setEditing(null)}>
          <Plus />
          Добавить вебхук
        </Button>
      ) : null}
      {webhooks.isPending ? (
        <SkeletonRows rows={3} />
      ) : webhooks.isError ? (
        <ErrorState error={webhooks.error} onRetry={() => webhooks.refetch()} />
      ) : webhooks.data.length === 0 ? (
        <EmptyState
          icon={<Webhook />}
          title="Вебхуков пока нет"
          description="Копии рассылок и событий можно отправлять в Discord."
        />
      ) : (
        <ul
          className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
          data-testid="webhooks"
        >
          {webhooks.data.map((webhook) => (
            <li key={webhook.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{webhook.name}</span>
                  <Badge tone={webhook.isActive ? 'success' : 'neutral'}>
                    {webhook.isActive ? 'Включён' : 'Выключен'}
                  </Badge>
                </div>
                <span className="font-mono text-xs text-muted-foreground">{webhook.maskedUrl}</span>
                <span className="text-xs text-subtle-foreground">
                  типов событий: {webhook.eventTypes.length}
                  {webhook.createdAt ? ` · создан ${formatDate(webhook.createdAt)}` : ''}
                </span>
              </div>
              <span className="flex flex-wrap gap-1">
                {can('notifications.webhooks.edit') ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={update.isPending && update.variables?.id === webhook.id}
                      onClick={() =>
                        update.mutate(
                          { id: webhook.id, body: { isActive: !webhook.isActive } },
                          { onError: (error) => toast.error(getErrorMessage(error)) },
                        )
                      }
                    >
                      {webhook.isActive ? 'Выключить' : 'Включить'}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(webhook)}>
                      Изменить
                    </Button>
                  </>
                ) : null}
                {can('notifications.webhooks.delete') ? (
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(webhook)}>
                    Удалить
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {editing !== undefined ? (
        <WebhookDialog
          key={editing?.id ?? 'new'}
          webhook={editing}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Удалить вебхук «${deleting?.name ?? ''}»?`}
        description="Уведомления в этот канал Discord перестанут отправляться. Действие необратимо."
        confirmLabel="Удалить"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(deleting!.id, {
            onSuccess: () => {
              toast.success('Вебхук удалён');
              setDeleting(null);
            },
            onError: (error) => toast.error(getErrorMessage(error)),
          })
        }
      />
    </div>
  );
}

/* ---------------- Статистика ---------------- */

function StatsTab() {
  const stats = useNotificationStats(true);
  if (stats.isPending) return <SkeletonRows rows={4} />;
  if (stats.isError) return <ErrorState error={stats.error} onRetry={() => stats.refetch()} />;
  const entries = Object.entries(stats.data.byType ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <div className="flex flex-col gap-4" data-testid="notification-stats">
      <p className="text-sm">
        Всего: {formatNumber(stats.data.total)} · не прочитано: {formatNumber(stats.data.unread)}
      </p>
      {entries.length === 0 ? (
        <EmptyState icon={<BellRing />} title="Уведомлений пока нет" />
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm">
          {entries.map(([type, count]) => (
            <li key={type} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <span>{typeLabel(type)}</span>
              <span className="tabular-nums text-muted-foreground">{formatNumber(count)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotificationsContent() {
  const { can } = usePermissions();
  const canBroadcast = can('notifications.broadcast');
  const canWebhooks = can('notifications.webhooks.view');
  const canStats = can('notifications.stats.view');
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Уведомления"
        breadcrumbs={[{ label: 'Коммуникации' }, { label: 'Уведомления' }]}
        description="Рассылка всем пользователям, Discord-вебхуки и статистика."
      />
      <PageSection>
        <Tabs
          defaultValue={canBroadcast ? 'broadcast' : canWebhooks ? 'webhooks' : 'stats'}
          variant="line"
        >
          <TabsList aria-label="Разделы уведомлений">
            {canBroadcast ? <TabsTrigger value="broadcast">Рассылка</TabsTrigger> : null}
            {canWebhooks ? <TabsTrigger value="webhooks">Вебхуки</TabsTrigger> : null}
            {canStats ? <TabsTrigger value="stats">Статистика</TabsTrigger> : null}
          </TabsList>
          {canBroadcast ? (
            <TabsContent value="broadcast" className="pt-4">
              <BroadcastTab />
            </TabsContent>
          ) : null}
          {canWebhooks ? (
            <TabsContent value="webhooks" className="pt-4">
              <WebhooksTab />
            </TabsContent>
          ) : null}
          {canStats ? (
            <TabsContent value="stats" className="pt-4">
              <StatsTab />
            </TabsContent>
          ) : null}
        </Tabs>
      </PageSection>
    </div>
  );
}

export default function AdminNotificationsPage() {
  return (
    <PermissionGate
      requirement={[
        'notifications.broadcast',
        'notifications.webhooks.view',
        'notifications.stats.view',
      ]}
    >
      <NotificationsContent />
    </PermissionGate>
  );
}
