'use client';

import { ORDER_STATUSES } from '@twomc/shared';
import { Download, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { FormErrorSummary, FormField, useFocusFirstInvalid } from '@/components/admin/form-field';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { DatePicker } from '@/components/ui/date-picker';
import { Input, inputClassName } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { downloadExport } from '@/lib/admin/api';
import {
  ADMIN_ORDERS_PAGE_SIZE,
  EMPTY_ORDER_FILTERS,
  ORDERS_EXPORT_MAX_ROWS,
  ORDER_STATUS_META,
  buildOrderExportBody,
  buildOrderQuery,
  useAdminOrders,
  validateOrderFilters,
  type AdminOrderRow,
  type OrderFilters,
} from '@/lib/admin/store-orders';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDateTime, formatMoney } from '@/lib/format';

/// Заказы магазина в админке (слой 0, 0.4): фильтры, поиск по номеру, пагинация,
/// переход в карточку, экспорт CSV. Права `orders.view`, `orders.export`.
/// Возврата здесь нет (скрыт флагом до 0.9).

function OrdersList() {
  const { can } = usePermissions();
  const router = useRouter();
  const [draft, setDraft] = useState<OrderFilters>(EMPTY_ORDER_FILTERS);
  const [applied, setApplied] = useState<OrderFilters>(EMPTY_ORDER_FILTERS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(ADMIN_ORDERS_PAGE_SIZE);
  const [exporting, setExporting] = useState(false);
  const { containerRef, focusFirstInvalid } = useFocusFirstInvalid<HTMLFormElement>();

  const orders = useAdminOrders(buildOrderQuery(applied, page, limit));
  const set = (patch: Partial<OrderFilters>) => setDraft((current) => ({ ...current, ...patch }));

  const apply = (event: FormEvent) => {
    event.preventDefault();
    const next = validateOrderFilters(draft);
    setErrors(next);
    if (Object.keys(next).length > 0) {
      focusFirstInvalid();
      return;
    }
    setApplied(draft);
    setPage(1);
  };

  const reset = () => {
    setDraft(EMPTY_ORDER_FILTERS);
    setApplied(EMPTY_ORDER_FILTERS);
    setErrors({});
    setPage(1);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadExport('orders', buildOrderExportBody(applied));
      toast.success('Файл выгрузки сформирован');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  const columns: DataGridColumn<AdminOrderRow>[] = [
    {
      key: 'number',
      header: '№',
      cell: (o) => (
        <Link
          href={`/admin/store/orders/${encodeURIComponent(o.orderNumber)}`}
          className="font-mono text-xs font-medium text-primary underline-offset-2 hover:underline max-md:inline-flex max-md:min-h-10 max-md:items-center"
          onClick={(event) => event.stopPropagation()}
        >
          {o.orderNumber}
        </Link>
      ),
    },
    {
      key: 'buyer',
      header: 'Покупатель',
      cell: (o) => o.user?.username ?? o.guestMinecraftNick ?? '—',
    },
    {
      key: 'status',
      header: 'Статус',
      cell: (o) => (
        <Badge tone={ORDER_STATUS_META[o.status].tone}>{ORDER_STATUS_META[o.status].label}</Badge>
      ),
    },
    { key: 'total', header: 'Сумма', align: 'right', cell: (o) => formatMoney(o.total) },
    {
      key: 'items',
      header: 'Позиций',
      align: 'right',
      hideOnMobile: true,
      cell: (o) => o.items.length,
    },
    {
      key: 'created',
      header: 'Создан',
      hideOnMobile: true,
      cell: (o) => formatDateTime(o.createdAt),
    },
  ];

  const errorCount = Object.keys(errors).length;

  return (
    <div className="flex flex-col gap-4">
      <form
        ref={containerRef}
        role="search"
        aria-label="Фильтры заказов"
        onSubmit={apply}
        noValidate
        className="flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-sm"
      >
        {errorCount > 0 ? (
          <FormErrorSummary data-testid="orders-filter-error">
            Исправьте ошибки в фильтрах ({errorCount}). Первое поле с ошибкой выделено.
          </FormErrorSummary>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <FormField label="Номер заказа" error={errors.orderNumber}>
            <Input
              leading={<Search />}
              placeholder="O-20261118-…"
              spellCheck={false}
              maxLength={40}
              value={draft.orderNumber}
              onChange={(e) => set({ orderNumber: e.target.value })}
            />
          </FormField>
          <FormField label="Ник" error={errors.nickname}>
            <Input
              placeholder="Логин или ник гостя"
              spellCheck={false}
              maxLength={32}
              value={draft.nickname}
              onChange={(e) => set({ nickname: e.target.value })}
            />
          </FormField>
          <FormField label="Статус">
            <select
              className={inputClassName}
              value={draft.status}
              onChange={(e) => set({ status: e.target.value as OrderFilters['status'] })}
            >
              <option value="">Все статусы</option>
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ORDER_STATUS_META[s].label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Создан с">
            <DatePicker
              value={draft.dateFrom || null}
              onChange={(value) => set({ dateFrom: value ?? '' })}
              placeholder="Любая дата"
            />
          </FormField>
          <FormField label="Создан по" error={errors.dateTo}>
            <DatePicker
              value={draft.dateTo || null}
              onChange={(value) => set({ dateTo: value ?? '' })}
              invalid={Boolean(errors.dateTo)}
              placeholder="Любая дата"
            />
          </FormField>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit">Применить</Button>
          <Button type="button" variant="ghost" onClick={reset}>
            Сбросить
          </Button>
          {can('orders.export') ? (
            <div className="ml-auto flex flex-col items-end gap-1">
              <Button
                type="button"
                variant="secondary"
                loading={exporting}
                onClick={exportCsv}
                aria-describedby="orders-export-hint"
              >
                <Download />
                Экспорт CSV
              </Button>
              <span id="orders-export-hint" className="text-xs text-subtle-foreground">
                Не более {ORDERS_EXPORT_MAX_ROWS.toLocaleString('ru-RU')} строк; учитываются статус
                и даты, ник и номер — нет.
              </span>
            </div>
          ) : null}
        </div>
      </form>
      <DataGrid
        columns={columns}
        rows={orders.data?.items ?? []}
        getRowId={(o) => o.id}
        loading={orders.isPending}
        error={orders.isError ? orders.error : undefined}
        onRetry={() => orders.refetch()}
        onRowClick={(o) => router.push(`/admin/store/orders/${encodeURIComponent(o.orderNumber)}`)}
        pagination={{
          page,
          limit,
          total: orders.data?.total ?? 0,
          onPageChange: setPage,
          onLimitChange: (n) => {
            setLimit(n);
            setPage(1);
          },
        }}
        emptyTitle="Заказов не найдено"
        emptyDescription="Измените фильтры или сбросьте их."
        caption="Заказы: номер, покупатель, статус, сумма, число позиций, дата создания"
      />
    </div>
  );
}

export default function AdminStoreOrdersPage() {
  return (
    <PermissionGate requirement="orders.view">
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Заказы магазина"
          description="Поиск по номеру и нику, статусы оплаты, отмена зависших заказов."
          breadcrumbs={[{ label: 'Магазин' }, { label: 'Заказы' }]}
        />
        <OrdersList />
      </div>
    </PermissionGate>
  );
}
