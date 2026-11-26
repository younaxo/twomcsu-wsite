'use client';

import { ORDER_STATUSES } from '@twomc/shared';
import { TimeSeriesChart } from '@/components/charts/time-series-chart';
import { PageHeader, PageSection, StatCard, StatGrid } from '@/components/admin/page-header';
import { Can, PermissionGate } from '@/components/admin/permission-gate';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { Badge } from '@/components/ui/badge';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { Skeleton } from '@/components/ui/skeleton';
import { ORDER_STATUS_META } from '@/lib/admin/store-orders';
import {
  fillSalesDays,
  useOrdersStats,
  useStoreRevenueByWeek,
  useStoreSalesByCategory,
  useStoreSalesByDay,
  useStoreStatsOverview,
  useStoreTopProducts,
  type StoreTopProduct,
} from '@/lib/admin/store-stats';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import type { PermissionRequirement } from '@/lib/auth/permissions';

/// Статистика магазина (слой 1): сводка, продажи по дням/категориям/неделям,
/// топ товаров и заказы по статусам. Каждый блок — за своим правом
/// (`store.stats.*.view`, `orders.stats`) и со своим запросом: без права блок
/// не показывается и не запрашивается. Суммы — формат соседних страниц.

const PAGE_REQUIREMENT: PermissionRequirement = [
  'store.stats.overview.view',
  'store.stats.sales_by_day.view',
  'store.stats.sales_by_category.view',
  'store.stats.top_products.view',
  'store.stats.revenue_by_week.view',
  'orders.stats',
];

