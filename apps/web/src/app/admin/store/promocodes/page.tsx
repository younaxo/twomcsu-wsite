'use client';

import { Plus, Search, Ticket } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { describeDiscountAdminError, discountValueText } from '@/lib/admin/store-discounts';
import {
  PROMO_STATUS_META,
  promoStatus,
  useAdminPromoCodes,
  usePromoCodeActions,
  type AdminPromoCode,
} from '@/lib/admin/store-promocodes';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDate } from '@/lib/format';
import { PromoDialog } from './_components/promo-dialog';

/// Промокоды магазина в админке (слой 0, 0.4): список с поиском, создание,
/// правка, отключение, удаление (нельзя, если есть заказы). Права `promocodes.*`.

function validityText(promo: AdminPromoCode): string {
  if (!promo.validFrom && !promo.validUntil) return 'Без срока';
  const from = promo.validFrom ? `с ${formatDate(promo.validFrom)}` : '';
  const until = promo.validUntil ? `по ${formatDate(promo.validUntil)}` : '';
  return [from, until].filter(Boolean).join(' ');
}

function PromoCodesList() {
  const { can } = usePermissions();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const promos = useAdminPromoCodes(search);
  const { remove, update } = usePromoCodeActions();
  const [editing, setEditing] = useState<AdminPromoCode | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<AdminPromoCode | null>(null);
  const canEdit = can('promocodes.edit');

  const columns: DataGridColumn<AdminPromoCode>[] = [
    {
      key: 'code',
      header: 'Код',
      cell: (p) => <span className="font-mono text-xs font-medium">{p.code}</span>,
    },
    {
      key: 'discount',
      header: 'Скидка',
      cell: (p) => discountValueText(p.discountType, p.discountValue),
    },
    {
      key: 'status',
      header: 'Состояние',
      cell: (p) => {
        const meta = PROMO_STATUS_META[promoStatus(p)];
        return <Badge tone={meta.tone}>{meta.label}</Badge>;
      },
    },
    {
      key: 'uses',
      header: 'Использован',
      align: 'right',
      cell: (p) => (p.maxUses === null ? `${p.usedCount}` : `${p.usedCount} из ${p.maxUses}`),
    },
    { key: 'validity', header: 'Срок', hideOnMobile: true, cell: validityText },
    {
      key: 'actions',
      header: <span className="sr-only">Действия</span>,
      align: 'right',
      cell: (p) => (
        <span className="flex flex-wrap justify-end gap-1">
          {canEdit ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>
                Изменить
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={update.isPending && update.variables?.id === p.id}
                onClick={() =>
                  update.mutate(
                    { id: p.id, body: { isActive: !p.isActive } },
                    {
                      onSuccess: () =>
                        toast.success(p.isActive ? 'Промокод отключён' : 'Промокод включён'),
                      onError: (error) => toast.error(describeDiscountAdminError(error).message),
                    },
                  )
                }
              >
                {p.isActive ? 'Отключить' : 'Включить'}
              </Button>
            </>
          ) : null}
          {can('promocodes.delete') ? (
            <Button size="sm" variant="ghost" onClick={() => setDeleting(p)}>
              Удалить
            </Button>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <form
          role="search"
          aria-label="Поиск промокодов"
          className="flex w-full gap-2 sm:w-96"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput);
          }}
        >
          <Input
            leading={<Search />}
            placeholder="Часть кода"
            aria-label="Поиск по коду"
            spellCheck={false}
            maxLength={64}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <Button type="submit" variant="secondary">
            Найти
          </Button>
        </form>
        {can('promocodes.create') ? (
          <Button className="ml-auto" onClick={() => setEditing(null)}>
            <Plus />
            Новый промокод
          </Button>
        ) : null}
      </div>
      <div data-testid="admin-promocodes">
        <DataGrid
          columns={columns}
          rows={promos.data ?? []}
          getRowId={(p) => p.id}
          loading={promos.isPending}
          error={promos.isError ? promos.error : undefined}
          onRetry={() => promos.refetch()}
          empty={<EmptyState icon={<Ticket />} title="Промокодов нет" />}
          caption="Промокоды: код, скидка, состояние, использования, срок действия, действия"
        />
      </div>
      {editing !== undefined ? (
        <PromoDialog
          key={editing?.id ?? 'new'}
          promo={editing}
          open
          onOpenChange={(open) => !open && setEditing(undefined)}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Удалить промокод ${deleting?.code ?? ''}?`}
        description="Если по промокоду уже есть заказы, удалить его нельзя — отключите. Действие необратимо."
        confirmLabel="Удалить"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(deleting!.id, {
            onSuccess: () => {
              toast.success('Промокод удалён');
              setDeleting(null);
            },
            onError: (error) => {
              toast.error(describeDiscountAdminError(error).message);
              setDeleting(null);
            },
          })
        }
      />
    </>
  );
}

export default function AdminStorePromocodesPage() {
  return (
    <PermissionGate requirement="promocodes.view">
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Промокоды"
          description="Коды скидок для покупателей: срок, лимит, типы товаров."
          breadcrumbs={[{ label: 'Магазин' }, { label: 'Промокоды' }]}
        />
        <PromoCodesList />
      </div>
    </PermissionGate>
  );
}
