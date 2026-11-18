'use client';

import { BadgePercent, Plus } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import {
  DISCOUNT_TYPE_LABEL,
  describeDiscountAdminError,
  discountValueText,
  useAdminBulkDiscounts,
  useAdminLoyaltyDiscounts,
  useBulkDiscountActions,
  useLoyaltyDiscountActions,
  type AdminBulkDiscount,
  type AdminLoyaltyDiscount,
} from '@/lib/admin/store-discounts';
import { PRODUCT_TYPE_LABEL } from '@/lib/admin/store-products';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatMoney } from '@/lib/format';
import { BulkDiscountDialog, LoyaltyDiscountDialog } from './_components/discount-dialogs';

/// Скидки магазина в админке (слой 0, 0.4): за объём/сумму и за лояльность.
/// Просмотр — `store.discounts.view`, изменения — `store.discounts.bulk.*` и
/// `store.discounts.loyalty.*`. Расчёт цены корзины не затрагивается.

function ActiveBadge({ active }: { active: boolean }) {
  return <Badge tone={active ? 'success' : 'neutral'}>{active ? 'Активна' : 'Отключена'}</Badge>;
}

function bulkScopeText(d: AdminBulkDiscount): string {
  if (d.productId) return 'Один товар';
  if (d.productType) return `Тип: ${PRODUCT_TYPE_LABEL[d.productType] ?? d.productType}`;
  return 'Все товары';
}

