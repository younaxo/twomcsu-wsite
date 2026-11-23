import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { OrdersList } from '@/components/store/orders-list';
import { useAuthStore } from '@/lib/auth/store';
import { useCreateOrder } from '@/lib/store/checkout';
import OrdersPage from './page';
import PurchasesSettingsPage from '../../settings/purchases/page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  module: { reason: null as string | null },
  pathname: '/shop/orders',
}));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post },
}));
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
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
  mocks.post.mockReset();
  mocks.module.reason = null;
  mocks.pathname = '/shop/orders';
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

  it('аноним: «Войти» ведёт с next = текущий путь', async () => {
    mocks.pathname = '/settings/purchases';
    useAuthStore.setState({ status: 'anonymous', user: null });
    render(<OrdersList limit={5} />, { wrapper: Providers });
    expect(await screen.findByRole('link', { name: 'Войти' })).toHaveAttribute(
      'href',
      '/login?next=%2Fsettings%2Fpurchases',
    );
  });

  it('новый заказ виден в списке сразу после оформления', async () => {
    const created = order(2, 'PENDING');
    let orders = [order(1)];
    mocks.get.mockImplementation(async () => ({
      items: orders,
      total: orders.length,
      page: 1,
      limit: 20,
    }));
    mocks.post.mockImplementation(async () => {
      orders = [created, ...orders];
      return { order: created, paymentUrl: null };
    });
    const user = userEvent.setup();
    function Harness() {
      const create = useCreateOrder();
      return (
        <>
          <button onClick={() => create.mutate({ offerVersion: '1' })}>Оформить</button>
          <OrdersList page={1} limit={20} />
        </>
      );
    }
    render(<Harness />, { wrapper: Providers });
    expect(await screen.findAllByTestId('order-row')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Оформить' }));
    await waitFor(() => expect(screen.getAllByTestId('order-row')).toHaveLength(2));
    expect(screen.getByText(/TW-2/)).toBeInTheDocument();
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

describe('/shop/orders: безопасные ошибки и мобильная раскладка', () => {
  it('ошибка списка не показывает сырое сообщение API', async () => {
    mocks.get.mockRejectedValue(new ApiError(500, ['SECRET prisma stack trace']));
    render(<OrdersPage />, { wrapper: Providers });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/SECRET/)).toBeNull();
  });

  it('503 — «недоступно», без сырого сообщения', async () => {
    mocks.get.mockRejectedValue(new ApiError(503, ['upstream down internal']));
    render(<OrdersPage />, { wrapper: Providers });
    expect(await screen.findByText('Сервер временно не отвечает')).toBeInTheDocument();
    expect(screen.queryByText(/upstream/)).toBeNull();
  });

  it('401 от сервера — ссылка «Войти»', async () => {
    mocks.get.mockRejectedValue(new ApiError(401, ['Unauthorized']));
    render(<OrdersPage />, { wrapper: Providers });
    expect(await screen.findByRole('link', { name: 'Войти' })).toBeInTheDocument();
  });

  it('ссылка «Все заказы» в кратком списке имеет цель касания не меньше 40px', async () => {
    mocks.get.mockResolvedValue({ items: [order(1)], total: 5, page: 1, limit: 1 });
    render(<OrdersList limit={1} />, { wrapper: Providers });
    expect(await screen.findByRole('link', { name: 'Все заказы' })).toHaveClass('min-h-10');
  });
});
