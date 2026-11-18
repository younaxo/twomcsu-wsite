import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import OrdersPage from './page';
import PurchasesSettingsPage from '../../settings/purchases/page';

const mocks = vi.hoisted(() => ({ get: vi.fn(), module: { reason: null as string | null } }));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get },
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/shop/orders',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/lib/site/status', () => ({
  useModuleAvailability: () => ({
    reason: mocks.module.reason,
    bypass: false,
    maintenance: null,
  }),
}));

function order(n: number, status = 'COMPLETED') {
  return {
    id: `o${n}`,
    orderNumber: `TW-${n}`,
    status,
    subtotal: '200.00',
    discountAmount: '0',
    total: '150.00',
    createdAt: '2026-11-10T12:00:00.000Z',
    items: [],
  };
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mocks.get.mockReset();
  mocks.module.reason = null;
  useAuthStore.setState({ status: 'authenticated', user: { id: 'u1', username: 'p' } as never });
});

describe('/shop/orders', () => {
  it('список: номер, дата, сумма, статус и ссылка на карточку', async () => {
    mocks.get.mockResolvedValue({
      items: [order(1), order(2, 'PENDING')],
      total: 2,
      page: 1,
      limit: 20,
    });
    render(<OrdersPage />, { wrapper: Providers });
    const rows = await screen.findAllByTestId('order-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('href', '/shop/orders/TW-1');
    expect(rows[0]).toHaveTextContent('TW-1');
    expect(rows[0]).toHaveTextContent('Оплачен');
    expect(rows[1]).toHaveTextContent('Ожидает оплаты');
    expect(mocks.get).toHaveBeenCalledWith('/store/orders?page=1&limit=20');
    // Одна страница — пагинации нет.
    expect(screen.queryByRole('navigation', { name: 'Страницы заказов' })).toBeNull();
  });

  it('пагинация: переход на вторую страницу запрашивает page=2', async () => {
    const user = userEvent.setup();
    mocks.get.mockImplementation(async (path: string) =>
      path.includes('page=2')
        ? { items: [order(21)], total: 21, page: 2, limit: 20 }
        : { items: [order(1)], total: 21, page: 1, limit: 20 },
    );
    render(<OrdersPage />, { wrapper: Providers });
    const nav = await screen.findByRole('navigation', { name: 'Страницы заказов' });
    await user.click(within(nav).getByRole('button', { name: 'Страница 2' }));
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('/store/orders?page=2&limit=20'));
    expect(await screen.findByText(/TW-21/)).toBeInTheDocument();
  });

  it('пустое состояние честное, со ссылкой в магазин', async () => {
    mocks.get.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    render(<OrdersPage />, { wrapper: Providers });
    expect(await screen.findByText('Заказов пока нет')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'В магазин' })).toHaveAttribute('href', '/shop');
  });

  it('ошибка загрузки — состояние ошибки с повтором', async () => {
    mocks.get.mockRejectedValue(new ApiError(500, ['boom']));
    render(<OrdersPage />, { wrapper: Providers });
    expect(await screen.findByRole('button', { name: /Повторить/ })).toBeInTheDocument();
  });

  it('аноним: приглашение войти, запрос не уходит', async () => {
    useAuthStore.setState({ status: 'anonymous', user: null });
    render(<OrdersPage />, { wrapper: Providers });
    expect(await screen.findByText('Войдите, чтобы увидеть заказы')).toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('модуль магазина выключен — страница недоступна, запрос не уходит', () => {
    mocks.module.reason = 'MODULE_DISABLED';
    render(<OrdersPage />, { wrapper: Providers });
    expect(screen.getByTestId('module-unavailable')).toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
  });
});

describe('/settings/purchases', () => {
  it('краткий список (limit=5) со ссылкой «Все заказы»', async () => {
    mocks.get.mockResolvedValue({ items: [order(1)], total: 7, page: 1, limit: 5 });
    render(<PurchasesSettingsPage />, { wrapper: Providers });
    expect(await screen.findByTestId('order-row')).toHaveAttribute('href', '/shop/orders/TW-1');
    expect(mocks.get).toHaveBeenCalledWith('/store/orders?page=1&limit=5');
    expect(screen.getByRole('link', { name: 'Все заказы' })).toHaveAttribute(
      'href',
      '/shop/orders',
    );
  });
});
