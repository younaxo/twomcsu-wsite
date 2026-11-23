'use client';

import { PackagePlus, Package } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from '@/components/ui/toast';
import {
  describeBundleError,
  useAdminBundles,
  useBundleActions,
  type AdminBundle,
} from '@/lib/admin/store-bundles';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDate, formatMoney } from '@/lib/format';
import { BundleDialog } from './_components/bundle-dialog';

/// Наборы магазина (слой 1.3). Права: создание/правка/удаление —
/// `store.bundles.create|edit|delete`; отдельного права просмотра в API нет,
/// страница доступна при любом из трёх. Список — публичный `GET /store/bundles`:
/// выключенные и просроченные наборы в нём не видны (нет админского списка).

const ANY_BUNDLE_PERMISSION = [
  'store.bundles.create',
  'store.bundles.edit',
  'store.bundles.delete',
] as const;

function validityText(bundle: AdminBundle): string {
  if (!bundle.validFrom && !bundle.validUntil) return 'Без срока';
  const from = bundle.validFrom ? `с ${formatDate(bundle.validFrom)}` : '';
  const until = bundle.validUntil ? `по ${formatDate(bundle.validUntil)}` : '';
  return [from, until].filter(Boolean).join(' ');
}

function BundlesTable() {
  const { can } = usePermissions();
  const list = useAdminBundles();
  const { update, remove } = useBundleActions();
  const [editing, setEditing] = useState<AdminBundle | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<AdminBundle | null>(null);

  const columns: DataGridColumn<AdminBundle>[] = [
    {
      key: 'name',
      header: 'Набор',
      cell: (b) => (
        <>
          {b.name}
          <span className="block text-xs text-muted-foreground">{b.slug}</span>
        </>
      ),
    },
    {
      key: 'price',
      header: 'Цена',
      align: 'right',
      cell: (b) => (
        <>
          {formatMoney(b.totalPrice)}
          <span className="block text-xs text-muted-foreground line-through">
            {formatMoney(b.originalPrice)}
          </span>
        </>
      ),
    },
    { key: 'items', header: 'Позиций', align: 'right', cell: (b) => b.items.length },
    { key: 'validity', header: 'Срок', cell: validityText },
    {
      key: 'state',
      header: 'Состояние',
      cell: (b) => (
        <Badge tone={b.isActive ? 'success' : 'neutral'}>
          {b.isActive ? 'Включён' : 'Выключен'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Действия</span>,
      align: 'right',
      cell: (b) => (
        <span className="flex flex-wrap justify-end gap-1">
          {can('store.bundles.edit') ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => setEditing(b)}>
                Изменить
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={update.isPending && update.variables?.id === b.id}
                onClick={() =>
                  update.mutate(
                    { id: b.id, body: { isActive: !b.isActive } },
                    {
                      onSuccess: () =>
                        toast.success(b.isActive ? 'Набор выключен' : 'Набор включён'),
                      onError: (error) => toast.error(describeBundleError(error).message),
                    },
                  )
                }
              >
                {b.isActive ? 'Выключить' : 'Включить'}
              </Button>
            </>
          ) : null}
          {can('store.bundles.delete') ? (
            <Button size="sm" variant="ghost" onClick={() => setDeleting(b)}>
              Удалить
            </Button>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground" data-testid="bundles-list-note">
        В списке только включённые наборы внутри срока действия: у API нет админского списка.
        Выключенный набор пропадает отсюда, вернуть его можно только по известному идентификатору.
      </p>
      {can('store.bundles.create') ? (
        <div className="flex justify-end">
          <Button onClick={() => setEditing(null)}>
            <PackagePlus />
            Новый набор
          </Button>
        </div>
      ) : null}
      <div data-testid="admin-bundles">
        <DataGrid
          columns={columns}
          rows={list.data ?? []}
          getRowId={(b) => b.id}
          loading={list.isPending}
          error={list.isError ? list.error : undefined}
          onRetry={() => list.refetch()}
          empty={<EmptyState icon={<Package />} title="Активных наборов нет" />}
          caption="Наборы: название, цена, число позиций, срок, состояние, действия"
        />
      </div>
      {editing !== undefined ? (
        <BundleDialog
          key={editing?.id ?? 'new'}
          bundle={editing}
          open
          onOpenChange={(open) => !open && setEditing(undefined)}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Удалить набор «${deleting?.name ?? ''}»?`}
        description="Набор исчезнет с витрины, действие необратимо. Если набор уже есть в заказах, удаление может не пройти: тогда выключите его."
        confirmLabel="Удалить"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(deleting!.id, {
            onSuccess: () => {
              toast.success('Набор удалён');
              setDeleting(null);
            },
            onError: (error) => {
              toast.error(describeBundleError(error).message);
              setDeleting(null);
            },
          })
        }
      />
    </div>
  );
}

export default function AdminStoreBundlesPage() {
  return (
    <PermissionGate requirement={ANY_BUNDLE_PERMISSION}>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Наборы"
          description="Наборы товаров по сниженной цене."
          breadcrumbs={[{ label: 'Магазин' }, { label: 'Наборы' }]}
        />
        <BundlesTable />
      </div>
    </PermissionGate>
  );
}
