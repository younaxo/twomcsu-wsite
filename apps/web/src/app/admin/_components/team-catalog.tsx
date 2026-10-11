'use client';

import { Plus } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
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
import {
  useTeamCatalog,
  useTeamCatalogActions,
  type TeamCatalogInput,
  type TeamCatalogItem,
  type TeamCatalogKind,
} from '@/lib/admin/team';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';

/// Каталог отделов или своих должностей (срез 7.6, ADR-0140): список с
/// цветом и счётчиком, создание и правка в диалоге, удаление с
/// подтверждением (снимается со всех). Каждое действие — по своему праву.

export interface TeamCatalogCopy {
  title: string;
  description: string;
  emptyTitle: string;
  addLabel: string;
  createTitle: string;
  editTitle: string;
  created: string;
  saved: string;
  deleted: string;
  /// «Участников: 3» / «У игроков: 3».
  countLabel: string;
  deleteTitle: (name: string) => string;
  deleteDescription: (count: number) => string;
}

const SLUG = /^[a-z0-9-]+$/;
const digits = (value: string) => value.replace(/\D/g, '');

function count(kind: TeamCatalogKind, item: TeamCatalogItem): number {
  return item[kind.countField] ?? 0;
}

function CatalogDialog({
  kind,
  copy,
  item,
  onOpenChange,
}: {
  kind: TeamCatalogKind;
  copy: TeamCatalogCopy;
  item: TeamCatalogItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { create, update } = useTeamCatalogActions(kind);
  const [form, setForm] = useState(() => ({
    name: item?.name ?? '',
    slug: item?.slug ?? '',
    description: item?.description ?? '',
    color: item?.color ?? null,
    isActive: item?.isActive ?? true,
    order: String(item?.order ?? 0),
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = 'От 2 символов';
    if (!item && !SLUG.test(form.slug)) {
      next.slug = 'Только строчные латинские буквы, цифры и дефис';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const done = {
      onSuccess: () => {
        toast.success(item ? copy.saved : copy.created);
        onOpenChange(false);
      },
      onError: (error: unknown) => toast.error(getErrorMessage(error)),
    };
    if (item) {
      update.mutate(
        {
          id: item.id,
          body: {
            name: form.name.trim(),
            description: form.description.trim() || null,
            color: form.color,
            isActive: form.isActive,
            ...(kind.ordered ? { order: Number(form.order) || 0 } : {}),
          },
        },
        done,
      );
    } else {
      const body: TeamCatalogInput = {
        name: form.name.trim(),
        slug: form.slug,
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
        ...(form.color ? { color: form.color } : {}),
      };
      create.mutate(body, done);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{item ? copy.editTitle : copy.createTitle}</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-3 sm:grid-cols-2">
            <Field label="Название" required error={errors.name}>
              <Input
                value={form.name}
                maxLength={64}
                onChange={(e) => set({ name: e.target.value })}
              />
            </Field>
            {item ? null : (
              <Field label="Slug" required error={errors.slug} hint="Потом не меняется">
                <Input
                  value={form.slug}
                  maxLength={64}
                  spellCheck={false}
                  onChange={(e) => set({ slug: e.target.value.toLowerCase() })}
                />
              </Field>
            )}
            <Field label="Цвет">
              <ColorPicker value={form.color} onChange={(color) => set({ color })} clearable />
            </Field>
            {item && kind.ordered ? (
              <Field label="Порядок">
                <Input
                  inputMode="numeric"
                  value={form.order}
                  onChange={(e) => set({ order: digits(e.target.value) })}
                />
              </Field>
            ) : null}
            <Field label="Описание" className="sm:col-span-2">
              <Textarea
                value={form.description}
                maxLength={500}
                rows={3}
                onChange={(e) => set({ description: e.target.value })}
              />
            </Field>
            {item ? (
              <CheckboxField
                label="Активен"
                checked={form.isActive}
                onCheckedChange={(checked) => set({ isActive: checked === true })}
              />
            ) : null}
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

function CatalogList({
  kind,
  copy,
  emptyIcon,
}: {
  kind: TeamCatalogKind;
  copy: TeamCatalogCopy;
  emptyIcon: ReactNode;
}) {
  const { can } = usePermissions();
  const items = useTeamCatalog(kind);
  const { remove } = useTeamCatalogActions(kind);
  const [editing, setEditing] = useState<TeamCatalogItem | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<TeamCatalogItem | null>(null);

  return (
    <>
      {can(kind.permissions.create) ? (
        <Button className="self-start" onClick={() => setEditing(null)}>
          <Plus />
          {copy.addLabel}
        </Button>
      ) : null}
      {items.isPending ? (
        <SkeletonRows rows={4} />
      ) : items.isError ? (
        <ErrorState error={items.error} onRetry={() => items.refetch()} />
      ) : items.data.length === 0 ? (
        <EmptyState icon={emptyIcon} title={copy.emptyTitle} />
      ) : (
        <ul
          className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
          data-testid="team-catalog"
        >
          {items.data.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {item.color ? (
                    <Badge color={item.color}>{item.name}</Badge>
                  ) : (
                    <span className="text-sm font-medium">{item.name}</span>
                  )}
                  <span className="font-mono text-xs text-muted-foreground">{item.slug}</span>
                  {item.isActive ? null : <Badge tone="warning">Не активен</Badge>}
                </div>
                <span className="text-xs text-muted-foreground">
                  {copy.countLabel}: {count(kind, item)}
                </span>
              </div>
              <span className="flex gap-1">
                {can(kind.permissions.edit) ? (
                  <Button size="sm" variant="secondary" onClick={() => setEditing(item)}>
                    Изменить
                  </Button>
                ) : null}
                {can(kind.permissions.delete) ? (
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(item)}>
                    Удалить
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {editing !== undefined ? (
        <CatalogDialog
          key={editing?.id ?? 'new'}
          kind={kind}
          copy={copy}
          item={editing}
          onOpenChange={(open) => !open && setEditing(undefined)}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={copy.deleteTitle(deleting?.name ?? '')}
        description={copy.deleteDescription(deleting ? count(kind, deleting) : 0)}
        confirmLabel="Удалить"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(deleting!.id, {
            onSuccess: () => {
              toast.success(copy.deleted);
              setDeleting(null);
            },
            onError: (error) => toast.error(getErrorMessage(error)),
          })
        }
      />
    </>
  );
}

export function TeamCatalogPage({
  kind,
  copy,
  emptyIcon,
}: {
  kind: TeamCatalogKind;
  copy: TeamCatalogCopy;
  emptyIcon: ReactNode;
}) {
  return (
    <PermissionGate requirement={kind.permissions.view}>
      <div className="flex flex-col gap-4">
        <PageHeader title={copy.title} description={copy.description} />
        <CatalogList kind={kind} copy={copy} emptyIcon={emptyIcon} />
      </div>
    </PermissionGate>
  );
}
