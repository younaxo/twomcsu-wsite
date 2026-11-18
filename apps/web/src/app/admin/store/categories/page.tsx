'use client';

import { FolderTree, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
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
import {
  FormErrorSummary,
  FormField as Field,
  useFocusFirstInvalid,
} from '@/components/admin/form-field';
import { Input, Textarea, inputClassName } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { SwitchField } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import {
  useAdminCategories,
  useAdminCategoryActions,
  type AdminCategory,
  type CategoryCreateInput,
  type CategoryPatchInput,
} from '@/lib/admin/store-categories';
import { SLUG_PATTERN, describeStoreAdminError } from '@/lib/admin/store-products';
import { usePermissions } from '@/lib/auth/use-permissions';
import Link from 'next/link';

/// Категории магазина в админке (слой 0, 0.3). Права `store.categories.*`.
/// Ограничения API: slug после создания не меняется; родителя нельзя
/// сбросить (только сменить на другую категорию).

function CategoryDialog({
  category,
  all,
  open,
  onOpenChange,
}: {
  category: AdminCategory | null;
  all: AdminCategory[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { create, update } = useAdminCategoryActions();
  const [form, setForm] = useState(() => ({
    name: category?.name ?? '',
    slug: category?.slug ?? '',
    description: category?.description ?? '',
    parentId: category?.parentId ?? '',
    order: String(category?.order ?? 0),
    isActive: category?.isActive ?? true,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ message: string; twoFactor: boolean } | null>(null);
  const { containerRef, focusFirstInvalid } = useFocusFirstInvalid<HTMLFormElement>();
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const next: Record<string, string> = {};
    const name = form.name.trim();
    if (!name) next.name = 'Введите название';
    else if (name.length > 100) next.name = 'Не длиннее 100 символов';
    if (!category) {
      if (!form.slug) next.slug = 'Введите slug';
      else if (!SLUG_PATTERN.test(form.slug) || form.slug.length > 160) {
        next.slug = 'Только строчные латинские буквы, цифры и дефис';
      }
    }
    if (form.description.length > 500) next.description = 'Не длиннее 500 символов';
    if (!/^\d+$/.test(form.order.trim())) next.order = 'Целое число от 0';
    if (category?.parentId && !form.parentId) {
      next.parentId =
        'Снять родителя пока нельзя (ограничение API): выберите другую категорию или верните прежнюю';
    }
    setErrors(next);
    const count = Object.keys(next).length;
    if (count > 0) {
      // Одна сводка (role="alert"); ошибки полей — текстом у полей, без своих alert.
      setFormError({
        message: `Исправьте ошибки в форме (${count}). Первое поле с ошибкой выделено.`,
        twoFactor: false,
      });
      focusFirstInvalid();
      return;
    }

    const onError = (error: unknown) => {
      const info = describeStoreAdminError(error);
      setErrors(info.fields);
      const hasFields = Object.keys(info.fields).length > 0;
      setFormError(
        hasFields
          ? { message: 'Проверьте поля формы: сервер отклонил значения.', twoFactor: false }
          : { message: info.message, twoFactor: info.needsTwoFactor },
      );
      if (hasFields) focusFirstInvalid();
    };
    const onSuccess = () => {
      toast.success(category ? 'Категория сохранена' : 'Категория создана');
      onOpenChange(false);
    };
    if (category) {
      const body: CategoryPatchInput = {
        name,
        description: form.description.trim(),
        order: Number(form.order.trim()),
        isActive: form.isActive,
        ...(form.parentId && form.parentId !== (category.parentId ?? '')
          ? { parentId: form.parentId }
          : {}),
      };
      update.mutate({ id: category.id, body }, { onSuccess, onError });
    } else {
      const body: CategoryCreateInput = {
        name,
        slug: form.slug,
        order: Number(form.order.trim()),
        isActive: form.isActive,
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
        ...(form.parentId ? { parentId: form.parentId } : {}),
      };
      create.mutate(body, { onSuccess, onError });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form ref={containerRef} onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{category ? 'Изменить категорию' : 'Новая категория'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-3 sm:grid-cols-2">
            {formError ? (
              <FormErrorSummary data-testid="category-form-error" className="sm:col-span-2">
                {formError.message}{' '}
                {formError.twoFactor ? (
                  <Link href="/settings/security" className="font-medium underline">
                    Включить 2FA
                  </Link>
                ) : null}
              </FormErrorSummary>
            ) : null}
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
              hint={category ? 'Slug не меняется после создания' : undefined}
            >
              <Input
                value={form.slug}
                maxLength={160}
                spellCheck={false}
                disabled={category !== null}
                onChange={(e) => set({ slug: e.target.value.toLowerCase() })}
              />
            </Field>
            <Field label="Родительская категория" error={errors.parentId}>
              <select
                className={inputClassName}
                value={form.parentId}
                onChange={(e) => set({ parentId: e.target.value })}
              >
                <option value="">Без родителя</option>
                {all
                  .filter((c) => c.id !== category?.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Порядок" error={errors.order} hint="Меньше — выше в списке">
              <Input
                inputMode="numeric"
                value={form.order}
                onChange={(e) => set({ order: e.target.value })}
              />
            </Field>
            <Field label="Описание" error={errors.description} className="sm:col-span-2">
              <Textarea
                rows={3}
                maxLength={500}
                value={form.description}
                onChange={(e) => set({ description: e.target.value })}
              />
            </Field>
            <SwitchField
              wrapperClassName="sm:col-span-2"
              label="Категория активна (видна на витрине)"
              checked={form.isActive}
              onCheckedChange={(checked) => set({ isActive: checked })}
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

function CategoriesList() {
  const { can } = usePermissions();
  const categories = useAdminCategories();
  const { remove, update } = useAdminCategoryActions();
  const [editing, setEditing] = useState<AdminCategory | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<AdminCategory | null>(null);
  const all = categories.data ?? [];
  const nameById = new Map(all.map((c) => [c.id, c.name]));

  return (
    <>
      {can('store.categories.create') ? (
        <Button className="self-start" onClick={() => setEditing(null)}>
          <Plus />
          Новая категория
        </Button>
      ) : null}
      {categories.isPending ? (
        <SkeletonRows rows={4} />
      ) : categories.isError ? (
        <ErrorState error={categories.error} onRetry={() => categories.refetch()} />
      ) : all.length === 0 ? (
        <EmptyState icon={<FolderTree />} title="Категорий пока нет" />
      ) : (
        <ul
          className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
          data-testid="admin-categories"
        >
          {all.map((category) => (
            <li key={category.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium">{category.name}</span>
                  {category.isActive ? null : <Badge tone="warning">Скрыта</Badge>}
                </div>
                <span className="text-xs text-muted-foreground">
                  {category.slug}
                  {category.parentId
                    ? ` · внутри: ${nameById.get(category.parentId) ?? 'неизвестной категории'}`
                    : ''}{' '}
                  · порядок {category.order}
                </span>
              </div>
              <span className="flex flex-wrap gap-1">
                {can('store.categories.edit') ? (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(category)}>
                      Изменить
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={update.isPending && update.variables?.id === category.id}
                      onClick={() =>
                        update.mutate(
                          { id: category.id, body: { isActive: !category.isActive } },
                          {
                            onSuccess: () =>
                              toast.success(
                                category.isActive ? 'Категория скрыта' : 'Категория включена',
                              ),
                            onError: (error) => toast.error(describeStoreAdminError(error).message),
                          },
                        )
                      }
                    >
                      {category.isActive ? 'Скрыть' : 'Включить'}
                    </Button>
                  </>
                ) : null}
                {can('store.categories.delete') ? (
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
          all={all}
          open
          onOpenChange={(open) => !open && setEditing(undefined)}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Удалить категорию «${deleting?.name ?? ''}»?`}
        description="Категорию с подкатегориями или товарами удалить нельзя. Действие необратимо."
        confirmLabel="Удалить"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(deleting!.id, {
            onSuccess: () => {
              toast.success('Категория удалена');
              setDeleting(null);
            },
            onError: (error) => {
              toast.error(describeStoreAdminError(error).message);
              setDeleting(null);
            },
          })
        }
      />
    </>
  );
}

export default function AdminStoreCategoriesPage() {
  return (
    <PermissionGate requirement="store.categories.view">
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Категории магазина"
          description="Разделы витрины: порядок, видимость, вложенность."
          breadcrumbs={[{ label: 'Магазин' }, { label: 'Категории' }]}
        />
        <CategoriesList />
      </div>
    </PermissionGate>
  );
}
