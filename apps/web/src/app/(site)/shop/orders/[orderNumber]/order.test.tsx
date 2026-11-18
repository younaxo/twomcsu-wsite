import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import { ORDER_POLL_INTERVAL_MS } from '@/lib/store/checkout';
import OrderPage from './page';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get },
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ orderNumber: 'TW-1' }),
  usePathname: () => '/shop/orders/TW-1',
}));
vi.mock('@/lib/site/status', () => ({
  useModuleAvailability: () => ({ reason: null, bypass: false, maintenance: null }),
}));

function order(status: string) {
  return {
    id: 'o1',
    orderNumber: 'TW-1',
    status,
    subtotal: '200.00',
    discountAmount: '0',
    total: '150.00',
    items: [
      {
        id: 'oi1',
        quantity: 2,
        unitPrice: '100.00',
        totalPrice: '200.00',
        product: { name: 'Тестовый товар' },
      },
    ],
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

const flush = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  mocks.get.mockReset();
  useAuthStore.setState({ status: 'authenticated', user: { id: 'u1' } } as never);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('заказ /shop/orders/[orderNumber]', () => {
  it('аноним: приглашение войти, запросов нет', () => {
    useAuthStore.setState({ status: 'anonymous', user: null } as never);
    render(<OrderPage />, { wrapper: Providers });
    expect(screen.getByRole('link', { name: 'Войти' })).toHaveAttribute(
      'href',
      '/login?next=%2Fshop%2Forders%2FTW-1',
    );
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('загрузка: скелетон со статусом для скринридера', () => {
    mocks.get.mockReturnValue(new Promise(() => {}));
    render(<OrderPage />, { wrapper: Providers });
    expect(screen.getByTestId('order-skeleton')).toBeInTheDocument();
  });

  it('PENDING -> COMPLETED: опрос меняет статус в aria-live и останавливается', async () => {
    vi.useFakeTimers();
    mocks.get
      .mockResolvedValueOnce(order('PENDING'))
      .mockResolvedValueOnce(order('PENDING'))
      .mockResolvedValue(order('COMPLETED'));
    render(<OrderPage />, { wrapper: Providers });
    await flush(0);
    const live = screen.getByTestId('order-status-live');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live.textContent).toMatch(/Ожидает оплаты/);
    expect(screen.getByTestId('order-total').textContent).toMatch(/150/);
    for (let i = 0; i < 3; i += 1) await flush(ORDER_POLL_INTERVAL_MS);
    expect(screen.getByTestId('order-status-live').textContent).toMatch(/Оплачен/);
    const calls = mocks.get.mock.calls.length;
    expect(calls).toBeGreaterThanOrEqual(3);
    expect(calls).toBeLessThanOrEqual(4);
    await flush(ORDER_POLL_INTERVAL_MS * 4);
    expect(mocks.get).toHaveBeenCalledTimes(calls);
    expect(mocks.get).toHaveBeenCalledWith('/store/orders/TW-1');
  });

  it('FAILED: понятный текст и возврат в корзину, опроса нет', async () => {
    vi.useFakeTimers();
    mocks.get.mockResolvedValue(order('FAILED'));
    render(<OrderPage />, { wrapper: Providers });
    await flush(0);
    expect(screen.getByTestId('order-status-live').textContent).toMatch(/Оплата не прошла/);
    expect(screen.getByRole('link', { name: 'Вернуться в корзину' })).toHaveAttribute(
      'href',
      '/shop/cart',
    );
    await flush(ORDER_POLL_INTERVAL_MS * 3);
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });

  it('размонтирование останавливает опрос', async () => {
    vi.useFakeTimers();
    mocks.get.mockResolvedValue(order('PENDING'));
    const view = render(<OrderPage />, { wrapper: Providers });
    await flush(0);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    view.unmount();
    await flush(ORDER_POLL_INTERVAL_MS * 4);
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });

  it('404: «Заказ не найден», опроса нет', async () => {
    vi.useFakeTimers();
    mocks.get.mockRejectedValue(new ApiError(404, ['Заказ не найден']));
    render(<OrderPage />, { wrapper: Providers });
    await flush(0);
    expect(screen.getByText('Заказ не найден')).toBeInTheDocument();
    await flush(ORDER_POLL_INTERVAL_MS * 3);
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });

  it('403 (чужой заказ) выглядит как «не найден»', async () => {
    mocks.get.mockRejectedValue(new ApiError(403, ['Это не ваш заказ']));
    render(<OrderPage />, { wrapper: Providers });
    expect(await screen.findByText('Заказ не найден')).toBeInTheDocument();
    expect(screen.queryByText(/не ваш/)).not.toBeInTheDocument();
  });

  it('ошибка сервера: состояние ошибки с повтором', async () => {
    mocks.get.mockRejectedValue(new ApiError(500, ['boom']));
    render(<OrderPage />, { wrapper: Providers });
    expect(await screen.findByRole('button', { name: /Повторить/ })).toBeInTheDocument();
  });
});
