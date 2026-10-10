'use client';

import {
  ANNOUNCEMENT_KINDS,
  ANNOUNCEMENT_LIMITS,
  ANNOUNCEMENT_PLACEMENTS,
  type AdminAnnouncementDto,
  type AnnouncementAudience,
  type AnnouncementKind,
  type AnnouncementPlacement,
  type UpsertAnnouncementRequest,
} from '@twomc/shared';
import { useEffect, useMemo, useState } from 'react';
import { AnnouncementView } from '@/components/announcements/announcement-view';
import { Button } from '@/components/ui/button';
import { CheckboxField } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { RadioCards } from '@/components/ui/radio-group';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SwitchField } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { useSaveAnnouncement } from '@/lib/admin/announcements';
import { useRoles } from '@/lib/admin/hooks';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { ANNOUNCEMENT_KIND_META, ANNOUNCEMENT_PLACEMENT_LABELS } from '@/lib/site/announcements';
import { isoToLocalParts, localPartsToIso, timezoneLabel } from '@/lib/site/local-datetime';

interface Form {
  title: string;
  message: string;
  kind: AnnouncementKind;
  link: string;
  isDismissible: boolean;
  showFrom: string | null;
  showUntil: string | null;
  audience: AnnouncementAudience;
  targetRole: string | null;
  placements: AnnouncementPlacement[];
}

const LINK_PATTERN = /^(\/(?!\/)\S*|https:\/\/\S+)$/;

const EMPTY: Form = {
  title: '',
  message: '',
  kind: 'info',
  link: '',
  isDismissible: true,
  showFrom: null,
  showUntil: null,
  audience: 'all',
  targetRole: null,
  placements: ['banner'],
};

function fromDto(item: AdminAnnouncementDto): Form {
  return {
    title: item.title,
    message: item.message,
    kind: item.kind,
    link: item.link ?? '',
    isDismissible: item.isDismissible,
    showFrom: item.showFrom,
    showUntil: item.showUntil,
    audience: item.audience,
    targetRole: item.targetRole,
    placements: item.placements,
  };
}

export function validateAnnouncement(
  form: Pick<
    Form,
    'title' | 'message' | 'link' | 'showFrom' | 'showUntil' | 'audience' | 'targetRole'
  >,
) {
  const errors: Partial<Record<'title' | 'message' | 'link' | 'period' | 'targetRole', string>> =
    {};
  if (!form.title.trim()) errors.title = 'Введите заголовок';
  if (!form.message.trim()) errors.message = 'Введите текст';
  const link = form.link.trim();
  if (link && !LINK_PATTERN.test(link)) errors.link = 'Внутренний путь /… или https://…';
  if (form.showFrom && form.showUntil && Date.parse(form.showFrom) >= Date.parse(form.showUntil)) {
    errors.period = 'Начало показа должно быть раньше конца';
  }
  if (form.audience === 'role' && !form.targetRole) errors.targetRole = 'Выберите роль';
  return errors;
}

/// Дата + время в поясе администратора; хранение — ISO (UTC).
function DateTimeField({
  label,
  value,
  fallbackTime,
  onChange,
}: {
  label: string;
  value: string | null;
  fallbackTime: string;
  onChange: (value: string | null) => void;
}) {
  const parts = isoToLocalParts(value);
  return (
    <div className="flex items-center gap-2">
      <DatePicker
        aria-label={`${label}: дата`}
        placeholder={label}
        value={parts.date}
        clearable
        onChange={(date) => onChange(date ? localPartsToIso(date, parts.time, fallbackTime) : null)}
      />
      <Input
        type="time"
        className="w-28"
        aria-label={`${label}: время`}
        value={parts.time}
        disabled={!parts.date}
        onChange={(event) =>
          parts.date && onChange(localPartsToIso(parts.date, event.target.value, fallbackTime))
        }
      />
    </div>
  );
}

