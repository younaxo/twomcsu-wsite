'use client';

import { ORDER_STATUSES, type AdminOrderDto, type OrderStatus } from '@twomc/shared';
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
import { Card } from '@/components/ui/card';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { downloadExport } from '@/lib/admin/api';
import { useFinanceOverview, useFinanceRefunds, useFinanceTransactions } from '@/lib/admin/hooks';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/lib/format';

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
        const days = data.salesByDay.slice(-30);
        const max = Math.max(1, ...days.map((d) => Number(d.revenue)));
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
                <Card>
                  {days.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Продаж пока нет.</p>
                  ) : (
                    <ul className="flex h-40 items-end gap-1" aria-label="Выручка по дням">
                      {days.map((d) => (
                        <li
                          key={d.day}
                          className="group relative flex min-w-0 flex-1 items-end"
                          style={{ height: '100%' }}
                        >
                          <span
                            className="w-full rounded-sm bg-primary/70 transition-colors group-hover:bg-primary"
                            style={{ height: `${Math.max(2, (Number(d.revenue) / max) * 100)}%` }}
                            role="img"
                            aria-label={`${formatDate(d.day)}: ${formatMoney(d.revenue)}, ${formatNumber(d.count)} заказов`}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </PageSection>
              <PageSection title="Топ товаров">
                <Card flush>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Товар</TableHead>
                        <TableHead numeric>Шт.</TableHead>
                        <TableHead numeric>Выручка</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.topProducts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-muted-foreground">
                            Пока пусто
                          </TableCell>
                        </TableRow>
                      ) : (
                        data.topProducts.map((p) => (
                          <TableRow key={p.name}>
                            <TableCell>{p.name}</TableCell>
                            <TableCell numeric>{formatNumber(p.quantity)}</TableCell>
                            <TableCell numeric>{formatMoney(p.revenue)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </Card>
              </PageSection>
            </div>
          </div>
        );
      }}
    </QueryBoundary>
  );
}

/* ---------------- Заказы ---------------- */

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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Позиция</TableHead>
                  <TableHead numeric>Кол-во</TableHead>
                  <TableHead numeric>Сумма</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selected.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      {item.product?.name ?? item.bundle?.name ?? '—'}
                      {item.giftToUser ? (
                        <span className="text-xs text-muted-foreground">
                          {' '}
                          · подарок {item.giftToUser.username}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell numeric>{item.quantity}</TableCell>
                    <TableCell numeric>{formatMoney(item.totalPrice)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </QuickView>
    </>
  );
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
