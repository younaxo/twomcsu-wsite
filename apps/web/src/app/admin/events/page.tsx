'use client';

import { CalendarDays, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { DateTimeField } from '@/components/admin/date-time-field';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Pagination } from '@/components/ui/pagination';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import {
  ADMIN_EVENTS_PAGE_SIZE,
  EVENT_CATEGORY_LABEL,
  EVENT_STATUS_LABEL,
  EVENT_VISIBILITY_LABEL,
  useAdminEventActions,
  useAdminEvents,
  type AdminEvent,
  type EventCategory,
  type EventInput,
  type EventStatus,
  type EventVisibility,
} from '@/lib/admin/events';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDateTime } from '@/lib/format';

/// События в админке (срез 7.4, ADR-0148): список с фильтром по статусу,
/// создание и правка в диалоге, публикация, отмена (участники получают
/// уведомление) и удаление — с подтверждением, по своим правам `events.*`.

const SLUG = /^[a-z0-9-]+$/;
const SITE_IMAGE = /^(https:\/\/cdn-files\.twomc\.su\/\S+|\/(?!\/)\S*)$/;
const digits = (value: string) => value.replace(/\D/g, '');

function EventDialog({ event, onClose }: { event: AdminEvent | null; onClose: () => void }) {
  const { create, update } = useAdminEventActions();
  const [form, setForm] = useState(() => ({
    title: event?.title ?? '',
    slug: event?.slug ?? '',
    description: event?.description ?? '',
    category: event?.category ?? ('COMMUNITY' as EventCategory),
    visibility: event?.visibility ?? ('PUBLIC' as EventVisibility),
    startsAt: event?.startsAt ?? null,
    endsAt: event?.endsAt ?? null,
    location: event?.location ?? '',
    server: event?.server ?? '',
    maxParticipants: event?.maxParticipants ? String(event.maxParticipants) : '',
    registrationDeadline: event?.registrationDeadline ?? null,
    coverImage: event?.coverImage ?? '',
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = 'Введите название';
    if (!event && !SLUG.test(form.slug)) {
      next.slug = 'Только строчные латинские буквы, цифры и дефис';
    }
    if (!form.description.trim()) next.description = 'Опишите событие';
    if (!form.startsAt) next.startsAt = 'Укажите начало';
    if (form.startsAt && form.endsAt && form.endsAt <= form.startsAt) {
      next.endsAt = 'Конец позже начала';
    }
    if (form.coverImage.trim() && !SITE_IMAGE.test(form.coverImage.trim())) {
      next.coverImage = 'Ссылка на cdn-files.twomc.su или путь сайта (/…)';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const cover = form.coverImage.trim();
    const body: EventInput = {
      title: form.title.trim(),
      description: form.description,
      category: form.category,
      visibility: form.visibility,
      startsAt: form.startsAt!,
      location: form.location.trim(),
      server: form.server.trim(),
      ...(form.endsAt ? { endsAt: form.endsAt } : {}),
      ...(form.maxParticipants ? { maxParticipants: Number(form.maxParticipants) } : {}),
      ...(form.registrationDeadline ? { registrationDeadline: form.registrationDeadline } : {}),
      ...(cover ? { coverImage: cover } : event ? { coverImage: null } : {}),
    };
    const done = {
      onSuccess: () => {
        toast.success(event ? 'Событие сохранено' : 'Событие создано');
        onClose();
      },
      onError: (error: unknown) => toast.error(getErrorMessage(error)),
    };
    if (event) update.mutate({ id: event.id, body }, done);
    else create.mutate({ ...body, slug: form.slug }, done);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{event ? 'Изменить событие' : 'Новое событие'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-3 sm:grid-cols-2">
            <Field label="Название" required error={errors.title} className="sm:col-span-2">
              <Input
                value={form.title}
                maxLength={200}
                onChange={(e) => set({ title: e.target.value })}
              />
            </Field>
            {event ? null : (
              <Field label="Slug" required error={errors.slug} hint="Адрес: /events/slug">
                <Input
                  value={form.slug}
                  maxLength={160}
                  spellCheck={false}
                  onChange={(e) => set({ slug: e.target.value.toLowerCase() })}
                />
              </Field>
            )}
            <Field label="Категория">
              <select
                className={inputClassName}
                value={form.category}
                onChange={(e) => set({ category: e.target.value as EventCategory })}
              >
                {Object.entries(EVENT_CATEGORY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Кому видно">
              <select
                className={inputClassName}
                value={form.visibility}
                onChange={(e) => set({ visibility: e.target.value as EventVisibility })}
              >
                {Object.entries(EVENT_VISIBILITY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Начало" required error={errors.startsAt}>
              <DateTimeField
                label="Начало"
                value={form.startsAt}
                fallbackTime="18:00"
                onChange={(value) => set({ startsAt: value })}
              />
            </Field>
            <Field label="Конец" error={errors.endsAt}>
              <DateTimeField
                label="Конец"
                value={form.endsAt}
                fallbackTime="20:00"
                onChange={(value) => set({ endsAt: value })}
              />
            </Field>
            <Field label="Место">
              <Input
                value={form.location}
                maxLength={160}
                onChange={(e) => set({ location: e.target.value })}
              />
            </Field>
            <Field label="Сервер">
              <Input
                value={form.server}
                maxLength={100}
                onChange={(e) => set({ server: e.target.value })}
              />
            </Field>
            <Field label="Мест" hint="Пусто — без ограничения">
              <Input
                inputMode="numeric"
                value={form.maxParticipants}
                onChange={(e) => set({ maxParticipants: digits(e.target.value) })}
              />
            </Field>
            <Field label="Запись до">
              <DateTimeField
                label="Запись до"
                value={form.registrationDeadline}
                fallbackTime="18:00"
                onChange={(value) => set({ registrationDeadline: value })}
              />
            </Field>
            <Field
              label="Обложка"
              error={errors.coverImage}
              hint="Ссылка на cdn-files.twomc.su или путь сайта"
              className="sm:col-span-2"
            >
              <Input
                value={form.coverImage}
                maxLength={500}
                spellCheck={false}
                onChange={(e) => set({ coverImage: e.target.value })}
              />
            </Field>
            <Field
              label="Описание"
              required
              error={errors.description}
              hint="Markdown"
              className="sm:col-span-2"
            >
              <Textarea
                value={form.description}
                maxLength={10_000}
                rows={5}
                onChange={(e) => set({ description: e.target.value })}
              />
            </Field>
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

function EventsList() {
  const { can } = usePermissions();
  const [status, setStatus] = useState<EventStatus | ''>('');
  const [page, setPage] = useState(1);
  const events = useAdminEvents(status, page);
  const { setStatus: changeStatus, remove } = useAdminEventActions();
  const [editing, setEditing] = useState<AdminEvent | null | undefined>(undefined);
  const [cancelling, setCancelling] = useState<AdminEvent | null>(null);
  const [deleting, setDeleting] = useState<AdminEvent | null>(null);
  const totalPages = events.data
    ? Math.max(1, Math.ceil(events.data.total / ADMIN_EVENTS_PAGE_SIZE))
    : 1;
  const onError = (error: unknown) => toast.error(getErrorMessage(error));

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {can('events.create') ? (
          <Button onClick={() => setEditing(null)}>
            <Plus />
            Новое событие
          </Button>
        ) : null}
        <select
          aria-label="Статус"
          className={`${inputClassName} w-auto`}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as EventStatus | '');
            setPage(1);
          }}
        >
          <option value="">Все статусы</option>
          {(Object.keys(EVENT_STATUS_LABEL) as EventStatus[]).map((value) => (
            <option key={value} value={value}>
              {EVENT_STATUS_LABEL[value]}
            </option>
          ))}
        </select>
      </div>
      {events.isPending ? (
        <SkeletonRows rows={5} />
      ) : events.isError ? (
        <ErrorState error={events.error} onRetry={() => events.refetch()} />
      ) : events.data.items.length === 0 ? (
        <EmptyState icon={<CalendarDays />} title="Событий нет" />
      ) : (
        <>
          <ul
            className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
            data-testid="admin-events"
          >
            {events.data.items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium">{item.title}</span>
                    <Badge tone={item.status === 'PUBLISHED' ? 'success' : 'neutral'}>
                      {EVENT_STATUS_LABEL[item.status]}
                    </Badge>
                    <Badge tone="neutral">{EVENT_CATEGORY_LABEL[item.category]}</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(item.startsAt)} · участников: {item._count?.participants ?? 0}
                    {item.maxParticipants ? ` из ${item.maxParticipants}` : ''}
                  </span>
                </div>
                <span className="flex flex-wrap gap-1">
                  {can('events.publish') && item.status === 'DRAFT' ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        changeStatus.mutate(
                          { id: item.id, action: 'publish' },
                          { onSuccess: () => toast.success('Событие опубликовано'), onError },
                        )
                      }
                    >
                      Опубликовать
                    </Button>
                  ) : null}
                  {can('events.edit') ? (
                    <Button size="sm" variant="secondary" onClick={() => setEditing(item)}>
                      Изменить
                    </Button>
                  ) : null}
                  {can('events.cancel') && item.status === 'PUBLISHED' ? (
                    <Button size="sm" variant="ghost" onClick={() => setCancelling(item)}>
                      Отменить
                    </Button>
                  ) : null}
                  {can('events.delete') ? (
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(item)}>
                      Удалить
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {totalPages > 1 ? (
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          ) : null}
        </>
      )}
      {editing !== undefined ? (
        <EventDialog
          key={editing?.id ?? 'new'}
          event={editing}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => !open && setCancelling(null)}
        title={`Отменить «${cancelling?.title ?? ''}»?`}
        description="Записавшиеся участники получат уведомление об отмене."
        confirmLabel="Отменить событие"
        destructive
        loading={changeStatus.isPending}
        onConfirm={() =>
          changeStatus.mutate(
            { id: cancelling!.id, action: 'cancel' },
            {
              onSuccess: () => {
                toast.success('Событие отменено');
                setCancelling(null);
              },
              onError,
            },
          )
        }
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Удалить «${deleting?.title ?? ''}»?`}
        description="Событие и записи участников будут удалены. Действие необратимо."
        confirmLabel="Удалить"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(deleting!.id, {
            onSuccess: () => {
              toast.success('Событие удалено');
              setDeleting(null);
            },
            onError,
          })
        }
      />
    </>
  );
}

export default function AdminEventsPage() {
  return (
    <PermissionGate requirement="events.view">
      <div className="flex flex-col gap-4">
        <PageHeader title="События" description="Ивенты, турниры и праздники на сервере." />
        <EventsList />
      </div>
    </PermissionGate>
  );
}
