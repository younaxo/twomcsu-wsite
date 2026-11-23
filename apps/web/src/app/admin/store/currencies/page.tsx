'use client';

import { Coins, Plus } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from '@/components/ui/toast';
import {
  describeCurrencyError,
  useAdminCurrencies,
  useCurrencyActions,
  type AdminCurrencyRate,
} from '@/lib/admin/store-currencies';
import { usePermissions } from '@/lib/auth/use-permissions';
import { CurrencyDialog } from './_components/currency-dialog';

/// Валюты отображения магазина (слой 1.3): курсы для калькулятора обмена на
/// витрине. Просмотр — `store.currencies.view`, добавление и правка —
/// `store.currencies.create|edit`. Оплата заказов всегда в рублях; баланса
/// валюты у пользователя нет. Удаления в API нет: валюту отключают.
function CurrenciesTable() {
  const { can } = usePermissions();
  const list = useAdminCurrencies();
  const { update } = useCurrencyActions();
  const [editing, setEditing] = useState<AdminCurrencyRate | null | undefined>(undefined);

  const columns: DataGridColumn<AdminCurrencyRate>[] = [
    { key: 'flag', header: 'Флаг', cell: (r) => <span aria-hidden="true">{r.flag}</span> },
    { key: 'currency', header: 'Код', cell: (r) => r.currency },
    { key: 'symbol', header: 'Символ', cell: (r) => r.symbol },
    { key: 'rate', header: 'Курс', align: 'right', cell: (r) => r.rate },
    {
      key: 'state',
      header: 'Состояние',
      cell: (r) => (
        <Badge tone={r.isActive ? 'success' : 'neutral'}>
          {r.isActive ? 'Активна' : 'Отключена'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Действия</span>,
      align: 'right',
      cell: (r) =>
        can('store.currencies.edit') ? (
          <span className="flex flex-wrap justify-end gap-1">
            <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>
              Изменить
            </Button>
            <Button
              size="sm"
              variant="ghost"
              loading={update.isPending && update.variables?.currency === r.currency}
              onClick={() =>
                update.mutate(
                  { currency: r.currency, body: { isActive: !r.isActive } },
                  {
                    onSuccess: () =>
                      toast.success(r.isActive ? 'Валюта отключена' : 'Валюта включена'),
                    onError: (error) => toast.error(describeCurrencyError(error).message),
                  },
                )
              }
            >
              {r.isActive ? 'Отключить' : 'Включить'}
            </Button>
          </span>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground" data-testid="currencies-note">
        Только для отображения: курсы используются калькулятором обмена на витрине. Оплата заказов
        всегда в рублях, баланса валюты у игрока нет.
      </p>
      {can('store.currencies.create') ? (
        <div className="flex justify-end">
          <Button onClick={() => setEditing(null)}>
            <Plus />
            Новая валюта
          </Button>
        </div>
      ) : null}
      <div data-testid="admin-currencies">
        <DataGrid
          columns={columns}
          rows={list.data ?? []}
          getRowId={(r) => r.id}
          loading={list.isPending}
          error={list.isError ? list.error : undefined}
          onRetry={() => list.refetch()}
          empty={<EmptyState icon={<Coins />} title="Курсов валют нет" />}
          caption="Курсы валют: флаг, код, символ, курс, состояние, действия"
        />
      </div>
      {editing !== undefined ? (
        <CurrencyDialog
          key={editing?.id ?? 'new'}
          rate={editing}
          open
          onOpenChange={(open) => !open && setEditing(undefined)}
        />
      ) : null}
    </div>
  );
}

export default function AdminStoreCurrenciesPage() {
  return (
    <PermissionGate requirement="store.currencies.view">
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Валюты"
          description="Курсы валют отображения для калькулятора обмена."
          breadcrumbs={[{ label: 'Магазин' }, { label: 'Валюты' }]}
        />
        <CurrenciesTable />
      </div>
    </PermissionGate>
  );
}