/// Создание и изменение объявления. Сохраняется без публикации — публикация
/// отдельным действием в списке (с подтверждением).
export function AnnouncementEditor({
  open,
  onOpenChange,
  item,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// null — новое объявление.
  item: AdminAnnouncementDto | null;
}) {
  const { can } = usePermissions();
  const canListRoles = can('roles.view');
  const roles = useRoles(canListRoles && open);
  const save = useSaveAnnouncement();
  const [form, setForm] = useState<Form>(EMPTY);
  const [touched, setTouched] = useState(false);
  const zone = useMemo(() => timezoneLabel(), []);

  useEffect(() => {
    if (open) {
      setForm(item ? fromDto(item) : EMPTY);
      setTouched(false);
    }
  }, [open, item]);

  const errors = touched ? validateAnnouncement(form) : {};
  const valid = Object.keys(validateAnnouncement(form)).length === 0;
  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  const togglePlacement = (placement: AnnouncementPlacement, checked: boolean) =>
    set(
      'placements',
      checked
        ? [...form.placements, placement]
        : form.placements.filter((value) => value !== placement),
    );

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    const body: UpsertAnnouncementRequest = {
      ...form,
      title: form.title.trim(),
      message: form.message.trim(),
      link: form.link.trim() || null,
      targetRole: form.audience === 'role' ? form.targetRole : null,
    };
    try {
      await save.mutateAsync({ id: item?.id, body });
      toast.success(item ? 'Объявление сохранено' : 'Черновик создан');
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{item ? 'Изменить объявление' : 'Новое объявление'}</DialogTitle>
          <DialogDescription>
            Сохраняется черновиком; показ начнётся после публикации.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex flex-col gap-4">
            <Field label="Тип">
              <RadioCards
                aria-label="Тип объявления"
                columns={3}
                value={form.kind}
                onValueChange={(value) => set('kind', value as AnnouncementKind)}
                options={ANNOUNCEMENT_KINDS.map((kind) => ({
                  value: kind,
                  label: ANNOUNCEMENT_KIND_META[kind].label,
                }))}
              />
            </Field>
            <Field label="Заголовок" required error={errors.title}>
              <Input
                value={form.title}
                maxLength={ANNOUNCEMENT_LIMITS.title}
                onChange={(event) => set('title', event.target.value)}
              />
            </Field>
            <Field label="Текст" required error={errors.message}>
              <Textarea
                rows={4}
                value={form.message}
                maxLength={ANNOUNCEMENT_LIMITS.message}
                onChange={(event) => set('message', event.target.value)}
              />
            </Field>
            <Field
              label="Ссылка «Подробнее»"
              hint="Необязательно: /news или https://…"
              error={errors.link}
            >
              <Input
                value={form.link}
                placeholder="/news"
                onChange={(event) => set('link', event.target.value)}
              />
            </Field>
            <Field label="Где показывать" hint="Можно несколько мест">
              <div className="flex flex-col">
                {ANNOUNCEMENT_PLACEMENTS.map((placement) => (
                  <CheckboxField
                    key={placement}
                    label={ANNOUNCEMENT_PLACEMENT_LABELS[placement]}
                    description={
                      placement === 'notifications'
                        ? 'Уведомление придёт один раз — когда начнётся показ'
                        : undefined
                    }
                    checked={form.placements.includes(placement)}
                    onCheckedChange={(checked) => togglePlacement(placement, checked === true)}
                  />
                ))}
              </div>
            </Field>
            <Field label="Кому" error={errors.targetRole}>
              <div className="flex flex-wrap items-center gap-3">
                <SegmentedControl
                  aria-label="Аудитория"
                  value={form.audience}
                  onValueChange={(value) => set('audience', value as AnnouncementAudience)}
                  options={[
                    { value: 'all', label: 'Всем' },
                    { value: 'users', label: 'Вошедшим' },
                    ...(canListRoles ? [{ value: 'role', label: 'Роли' }] : []),
                  ]}
                />
                {form.audience === 'role' ? (
                  <Combobox
                    aria-label="Роль"
                    className="w-56"
                    options={(roles.data ?? []).map((role) => ({
                      value: role.name,
                      label: role.displayName,
                      keywords: [role.slug],
                    }))}
                    value={form.targetRole}
                    onValueChange={(value) => set('targetRole', value)}
                    loading={roles.isPending}
                    placeholder="Выберите роль"
                  />
                ) : null}
              </div>
            </Field>
            <Field
              label="Период показа"
              hint={`Пусто — сразу после публикации и бессрочно. Часовой пояс: ${zone}`}
              error={errors.period}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <DateTimeField
                  label="Начало"
                  value={form.showFrom}
                  fallbackTime="00:00"
                  onChange={(value) => set('showFrom', value)}
                />
                <DateTimeField
                  label="Конец"
                  value={form.showUntil}
                  fallbackTime="23:59"
                  onChange={(value) => set('showUntil', value)}
                />
              </div>
            </Field>
            <SwitchField
              label="Можно скрыть"
              description="Посетитель может закрыть объявление на сайте"
              checked={form.isDismissible}
              onCheckedChange={(value) => set('isDismissible', value)}
            />
          </div>
          <aside className="flex flex-col gap-2 lg:sticky lg:top-0 lg:self-start">
            <p className="text-xs text-muted-foreground">Предпросмотр</p>
            <div className="rounded-xl bg-background-subtle p-3" data-testid="announcement-preview">
              <AnnouncementView
                announcement={{
                  title: form.title.trim() || 'Заголовок',
                  message: form.message.trim() || 'Текст объявления появится здесь.',
                  kind: form.kind,
                  link: form.link.trim() || null,
                  isDismissible: form.isDismissible,
                }}
                onDismiss={() => undefined}
              />
            </div>
          </aside>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            {item ? 'Сохранить' : 'Создать черновик'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
