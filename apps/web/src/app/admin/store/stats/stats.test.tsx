import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { EffectivePermissions } from '@twomc/shared';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { fillSalesDays } from '@/lib/admin/store-stats';
import { ADMIN_NAV, findNavItem, resolveNavItem } from '@/lib/admin/navigation';
import { checkPermissions } from '@/lib/auth/permissions';
import AdminStoreStatsPage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  granted: new Set<string>(),
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get },
}));
vi.mock('@/lib/auth/use-permissions', () => ({
  usePermissions: () => ({
    can: (requirement: string | string[]) =>
      (Array.isArray(requirement) ? requirement : [requirement]).some((key) =>
        mocks.granted.has(key),
      ),
  }),
}));
vi.mock('@/components/charts/time-series-chart', () => ({
  TimeSeriesChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div data-testid="chart">{ariaLabel}</div>
  ),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/store/stats',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const RESPONSES: Record<string, unknown> = {
  '/admin/store/stats/overview': {
    totalOrders: 10,
    completedOrders: 5,
    totalRevenue: '12500.00',
    activeProducts: 7,
  },
  '/admin/store/stats/sales-by-day': [
    { day: '2026-11-20T00:00:00.000Z', revenue: '100', count: 1 },
  ],
  '/admin/store/stats/sales-by-category': [
    { category: 'Привилегии', revenue: '900' },
    { category: 'Без категории', revenue: '100' },
  ],
  '/admin/store/stats/top-products': [{ name: 'VIP', quantity: 3, revenue: '900' }],
  '/admin/store/stats/revenue-by-week': [{ week: '2026-11-16T00:00:00.000Z', revenue: '1000' }],
  '/admin/orders/stats': {
    total: 10,
    byStatus: { COMPLETED: 5, PENDING: 3 },
    totalRevenue: '12500',
  },
};

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mocks.granted.clear();
  mocks.get.mockReset();
  mocks.get.mockImplementation((path: string) => Promise.resolve(RESPONSES[path]));
});

describe('Статистика магазина в админке', () => {
  it('без прав — 403 без запросов', () => {
    render(<AdminStoreStatsPage />, { wrapper: Providers });
    expect(screen.queryByTestId('stats-overview')).toBeNull();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('показывает только блоки с правом и не запрашивает остальные', async () => {
    mocks.granted.add('store.stats.top_products.view');
    mocks.granted.add('store.stats.sales_by_category.view');
    render(<AdminStoreStatsPage />, { wrapper: Providers });
    const top = await screen.findByTestId('stats-top-products');
    expect(await within(top).findByText('VIP')).toBeInTheDocument();
    const bars = await screen.findByLabelText('Выручка по категориям');
    expect(within(bars).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByTestId('stats-overview')).toBeNull();
    expect(screen.queryByTestId('stats-orders')).toBeNull();
    expect(screen.queryByTestId('chart')).toBeNull();
    const paths = mocks.get.mock.calls.map((call) => call[0]).sort();
    expect(paths).toEqual([
      '/admin/store/stats/sales-by-category',
      '/admin/store/stats/top-products',
    ]);
  });

  it('все права: сводка с деньгами, график, недели и статусы заказов', async () => {
    for (const key of [
      'store.stats.overview.view',
      'store.stats.sales_by_day.view',
      'store.stats.sales_by_category.view',
      'store.stats.top_products.view',
      'store.stats.revenue_by_week.view',
      'orders.stats',
    ]) {
      mocks.granted.add(key);
    }
    render(<AdminStoreStatsPage />, { wrapper: Providers });
    const overview = await screen.findByTestId('stats-overview');
    expect(await within(overview).findByText('50 %')).toBeInTheDocument();
    expect(overview).toHaveTextContent('5 оплачено');
    expect(await screen.findByTestId('chart')).toBeInTheDocument();
    expect(await screen.findByLabelText('Выручка по неделям')).toBeInTheDocument();
    const orders = await screen.findByTestId('stats-orders');
    expect(await within(orders).findByText(/Оплачен: 5/)).toBeInTheDocument();
    expect(orders).toHaveTextContent('Ожидает оплаты: 3');
    expect(orders).toHaveTextContent('Отменён: 0');
  });

  it('ошибка блока — безопасное сообщение без сырого текста', async () => {
    mocks.granted.add('store.stats.top_products.view');
    mocks.get.mockRejectedValue(new Error('relation "orders" does not exist'));
    render(<AdminStoreStatsPage />, { wrapper: Providers });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/relation "orders"/)).toBeNull();
  });

  it('пустые данные — честное пустое состояние', async () => {
    mocks.granted.add('store.stats.sales_by_category.view');
    mocks.get.mockResolvedValue([]);
    render(<AdminStoreStatsPage />, { wrapper: Providers });
    expect(await screen.findByText('Данных пока нет.')).toBeInTheDocument();
  });

  it('fillSalesDays: окно из 30 дней, пропуски — нули', () => {
    const now = new Date('2026-11-24T12:00:00Z');
    const days = fillSalesDays(
      [{ day: '2026-11-20T00:00:00.000Z', revenue: '100', count: 1 }],
      30,
      now,
    );
    expect(days).toHaveLength(30);
    expect(days.at(-1)).toEqual({ day: '2026-11-24', revenue: 0 });
    expect(days.find((d) => d.day === '2026-11-20')?.revenue).toBe(100);
  });

  it('пункт «Статистика» в «Магазине» виден по любому праву блока', () => {
    const store = ADMIN_NAV.find((g) => g.id === 'store')!.items[0]!;
    expect(findNavItem('/admin/store/stats')?.label).toBe('Товары магазина');
    const sections = (perms: string[]) =>
      resolveNavItem(store, (r) =>
        checkPermissions(
          { superuser: false, permissions: perms, maxPriority: 10 } satisfies EffectivePermissions,
          r,
        ),
      ).sections?.map((s) => s.href) ?? [];
    expect(sections(['orders.stats'])).toEqual(['/admin/store/stats']);
    expect(sections(['store.products.view'])).not.toContain('/admin/store/stats');
  });
});