/// Горизонтальные полосы на CSS: длина — доля от максимума, значение всегда
/// продублировано текстом (цвет и длина не единственный носитель смысла).
function Bars({
  rows,
  label,
}: {
  rows: Array<{ id: string; name: string; value: number }>;
  label: string;
}) {
  const max = Math.max(...rows.map((row) => row.value), 0);
  return (
    <ul className="flex flex-col gap-3" aria-label={label}>
      {rows.map((row) => (
        <li key={row.id} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{row.name}</span>
            <span className="tabular shrink-0 font-medium">{formatMoney(row.value)}</span>
          </div>
          <div aria-hidden className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${max > 0 ? Math.max((row.value / max) * 100, 2) : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

const EMPTY = <p className="py-6 text-center text-sm text-muted-foreground">Данных пока нет.</p>;

function StatsSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface p-5 shadow-sm">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function OverviewBlock() {
  const query = useStoreStatsOverview();
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
      {(data) => (
        <StatGrid data-testid="stats-overview">
          <StatCard
            label="Выручка"
            value={formatMoney(data.totalRevenue)}
            format={false}
            tone="primary"
          />
          <StatCard
            label="Заказов"
            value={data.totalOrders}
            note={`${formatNumber(data.completedOrders)} оплачено`}
          />
          <StatCard label="Активных товаров" value={data.activeProducts} />
          <StatCard
            label="Конверсия в оплату"
            value={
              data.totalOrders > 0
                ? `${Math.round((data.completedOrders / data.totalOrders) * 100)} %`
                : '—'
            }
            format={false}
          />
        </StatGrid>
      )}
    </QueryBoundary>
  );
}

function SalesByDayBlock() {
  const query = useStoreSalesByDay();
  return (
    <PageSection title="Продажи по дням" description="Последние 30 дней">
      <div className="rounded-xl bg-surface p-5 shadow-sm" data-testid="stats-sales-by-day">
        <QueryBoundary query={query} size="sm" skeleton={<StatsSkeleton />}>
          {(rows) => (
            <TimeSeriesChart
              ariaLabel="Выручка по дням за 30 дней"
              data={fillSalesDays(rows)}
              series={[{ key: 'revenue', label: 'Выручка', color: 'rgb(var(--primary))' }]}
              format={(value) => formatMoney(value)}
            />
          )}
        </QueryBoundary>
      </div>
    </PageSection>
  );
}

function SalesByCategoryBlock() {
  const query = useStoreSalesByCategory();
  return (
    <PageSection title="Продажи по категориям" description="Оплаченные заказы, всё время">
      <div className="rounded-xl bg-surface p-5 shadow-sm" data-testid="stats-sales-by-category">
        <QueryBoundary query={query} size="sm" skeleton={<StatsSkeleton />}>
          {(rows) =>
            rows.length === 0 ? (
              EMPTY
            ) : (
              <Bars
                label="Выручка по категориям"
                rows={rows.map((row) => ({
                  id: row.category,
                  name: row.category,
                  value: Number(row.revenue),
                }))}
              />
            )
          }
        </QueryBoundary>
      </div>
    </PageSection>
  );
}

function RevenueByWeekBlock() {
  const query = useStoreRevenueByWeek();
  return (
    <PageSection title="Выручка по неделям" description="Последние 12 недель">
      <div className="rounded-xl bg-surface p-5 shadow-sm" data-testid="stats-revenue-by-week">
        <QueryBoundary query={query} size="sm" skeleton={<StatsSkeleton />}>
          {(rows) =>
            rows.length === 0 ? (
              EMPTY
            ) : (
              <Bars
                label="Выручка по неделям"
                rows={rows.map((row) => ({
                  id: row.week,
                  name: `Неделя с ${formatDate(row.week)}`,
                  value: Number(row.revenue),
                }))}
              />
            )
          }
        </QueryBoundary>
      </div>
    </PageSection>
  );
}

const TOP_COLUMNS: DataGridColumn<StoreTopProduct>[] = [
  { key: 'name', header: 'Товар', truncate: true, cell: (p) => p.name },
  { key: 'quantity', header: 'Шт.', align: 'right', cell: (p) => formatNumber(p.quantity) },
  { key: 'revenue', header: 'Выручка', align: 'right', cell: (p) => formatMoney(p.revenue) },
];

function TopProductsBlock() {
  const query = useStoreTopProducts();
  return (
    <PageSection title="Топ товаров" description="По выручке, до 10 позиций">
      <div data-testid="stats-top-products">
        <DataGrid
          columns={TOP_COLUMNS}
          rows={query.data ?? []}
          getRowId={(p) => p.name}
          loading={query.isPending}
          error={query.isError ? query.error : undefined}
          onRetry={() => query.refetch()}
          emptyTitle="Продаж пока нет"
          caption="Топ товаров: название, продано штук, выручка"
        />
      </div>
    </PageSection>
  );
}

function OrdersByStatusBlock() {
  const query = useOrdersStats();
  return (
    <PageSection title="Заказы по статусам">
      <div className="rounded-xl bg-surface p-5 shadow-sm" data-testid="stats-orders">
        <QueryBoundary query={query} size="sm" skeleton={<StatsSkeleton />}>
          {(data) => (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Всего заказов:{' '}
                <span className="font-medium text-foreground">{formatNumber(data.total)}</span>
                {' · '}
                выручка по оплаченным:{' '}
                <span className="font-medium text-foreground">
                  {formatMoney(data.totalRevenue)}
                </span>
              </p>
              <ul className="flex flex-wrap gap-2" aria-label="Количество заказов по статусам">
                {ORDER_STATUSES.map((status) => (
                  <li key={status}>
                    <Badge tone={ORDER_STATUS_META[status].tone}>
                      {ORDER_STATUS_META[status].label}: {formatNumber(data.byStatus[status] ?? 0)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </QueryBoundary>
      </div>
    </PageSection>
  );
}

export default function AdminStoreStatsPage() {
  return (
    <PermissionGate requirement={PAGE_REQUIREMENT}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Статистика магазина"
          description="Продажи и заказы. Блоки показываются по вашим правам."
          breadcrumbs={[{ label: 'Магазин' }, { label: 'Статистика' }]}
        />
        <Can requirement="store.stats.overview.view">
          <OverviewBlock />
        </Can>
        <div className="grid gap-6 xl:grid-cols-2">
          <Can requirement="store.stats.sales_by_day.view">
            <SalesByDayBlock />
          </Can>
          <Can requirement="store.stats.revenue_by_week.view">
            <RevenueByWeekBlock />
          </Can>
          <Can requirement="store.stats.sales_by_category.view">
            <SalesByCategoryBlock />
          </Can>
          <Can requirement="store.stats.top_products.view">
            <TopProductsBlock />
          </Can>
        </div>
        <Can requirement="orders.stats">
          <OrdersByStatusBlock />
        </Can>
      </div>
    </PermissionGate>
  );
}
