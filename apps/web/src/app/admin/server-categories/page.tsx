'use client';

import { FolderTree, Plus } from 'lucide-react';
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
import { Input, Textarea } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import {
  useAdminServerCategories,
  useServerCategoryActions,
  type ServerCategoryInput,
  type ServerCategoryRow,
} from '@/lib/admin/server-categories';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';

/// Категории серверов в админке: список, создание, правка, удаление с
/// подтверждением. Каждое действие — по своему праву `server_categories.*`.

const SLUG = /^[a-z0-9-]+$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const digits = (value: string) => value.replace(/\D/g, '');

function emptyForm(category?: ServerCategoryRow) {
  return {
    name: category?.name ?? '',
    slug: category?.slug ?? '',
    description: category?.description ?? '',
    color: category?.color ?? '',
    order: String(category?.order ?? 0),
    isActive: category?.isActive ?? true,
  };
}

function CategoryDialog({
  category,
  onClose,
}: {
  category: ServerCategoryRow | null;
  onClose: () => void;
}) {
  const { create, update } = useServerCategoryActions();
  const [form, setForm] = useState(() => emptyForm(category ?? undefined));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Введите название';
    if (!category && !SLUG.test(form.slug)) {
      next.slug = 'Только строчные латинские буквы, цифры и дефис';
    }
    if (form.color && !COLOR.test(form.color)) next.color = 'Цвет в формате #RRGGBB';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const common = {
      name: form.name.trim(),
      description: form.description.trim(),
      ...(form.color ? { color: form.color } : {}),
      order: Number(form.order) || 0,
      isActive: form.isActive,
    };
    const done = {
      onSuccess: () => {
        toast.success(category ? 'Категория сохранена' : 'Категория добавлена');
        onClose();
      },
      onError: (error: unknown) => toast.error(getErrorMessage(error)),
    };
    if (category) {
      update.mutate({ id: category.id, body: common }, done);
    } else {
      const body: ServerCategoryInput = { ...common, slug: form.slug };
      create.mutate(body, done);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{category ? 'Изменить категорию' : 'Новая категория'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-3 sm:grid-cols-2">
            <Field label="Название" required error={errors.name}>
              <Input
                value={form.name}
                maxLength={100}
                onChange={(e) => set({ name: e.target.value })}
              />
            </Field>
            <Field
              label="Slug"
              required={!category}
              error={errors.slug}
              hint={category ? 'Slug после создания не меняется' : 'Строчные латинские буквы'}
            >
              <Input
                value={form.slug}
                maxLength={160}
                spellCheck={false}
                disabled={category !== null}
                onChange={(e) => set({ slug: e.target.value.toLowerCase() })}
              />
            </Field>
            <Field label="Цвет" error={errors.color} hint="Например, #F26A1B">
              <Input
                value={form.color}
                maxLength={7}
                spellCheck={false}
                onChange={(e) => set({ color: e.target.value })}
              />
            </Field>
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
                maxLength={500}
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

function CategoriesList() {
  const { can } = usePermissions();
  const categories = useAdminServerCategories();
  const { remove } = useServerCategoryActions();
  const [editing, setEditing] = useState<ServerCategoryRow | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<ServerCategoryRow | null>(null);

  return (
    <>
      {can('server_categories.create') ? (
        <Button className="self-start" onClick={() => setEditing(null)}>
          <Plus />
          Добавить категорию
        </Button>
      ) : null}
      {categories.isPending ? (
        <SkeletonRows rows={4} />
      ) : categories.isError ? (
        <ErrorState error={categories.error} onRetry={() => categories.refetch()} />
      ) : categories.data.length === 0 ? (
        <EmptyState
          icon={<FolderTree />}
          title="Категорий пока нет"
          description="Серверы можно показывать без категории."
        />
      ) : (
        <ul
          className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
          data-testid="server-categories"
        >
          {categories.data.map((category) => (
            <li key={category.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{category.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{category.slug}</span>
                  {category.isActive ? null : <Badge tone="warning">Скрыта</Badge>}
                </div>
                {category.description ? (
                  <p className="text-xs text-muted-foreground">{category.description}</p>
                ) : null}
              </div>
              <span className="text-xs text-subtle-foreground">порядок {category.order}</span>
              <span className="flex gap-1">
                {can('server_categories.edit') ? (
                  <Button size="sm" variant="secondary" onClick={() => setEditing(category)}>
                    Изменить
                  </Button>
                ) : null}
                {can('server_categories.delete') ? (
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(category)}>
                    Удалить
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {editing !== undefined ? (
        <CategoryDialog
          key={editing?.id ?? 'new'}
          category={editing}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Удалить категорию «${deleting?.name ?? ''}»?`}
        description="Категория будет удалена без возможности восстановления. Действие необратимо."
        confirmLabel="Удалить"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(deleting!.id, {
            onSuccess: () => {
              toast.success('Категория удалена');
              setDeleting(null);
            },
            onError: (error) => toast.error(getErrorMessage(error)),
          })
        }
      />
    </>
  );
}

export default function AdminServerCategoriesPage() {
  return (
    <PermissionGate requirement="server_categories.view">
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Категории серверов"
          breadcrumbs={[{ label: 'Система' }, { label: 'Категории серверов' }]}
          description="Группы для списка серверов на сайте."
        />
        <CategoriesList />
      </div>
    </PermissionGate>
  );
}
