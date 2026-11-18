'use client';

import { PackageOpen, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Field } from '@/components/ui/field';
import { Input, inputClassName } from '@/components/ui/input';
import { Pagination, PaginationSummary } from '@/components/ui/pagination';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { useAdminCategories } from '@/lib/admin/store-categories';
import {
  ADMIN_PRODUCTS_PAGE_SIZE,
  PRODUCT_TYPE_LABEL,
  describeStoreAdminError,
  useAdminProductActions,
  useAdminProducts,
  type AdminProduct,
} from '@/lib/admin/store-products';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatMoney } from '@/lib/format';
import { durationLabel, priceSummary, useStoreCategories } from '@/lib/store/catalog';
import { ProductDialog, type CategoryOption } from './_components/product-dialog';

/// Товары магазина в админке (слой 0, 0.3): список, создание, правка,
/// деактивация, удаление (мягкое при заказах). Права `store.products.*`.

type StatusFilter = 'all' | 'active' | 'inactive';

function priceText(product: AdminProduct): string {
  const active = product.variants.filter((v) => v.isActive);
  if (active.length === 0) return 'Нет активных вариантов';
  const { min, hasRange } = priceSummary({ variants: active });
  return `${hasRange ? 'от ' : ''}${formatMoney(min)}`;
}

function ProductsList() {
  const { can } = usePermissions();
  const canCreate = can('store.products.create');
  const canEdit = can('store.products.edit');
  const canVariants = can('store.products.variants');
  const canDelete = can('store.products.delete');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState('');

  const products = useAdminProducts(search, page);
  const canSeeCategories = can('store.categories.view');
  const adminCategories = useAdminCategories(canSeeCategories);
  // Без права на категории в админке — публичный список (только активные).
  const publicCategories = useStoreCategories();
  const categoryOptions: CategoryOption[] =
    (canSeeCategories ? adminCategories.data : publicCategories.data) ?? [];

  const { remove, update } = useAdminProductActions();
  const [editingId, setEditingId] = useState<string | null | undefined>(undefined);
  const [snapshot, setSnapshot] = useState<AdminProduct | null>(null);
  const [deleting, setDeleting] = useState<AdminProduct | null>(null);

  const items = products.data?.items ?? [];
  const total = products.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PRODUCTS_PAGE_SIZE));
  const visible = items.filter(
    (p) =>
      (status === 'all' || (status === 'active' ? p.isActive : !p.isActive)) &&
      (typeFilter === '' || p.type === typeFilter),
  );
  // Свежая версия редактируемого товара (после сохранения варианта список
  // перезагружается, а диалог остаётся открытым).
  const editing =
    typeof editingId === 'string' ? (items.find((p) => p.id === editingId) ?? snapshot) : null;

  const toggleActive = (product: AdminProduct) =>
    update.mutate(
      { id: product.id, body: { isActive: !product.isActive } },
      {
        onSuccess: () =>
          toast.success(product.isActive ? 'Товар деактивирован' : 'Товар активирован'),
        onError: (error) => {
          const info = describeStoreAdminError(error);
          toast.error(info.fields.isActive ?? info.message);
        },
      },
    );

  return (
    <>
      <form
        className="flex flex-wrap items-end gap-3"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(searchInput);
        }}
      >
        <Field label="Поиск по названию" className="min-w-56 flex-1">
          <Input
            value={searchInput}
            leading={<Search aria-hidden className="size-4" />}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </Field>
        <Field label="Статус">
          <select
            className={inputClassName}
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
          >
            <option value="all">Все</option>
            <option value="active">Активные</option>
            <option value="inactive">Неактивные</option>
          </select>
        </Field>
        <Field label="Тип">
          <select
            className={inputClassName}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">Все типы</option>
            {Object.entries(PRODUCT_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" variant="secondary">
          Найти
        </Button>
        {canCreate ? (
          <Button
            type="button"
            onClick={() => {
              setSnapshot(null);
              setEditingId(null);
            }}
          >
            <Plus />
            Новый товар
          </Button>
        ) : null}
      </form>
      <p className="text-xs text-muted-foreground">
        Фильтры по статусу и типу применяются к загруженной странице; поиск — по всему каталогу.
      </p>

      {products.isPending ? (
        <SkeletonRows rows={5} />
      ) : products.isError ? (
        <ErrorState error={products.error} onRetry={() => products.refetch()} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<PackageOpen />}
          title={items.length === 0 ? 'Товаров пока нет' : 'Под фильтр ничего не подошло'}
          description={
            items.length === 0 && canCreate
              ? 'Создайте первый товар кнопкой «Новый товар».'
              : undefined
          }
        />
      ) : (
        <ul
          className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
          data-testid="admin-products"
        >
          {visible.map((product) => (
            <li key={product.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium">{product.name}</span>
                  <Badge tone="neutral">{PRODUCT_TYPE_LABEL[product.type] ?? product.type}</Badge>
                  {product.isActive ? (
                    <Badge tone="success">Активен</Badge>
                  ) : (
                    <Badge tone="warning">Неактивен</Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {product.category?.name ?? 'Без категории'} · {priceText(product)} · вариантов:{' '}
                  {product.variants.length}
                  {product.variants.length > 0
                    ? ` (${product.variants.map((v) => durationLabel(v.duration)).join(', ')})`
                    : ''}{' '}
                  · порядок {product.order}
                </span>
              </div>
              <span className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setSnapshot(product);
                    setEditingId(product.id);
                  }}
                >
                  {canEdit ? 'Изменить' : 'Открыть'}
                </Button>
                {canEdit ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={update.isPending && update.variables?.id === product.id}
                    onClick={() => toggleActive(product)}
                  >
                    {product.isActive ? 'Деактивировать' : 'Активировать'}
                  </Button>
                ) : null}
                {canDelete ? (
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(product)}>
                    Удалить
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      {total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PaginationSummary page={page} limit={ADMIN_PRODUCTS_PAGE_SIZE} total={total} />
          {totalPages > 1 ? (
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          ) : null}
        </div>
      ) : null}

      {editingId !== undefined && (editingId === null || editing) ? (
        <ProductDialog
          key={editingId ?? 'new'}
          product={editing}
          categories={categoryOptions}
          permissions={{ canCreate, canEdit, canVariants }}
          open
          onOpenChange={(open) => !open && setEditingId(undefined)}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Удалить товар «${deleting?.name ?? ''}»?`}
        description="Если по товару есть заказы, он будет деактивирован, а не удалён: история покупок сохраняется. Товар из набора удалить нельзя."
        confirmLabel="Удалить"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(deleting!.id, {
            onSuccess: (result) => {
              toast.success(
                result.mode === 'deactivated'
                  ? 'Товар есть в заказах — деактивирован вместо удаления'
                  : 'Товар удалён',
              );
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

export default function AdminStoreProductsPage() {
  return (
    <PermissionGate requirement="store.products.view">
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Товары магазина"
          description="Создание и настройка товаров: тип, варианты и цены, описание, категория, порядок."
          breadcrumbs={[{ label: 'Магазин' }, { label: 'Товары' }]}
        />
        <ProductsList />
      </div>
    </PermissionGate>
  );
}
