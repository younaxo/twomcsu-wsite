'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FormField } from '@/components/admin/form-field';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { Badge } from '@/components/ui/badge';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { inputClassName } from '@/components/ui/input';
import {
  ADMIN_REFUNDS_PAGE_SIZE,
  REFUND_KIND_LABEL,
  REFUND_STATUSES,
  REFUND_STATUS_META,
  buildRefundQuery,
  isRefundsDisabled,
  useAdminRefunds,
  type AdminRefund,
  type RefundStatus,
} from '@/lib/admin/store-refunds';
import { formatDateTime, formatMoney } from '@/lib/format';

/// Список возвратов магазина (0.9, ADR-0188): фильтр по статусу, пагинация,
/// ссылка на заказ. Право `orders.refund`. Флаг выключен (503) — понятное
/// сообщение вместо таблицы.

const COLUMNS: DataGridColumn<AdminRefund>[] = [
  {
    key: 'order',
    header: 'Заказ',
    cell: (r) =>
      r.order ? (
        <Link
          href={`/admin/store/orders/${encodeURIComponent(r.order.orderNumber)}`}
          className="font-mono text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          {r.order.orderNumber}
        </Link>
      ) : (
        <Link
          href={`/admin/store/orders/${encodeURIComponent(r.orderId)}`}
          className="font-mono text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          Открыть заказ
        </Link>
      ),
  },
  { key: 'amount', header: 'Сумма', align: 'right', cell: (r) => formatMoney(r.amount) },
  {
    key: 'status',
    header: 'Статус',
    cell: (r) => (
      <Badge tone={REFUND_STATUS_META[r.status].tone}>{REFUND_STATUS_META[r.status].label}</Badge>
    ),
  },
  { key: 'kind', header: 'Вид', hideOnMobile: true, cell: (r) => REFUND_KIND_LABEL[r.kind] },
  {
    key: 'reason',
    header: 'Причина',
    hideOnMobile: true,
    truncate: true,
    cell: (r) => r.reason,
  },
  {
    key: 'created',
    header: 'Создан',
    hideOnMobile: true,
    cell: (r) => formatDateTime(r.createdAt),
  },
];

function RefundsList() {
  const [status, setStatus] = useState<'' | RefundStatus>('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(ADMIN_REFUNDS_PAGE_SIZE);
  const refunds = useAdminRefunds(buildRefundQuery(status, page, limit));

  if (isRefundsDisabled(refunds.error)) {
    return (
      <p
        className="rounded-xl bg-surface p-5 text-sm text-muted-foreground shadow-sm"
        data-testid="refunds-disabled"
      >
        Возвраты выключены. Раздел заработает после включения на сервере.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-surface p-4 shadow-sm">
        <FormField label="Статус возврата" className="max-w-xs">
          <select
            className={inputClassName}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as '' | RefundStatus);
              setPage(1);
            }}
          >
            <option value="">Все статусы</option>
            {REFUND_STATUSES.map((s) => (
              <option key={s} value={s}>
                {REFUND_STATUS_META[s].label}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <DataGrid
        columns={COLUMNS}
        rows={refunds.data?.items ?? []}
        getRowId={(r) => r.id}
        loading={refunds.isPending}
        error={refunds.isError ? refunds.error : undefined}
        onRetry={() => refunds.refetch()}
        pagination={{
          page,
          limit,
          total: refunds.data?.total ?? 0,
          onPageChange: setPage,
          onLimitChange: (n) => {
            setLimit(n);
            setPage(1);
          },
        }}
        emptyTitle="Возвратов нет"
        emptyDescription="Измените фильтр статуса."
        caption="Возвраты: заказ, сумма, статус, вид, причина, дата создания"
      />
    </div>
  );
}

export default function AdminStoreRefundsPage() {
  return (
    <PermissionGate requirement="orders.refund">
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Возвраты"
          description="Возвраты средств по заказам магазина. Новый возврат оформляется в карточке заказа."
          breadcrumbs={[{ label: 'Магазин' }, { label: 'Возвраты' }]}
        />
        <RefundsList />
      </div>
    </PermissionGate>
  );
}
