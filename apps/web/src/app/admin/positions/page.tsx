'use client';

import { BriefcaseBusiness, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckboxField } from '@/components/ui/checkbox';
import { ColorPicker } from '@/components/ui/color-picker';
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
import { Input, Textarea } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import {
  useAdminPositionActions,
  useAdminPositions,
  type AdminPosition,
  type PositionInput,
} from '@/lib/admin/positions';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';

/// Должности в админке (срез 7.6, ADR-0140): каталог по приоритету,
/// создание и правка, удаление с подтверждением. Удалить нельзя должность по
/// умолчанию, назначенную игрокам или выдаваемую товаром магазина — кнопка
/// недоступна и объясняет причину. Каждое действие — по своему праву
/// `positions.*`.

const SLUG = /^[a-z0-9-]+$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_COLOR = '#9ca3af';
const digits = (value: string) => value.replace(/\D/g, '');

function deleteBlocker(position: AdminPosition): string | null {
  if (position.isDefault) return 'Должность по умолчанию удалить нельзя';
  if (position.usersCount > 0) return `Назначена игрокам: ${position.usersCount}`;
  if (position.productsCount > 0) return 'Её выдают товары магазина';
  return null;
}

function PositionDialog({
  position,
  open,
  onOpenChange,
}: {
  position: AdminPosition | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { create, update } = useAdminPositionActions();
  const [form, setForm] = useState(() => ({
    name: position?.name ?? '',
    slug: position?.slug ?? '',
    displayName: position?.displayName ?? '',
    group: position?.group ?? '',
    color: position?.color ?? DEFAULT_COLOR,
    priority: String(position?.priority ?? 0),
    description: position?.description ?? '',
    isVisible: position?.isVisible ?? true,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!position) {
      if (form.name.trim().length < 2) next.name = 'От 2 символов';
      if (!SLUG.test(form.slug)) next.slug = 'Только строчные латинские буквы, цифры и дефис';
    }
    if (form.displayName.trim().length < 2) next.displayName = 'От 2 символов';
    if (!form.group.trim()) next.group = 'Укажите группу';
    if (!HEX.test(form.color)) next.color = 'Цвет в формате #RRGGBB';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const common = {
      displayName: form.displayName.trim(),
      group: form.group.trim(),
      color: form.color,
      priority: Number(form.priority) || 0,
      isVisible: form.isVisible,
    };
    const done = {
      onSuccess: () => {
        toast.success(position ? 'Должность сохранена' : 'Должность создана');
        onOpenChange(false);
      },
      onError: (error: unknown) => toast.error(getErrorMessage(error)),
    };
    if (position) {
      update.mutate(
        { id: position.id, body: { ...common, description: form.description.trim() || null } },
        done,
      );
    } else {
      const body: PositionInput = {
        ...common,
        name: form.name.trim(),
        slug: form.slug,
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
      };
      create.mutate(body, done);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{position ? 'Изменить должность' : 'Новая должность'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-3 sm:grid-cols-2">
            {position ? null : (
              <>
                <Field label="Название" required error={errors.name} hint="Служебное, уникальное">
                  <Input
                    value={form.name}
                    maxLength={64}
                    onChange={(e) => set({ name: e.target.value })}
                  />
                </Field>
                <Field label="Slug" required error={errors.slug} hint="Потом не меняется">
                  <Input
                    value={form.slug}
                    maxLength={64}
                    spellCheck={false}
                    onChange={(e) => set({ slug: e.target.value.toLowerCase() })}
                  />
                </Field>
              </>
            )}
            <Field label="Как показывать" required error={errors.displayName}>
              <Input
                value={form.displayName}
                maxLength={64}
                onChange={(e) => set({ displayName: e.target.value })}
              />
            </Field>
            <Field label="Группа" required error={errors.group} hint="staff, player…">
              <Input
                value={form.group}
                maxLength={32}
                spellCheck={false}
                onChange={(e) => set({ group: e.target.value })}
              />
            </Field>
            <Field label="Цвет" required error={errors.color}>
              <ColorPicker
                value={form.color}
                onChange={(color) => set({ color: color ?? DEFAULT_COLOR })}
              />
            </Field>
            <Field label="Приоритет" hint="Выше — раньше в списках">
              <Input
                inputMode="numeric"
                value={form.priority}
                onChange={(e) => set({ priority: digits(e.target.value) })}
              />
            </Field>
            <Field label="Описание" className="sm:col-span-2">
              <Textarea
                value={form.description}
                maxLength={500}
                rows={3}
                onChange={(e) => set({ description: e.target.value })}
              />
            </Field>
            <CheckboxField
              label="Показывать в публичном списке"
              checked={form.isVisible}
              onCheckedChange={(checked) => set({ isVisible: checked === true })}
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

function PositionsList() {
  const { can } = usePermissions();
  const positions = useAdminPositions();
  const { remove } = useAdminPositionActions();
  const [editing, setEditing] = useState<AdminPosition | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<AdminPosition | null>(null);

  return (
    <>
      {can('positions.create') ? (
        <Button className="self-start" onClick={() => setEditing(null)}>
          <Plus />
          Добавить должность
        </Button>
      ) : null}
      {positions.isPending ? (
        <SkeletonRows rows={4} />
      ) : positions.isError ? (
        <ErrorState error={positions.error} onRetry={() => positions.refetch()} />
      ) : positions.data.length === 0 ? (
        <EmptyState icon={<BriefcaseBusiness />} title="Должностей пока нет" />
      ) : (
        <ul
          className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
          data-testid="admin-positions"
        >
          {positions.data.map((position) => {
            const blocker = deleteBlocker(position);
            return (
              <li key={position.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Badge color={position.color}>{position.displayName}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">{position.slug}</span>
                    <Badge tone="neutral">{position.group}</Badge>
                    {position.isDefault ? <Badge tone="neutral">По умолчанию</Badge> : null}
                    {position.isVisible ? null : <Badge tone="warning">Скрыта</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Приоритет {position.priority} · игроков: {position.usersCount}
                  </span>
                </div>
                <span className="flex gap-1">
                  {can('positions.edit') ? (
                    <Button size="sm" variant="secondary" onClick={() => setEditing(position)}>
                      Изменить
                    </Button>
                  ) : null}
                  {can('positions.delete') ? (
                    blocker ? (
                      <Tooltip content={blocker}>
                        <span tabIndex={0} className="inline-flex cursor-not-allowed">
                          <Button size="sm" variant="ghost" disabled>
                            Удалить
                          </Button>
                        </span>
                      </Tooltip>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setDeleting(position)}>
                        Удалить
                      </Button>
                    )
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {editing !== undefined ? (
        <PositionDialog
          key={editing?.id ?? 'new'}
          position={editing}
          open
          onOpenChange={(open) => !open && setEditing(undefined)}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Удалить должность «${deleting?.displayName ?? ''}»?`}
        description="Действие необратимо."
        confirmLabel="Удалить"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(deleting!.id, {
            onSuccess: () => {
              toast.success('Должность удалена');
              setDeleting(null);
            },
            onError: (error) => toast.error(getErrorMessage(error)),
          })
        }
      />
    </>
  );
}

export default function AdminPositionsPage() {
  return (
    <PermissionGate requirement="positions.view">
      <div className="flex flex-col gap-4">
        <PageHeader title="Должности" description="Должности игроков и команды проекта." />
        <PositionsList />
      </div>
    </PermissionGate>
  );
}