function BulkTab() {
  const { can } = usePermissions();
  const list = useAdminBulkDiscounts();
  const { update, remove } = useBulkDiscountActions();
  const [editing, setEditing] = useState<AdminBulkDiscount | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<AdminBulkDiscount | null>(null);

  const columns: DataGridColumn<AdminBulkDiscount>[] = [
    { key: 'scope', header: 'Область', cell: bulkScopeText },
    {
      key: 'condition',
      header: 'Условие',
      cell: (d) => {
        const parts = [];
        if (d.minQuantity > 0) parts.push(`от ${d.minQuantity} шт.`);
        if (d.minAmount) parts.push(`от ${formatMoney(d.minAmount)}`);
        return parts.length ? parts.join(', ') : 'Без условия';
      },
    },
    {
      key: 'value',
      header: 'Скидка',
      cell: (d) =>
        `${discountValueText(d.discountType, d.discountValue)} (${DISCOUNT_TYPE_LABEL[d.discountType]})`,
    },
    { key: 'active', header: 'Состояние', cell: (d) => <ActiveBadge active={d.isActive} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Действия</span>,
      align: 'right',
      cell: (d) => (
        <span className="flex flex-wrap justify-end gap-1">
          {can('store.discounts.bulk.edit') ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => setEditing(d)}>
                Изменить
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={update.isPending && update.variables?.id === d.id}
                onClick={() =>
                  update.mutate(
                    { id: d.id, body: { isActive: !d.isActive } },
                    {
                      onSuccess: () =>
                        toast.success(d.isActive ? 'Скидка отключена' : 'Скидка включена'),
                      onError: (error) => toast.error(describeDiscountAdminError(error).message),
                    },
                  )
                }
              >
                {d.isActive ? 'Отключить' : 'Включить'}
              </Button>
            </>
          ) : null}
          {can('store.discounts.bulk.delete') ? (
            <Button size="sm" variant="ghost" onClick={() => setDeleting(d)}>
              Удалить
            </Button>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {can('store.discounts.bulk.create') ? (
        <div className="flex justify-end">
          <Button onClick={() => setEditing(null)}>
            <Plus />
            Новая скидка за объём
          </Button>
        </div>
      ) : null}
      <div data-testid="admin-bulk-discounts">
        <DataGrid
          columns={columns}
          rows={list.data ?? []}
          getRowId={(d) => d.id}
          loading={list.isPending}
          error={list.isError ? list.error : undefined}
          onRetry={() => list.refetch()}
          empty={<EmptyState icon={<BadgePercent />} title="Скидок за объём нет" />}
          caption="Скидки за объём: область, условие, размер, состояние, действия"
        />
      </div>
      {editing !== undefined ? (
        <BulkDiscountDialog
          key={editing?.id ?? 'new'}
          discount={editing}
          open
          onOpenChange={(open) => !open && setEditing(undefined)}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Удалить скидку за объём?"
        description="Скидка перестанет применяться к новым заказам. Действие необратимо."
        confirmLabel="Удалить"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(deleting!.id, {
            onSuccess: () => {
              toast.success('Скидка удалена');
              setDeleting(null);
            },
            onError: (error) => {
              toast.error(describeDiscountAdminError(error).message);
              setDeleting(null);
            },
          })
        }
      />
    </div>
  );
}

function LoyaltyTab() {
  const { can } = usePermissions();
  const list = useAdminLoyaltyDiscounts();
  const { update, remove } = useLoyaltyDiscountActions();
  const [editing, setEditing] = useState<AdminLoyaltyDiscount | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<AdminLoyaltyDiscount | null>(null);

  const columns: DataGridColumn<AdminLoyaltyDiscount>[] = [
    {
      key: 'name',
      header: 'Название',
      cell: (d) => (
        <>
          {d.name}
          {d.description ? (
            <span className="block text-xs text-muted-foreground">{d.description}</span>
          ) : null}
        </>
      ),
    },
    {
      key: 'purchases',
      header: 'Покупок',
      align: 'right',
      cell: (d) => `от ${d.minPurchases}`,
    },
    {
      key: 'percent',
      header: 'Скидка',
      align: 'right',
      cell: (d) => discountValueText('PERCENT', d.discountPercent),
    },
    { key: 'active', header: 'Состояние', cell: (d) => <ActiveBadge active={d.isActive} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Действия</span>,
      align: 'right',
      cell: (d) => (
        <span className="flex flex-wrap justify-end gap-1">
          {can('store.discounts.loyalty.edit') ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => setEditing(d)}>
                Изменить
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={update.isPending && update.variables?.id === d.id}
                onClick={() =>
                  update.mutate(
                    { id: d.id, body: { isActive: !d.isActive } },
                    {
                      onSuccess: () =>
                        toast.success(d.isActive ? 'Скидка отключена' : 'Скидка включена'),
                      onError: (error) => toast.error(describeDiscountAdminError(error).message),
                    },
                  )
                }
              >
                {d.isActive ? 'Отключить' : 'Включить'}
              </Button>
            </>
          ) : null}
          {can('store.discounts.loyalty.delete') ? (
            <Button size="sm" variant="ghost" onClick={() => setDeleting(d)}>
              Удалить
            </Button>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {can('store.discounts.loyalty.create') ? (
        <div className="flex justify-end">
          <Button onClick={() => setEditing(null)}>
            <Plus />
            Новая скидка за лояльность
          </Button>
        </div>
      ) : null}
      <div data-testid="admin-loyalty-discounts">
        <DataGrid
          columns={columns}
          rows={list.data ?? []}
          getRowId={(d) => d.id}
          loading={list.isPending}
          error={list.isError ? list.error : undefined}
          onRetry={() => list.refetch()}
          empty={<EmptyState icon={<BadgePercent />} title="Скидок за лояльность нет" />}
          caption="Скидки за лояльность: название, число покупок, процент, состояние, действия"
        />
      </div>
      {editing !== undefined ? (
        <LoyaltyDiscountDialog
          key={editing?.id ?? 'new'}
          discount={editing}
          open
          onOpenChange={(open) => !open && setEditing(undefined)}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Удалить скидку «${deleting?.name ?? ''}»?`}
        description="Скидка перестанет применяться к новым заказам. Действие необратимо."
        confirmLabel="Удалить"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(deleting!.id, {
            onSuccess: () => {
              toast.success('Скидка удалена');
              setDeleting(null);
            },
            onError: (error) => {
              toast.error(describeDiscountAdminError(error).message);
              setDeleting(null);
            },
          })
        }
      />
    </div>
  );
}

export default function AdminStoreDiscountsPage() {
  return (
    <PermissionGate requirement="store.discounts.view">
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Скидки"
          description="Скидки за объём или сумму заказа и за число прошлых покупок."
          breadcrumbs={[{ label: 'Магазин' }, { label: 'Скидки' }]}
        />
        <Tabs defaultValue="bulk" variant="line">
          <TabsList aria-label="Виды скидок">
            <TabsTrigger value="bulk">За объём</TabsTrigger>
            <TabsTrigger value="loyalty">За лояльность</TabsTrigger>
          </TabsList>
          <TabsContent value="bulk">
            <BulkTab />
          </TabsContent>
          <TabsContent value="loyalty">
            <LoyaltyTab />
          </TabsContent>
        </Tabs>
      </div>
    </PermissionGate>
  );
}
