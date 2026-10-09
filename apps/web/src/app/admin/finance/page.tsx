'use client';

import {
  ORDER_STATUSES,
  type AdminOrderDto,
  type FinanceOverview,
  type OrderStatus,
} from '@twomc/shared';
import { Download, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  DescriptionItem,
  DescriptionList,
  PageHeader,
  PageSection,
  StatCard,
  StatGrid,
} from '@/components/admin/page-header';
import { Can, PermissionGate } from '@/components/admin/permission-gate';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { Input } from '@/components/ui/input';
import { QuickView } from '@/components/ui/quick-view';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { downloadExport } from '@/lib/admin/api';
import { useFinanceOverview, useFinanceRefunds, useFinanceTransactions } from '@/lib/admin/hooks';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { TimeSeriesChart } from '@/components/charts/time-series-chart';

const STATUS_META: Record<
  OrderStatus,
  { label: string; tone: 'neutral' | 'success' | 'warning' | 'destructive' | 'info' }
> = {
  PENDING: { label: 'Ожидает оплаты', tone: 'warning' },
  COMPLETED: { label: 'Оплачен', tone: 'success' },
  FAILED: { label: 'Ошибка', tone: 'destructive' },
  CANCELLED: { label: 'Отменён', tone: 'neutral' },
  REFUNDED: { label: 'Возврат', tone: 'info' },
};

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/* ---------------- Обзор ---------------- */

const TOP_PRODUCT_COLUMNS: DataGridColumn<FinanceOverview['topProducts'][number]>[] = [
  { key: 'name', header: 'Товар', truncate: true, cell: (p) => p.name },
  { key: 'quantity', header: 'Шт.', align: 'right', cell: (p) => formatNumber(p.quantity) },
  { key: 'revenue', header: 'Выручка', align: 'right', cell: (p) => formatMoney(p.revenue) },
];

function OverviewTab() {
  const query = useFinanceOverview();
  return (
    <QueryBoundary
      query={query}
      skeleton={
        <StatGrid>
          {Array.from({ length: 4 }, (_, i) => (
            <StatCard key={i} label={<Skeleton className="h-4 w-24" />} value={null} loading />
          ))}
        </StatGrid>
      }
    >
      {(data) => {
        return (
          <div className="flex flex-col gap-6">
            <StatGrid>
              <StatCard
                label="Выручка"
                value={formatMoney(data.overview.totalRevenue)}
                format={false}
                tone="primary"
              />
              <StatCard
                label="Заказов"
                value={data.overview.totalOrders}
                note={`${formatNumber(data.overview.completedOrders)} оплачено`}
              />
              <StatCard label="Активных товаров" value={data.overview.activeProducts} />
              <StatCard
                label="Конверсия в оплату"
                value={
                  data.overview.totalOrders > 0
                    ? `${Math.round((data.overview.completedOrders / data.overview.totalOrders) * 100)} %`
                    : '—'
                }
                format={false}
              />
            </StatGrid>
            <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
              <PageSection title="Продажи по дням" description="Последние 30 дней">
                <div className="rounded-xl bg-surface p-5 shadow-sm">
                  <TimeSeriesChart
                    ariaLabel="Выручка по дням за 30 дней"
                    data={fillSalesDays(data.salesByDay)}
                    series={[{ key: 'revenue', label: 'Выручка', color: 'rgb(var(--primary))' }]}
                    format={(value) => formatMoney(value)}
                  />
                </div>
              </PageSection>
              <PageSection title="Топ товаров">
                <DataGrid
                  columns={TOP_PRODUCT_COLUMNS}
                  rows={data.topProducts}
                  getRowId={(p) => p.name}
                  emptyTitle="Пока пусто"
                  caption="Топ товаров: название, продано штук, выручка"
                />
              </PageSection>
            </div>
          </div>
        );
      }}
    </QueryBoundary>
  );
}

/* ---------------- Заказы ---------------- */

const ORDER_ITEM_COLUMNS: DataGridColumn<AdminOrderDto['items'][number]>[] = [
  {
    key: 'item',
    header: 'Позиция',
    cell: (item) => (
      <>
        {item.product?.name ?? item.bundle?.name ?? '—'}
        {item.giftToUser ? (
          <span className="text-xs text-muted-foreground">
            {' '}
            · подарок {item.giftToUser.username}
          </span>
        ) : null}
      </>
    ),
  },
  { key: 'quantity', header: 'Кол-во', align: 'right', cell: (item) => item.quantity },
  { key: 'total', header: 'Сумма', align: 'right', cell: (item) => formatMoney(item.totalPrice) },
];

function OrdersTab({ kind }: { kind: 'transactions' | 'refunds' }) {
  const { can } = usePermissions();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [status, setStatus] = useState<'all' | OrderStatus>('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [selected, setSelected] = useState<AdminOrderDto | null>(null);
  const [exporting, setExporting] = useState(false);
  useEffect(() => setPage(1), [q, status]);

  const params = useMemo(
    () => ({ page, limit, search: q || undefined, status: status === 'all' ? undefined : status }),
    [page, limit, q, status],
  );
  const transactions = useFinanceTransactions(params, kind === 'transactions');
  const refunds = useFinanceRefunds(params, kind === 'refunds');
  const query = kind === 'transactions' ? transactions : refunds;

  const columns: DataGridColumn<AdminOrderDto>[] = [
    {
      key: 'number',
      header: '№',
      cell: (o) => <span className="font-mono text-xs">{o.orderNumber}</span>,
    },
    {
      key: 'user',
      header: 'Покупатель',
      cell: (o) => o.user?.username ?? o.guestMinecraftNick ?? '—',
    },
    {
      key: 'status',
      header: 'Статус',
      cell: (o) => <Badge tone={STATUS_META[o.status].tone}>{STATUS_META[o.status].label}</Badge>,
    },
    { key: 'total', header: 'Сумма', align: 'right', cell: (o) => formatMoney(o.total) },
    {
      key: 'method',
      header: 'Оплата',
      hideOnMobile: true,
      cell: (o) => o.paymentProvider ?? o.paymentMethod ?? '—',
    },
    {
      key: 'created',
      header: 'Создан',
      hideOnMobile: true,
      cell: (o) => formatDateTime(o.createdAt),
    },
  ];

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadExport('finance', { status: status === 'all' ? undefined : status });
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <DataGrid
        columns={columns}
        rows={query.data?.items ?? []}
        getRowId={(o) => o.id}
        loading={query.isPending}
        error={query.isError ? query.error : undefined}
        onRetry={() => query.refetch()}
        onRowClick={setSelected}
        toolbar={
          <>
            <div className="w-full sm:w-72">
              <Input
                leading={<Search />}
                placeholder="Номер заказа или ник"
                aria-label="Поиск заказов"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {kind === 'transactions' ? (
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger aria-label="Статус" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  {ORDER_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {can('finance.export') ? (
              <Button
                variant="secondary"
                className="ml-auto"
                loading={exporting}
                onClick={exportCsv}
              >
                <Download />
                CSV
              </Button>
            ) : null}
          </>
        }
        pagination={{
          page,
          limit,
          total: query.data?.total ?? 0,
          onPageChange: setPage,
          onLimitChange: (n) => {
            setLimit(n);
            setPage(1);
          },
        }}
        emptyTitle={kind === 'transactions' ? 'Заказов нет' : 'Возвратов нет'}
        caption="Заказы: номер, покупатель, статус, сумма, способ оплаты, дата"
      />
      <QuickView
        open={selected !== null}
        onOpenChange={(open) => (open ? null : setSelected(null))}
        title={selected ? `Заказ ${selected.orderNumber}` : ''}
        subtitle={selected ? formatDateTime(selected.createdAt) : undefined}
        meta={
          selected ? (
            <Badge tone={STATUS_META[selected.status].tone}>
              {STATUS_META[selected.status].label}
            </Badge>
          ) : null
        }
      >
        {selected ? (
          <div className="flex flex-col gap-4">
            <DescriptionList>
              <DescriptionItem term="Покупатель">
                {selected.user
                  ? `${selected.user.username} · ${selected.user.email}`
                  : (selected.guestMinecraftNick ?? '—')}
              </DescriptionItem>
              <DescriptionItem term="Сумма">
                {formatMoney(selected.total)}
                {Number(selected.discountAmount) > 0
                  ? ` (скидка ${formatMoney(selected.discountAmount)})`
                  : ''}
              </DescriptionItem>
              <DescriptionItem term="Оплата">
                {selected.paymentProvider ?? selected.paymentMethod ?? '—'}
                {selected.paidAt ? ` · ${formatDateTime(selected.paidAt)}` : ''}
              </DescriptionItem>
              <DescriptionItem term="ID платежа" mono>
                {selected.paymentId ?? '—'}
              </DescriptionItem>
              {selected.cancelReason ? (
                <DescriptionItem term="Причина отмены" className="sm:col-span-2">
                  {selected.cancelReason}
                </DescriptionItem>
              ) : null}
            </DescriptionList>
            <DataGrid
              columns={ORDER_ITEM_COLUMNS}
              rows={selected.items}
              getRowId={(item) => item.id}
              emptyTitle="Позиций нет"
              caption="Позиции заказа: товар или набор, количество, сумма"
            />
          </div>
        ) : null}
      </QuickView>
    </>
  );
}

/// API отдаёт только дни с продажами (ADR-0078): строим полное окно 30 дней
/// (UTC), дни без продаж — 0 (это отсутствие продаж, а не выдуманные данные).
function fillSalesDays(
  rows: Array<{ day: string; revenue: number | string; count: number | string }>,
  span = 30,
) {
  const byDay = new Map(rows.map((row) => [String(row.day).slice(0, 10), row]));
  const now = new Date();
  return Array.from({ length: span }, (_, index) => {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (span - 1 - index)),
    );
    const day = date.toISOString().slice(0, 10);
    return { day, revenue: Number(byDay.get(day)?.revenue ?? 0) };
  });
}

export default function FinancePage() {
  const { can } = usePermissions();
  const tabs = [
    can('finance.overview.view') && { value: 'overview', label: 'Обзор' },
    can('finance.transactions.view') && { value: 'transactions', label: 'Транзакции' },
    can('finance.refunds.view') && { value: 'refunds', label: 'Возвраты' },
  ].filter((t): t is { value: string; label: string } => Boolean(t));

  return (
    <PermissionGate
      requirement={['finance.overview.view', 'finance.transactions.view', 'finance.refunds.view']}
    >
      <PageHeader
        title="Финансы"
        breadcrumbs={[{ label: 'Финансы' }]}
        description="Выручка магазина, заказы и возвраты."
      />
      <Can requirement="finance.overview.view">{null}</Can>
      <Tabs defaultValue={tabs[0]?.value} variant="line">
        <TabsList aria-label="Разделы финансов">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="transactions">
          <OrdersTab kind="transactions" />
        </TabsContent>
        <TabsContent value="refunds">
          <OrdersTab kind="refunds" />
        </TabsContent>
      </Tabs>
    </PermissionGate>
  );
}
