import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import {
  ORDER_POLL_INTERVAL_MS,
  ORDER_POLL_MAX_BACKOFF_MS,
  ORDER_POLL_MAX_MS,
  orderPollDelay,
} from '@/lib/store/checkout';
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

  it('разовый 5xx при опросе не заменяет показанный заказ, опрос продолжается', async () => {
    vi.useFakeTimers();
    mocks.get
      .mockResolvedValueOnce(order('PENDING'))
      .mockRejectedValueOnce(new ApiError(500, ['boom']))
      .mockResolvedValue(order('COMPLETED'));
    render(<OrderPage />, { wrapper: Providers });
    await flush(0);
    expect(screen.getByTestId('order-status-live').textContent).toMatch(/Ожидает оплаты/);
    // Мелкими шагами, чтобы поймать короткое окно между сбоем и следующим опросом.
    for (let i = 0; i < 12 && !screen.queryByTestId('order-poll-error'); i += 1) {
      await flush(500);
    }
    expect(screen.getByTestId('order-poll-error')).toBeInTheDocument();
    expect(screen.getByTestId('order-total').textContent).toMatch(/150/);
    expect(screen.getByTestId('order-status-live').textContent).toMatch(/Ожидает оплаты/);
    expect(screen.queryByRole('button', { name: /Повторить/ })).not.toBeInTheDocument();
    for (let i = 0; i < 12 && screen.queryByTestId('order-poll-error'); i += 1) {
      await flush(500);
    }
    expect(screen.getByTestId('order-status-live').textContent).toMatch(/Оплачен/);
    expect(screen.queryByTestId('order-poll-error')).not.toBeInTheDocument();
  });

  it('backoff: при подряд идущих 5xx пауза между опросами растёт', () => {
    expect(orderPollDelay(0)).toBe(ORDER_POLL_INTERVAL_MS);
    expect(orderPollDelay(1)).toBe(ORDER_POLL_INTERVAL_MS * 2);
    expect(orderPollDelay(2)).toBe(ORDER_POLL_INTERVAL_MS * 4);
    expect(orderPollDelay(20)).toBe(ORDER_POLL_MAX_BACKOFF_MS);
  });

  it('5xx в опросе: следующий запрос не раньше удвоенной паузы', async () => {
    vi.useFakeTimers();
    mocks.get
      .mockResolvedValueOnce(order('PENDING'))
      .mockRejectedValueOnce(new ApiError(503, ['x']))
      .mockResolvedValue(order('PENDING'));
    render(<OrderPage />, { wrapper: Providers });
    await flush(0);
    await flush(ORDER_POLL_INTERVAL_MS);
    expect(mocks.get).toHaveBeenCalledTimes(2);
    await flush(ORDER_POLL_INTERVAL_MS);
    expect(mocks.get).toHaveBeenCalledTimes(2);
    await flush(ORDER_POLL_INTERVAL_MS);
    expect(mocks.get).toHaveBeenCalledTimes(3);
  });

  it('потолок опроса: через 10 минут PENDING останавливается, «Обновить» возобновляет', async () => {
    vi.useFakeTimers();
    mocks.get.mockResolvedValue(order('PENDING'));
    render(<OrderPage />, { wrapper: Providers });
    await flush(0);
    expect(screen.queryByTestId('order-poll-expired')).not.toBeInTheDocument();
    await flush(ORDER_POLL_MAX_MS + ORDER_POLL_INTERVAL_MS);
    const notice = screen.getByTestId('order-poll-expired');
    expect(notice).toHaveAttribute('role', 'status');
    const calls = mocks.get.mock.calls.length;
    await flush(ORDER_POLL_INTERVAL_MS * 5);
    expect(mocks.get).toHaveBeenCalledTimes(calls);
    await act(async () => {
      screen.getByRole('button', { name: 'Обновить' }).click();
    });
    await flush(0);
    expect(mocks.get.mock.calls.length).toBeGreaterThan(calls);
    expect(screen.queryByTestId('order-poll-expired')).not.toBeInTheDocument();
    const resumed = mocks.get.mock.calls.length;
    await flush(ORDER_POLL_INTERVAL_MS);
    expect(mocks.get.mock.calls.length).toBeGreaterThan(resumed);
  });

  it('FAILED: не утверждает «деньги не списаны», отсылает в поддержку', async () => {
    mocks.get.mockResolvedValue(order('FAILED'));
    render(<OrderPage />, { wrapper: Providers });
    const live = await screen.findByTestId('order-status-live');
    expect(live.textContent).not.toMatch(/Деньги не списаны/i);
    expect(live.textContent).toMatch(/обратитесь в поддержку/);
  });

  it('ошибка сервера: состояние ошибки с повтором', async () => {
    mocks.get.mockRejectedValue(new ApiError(500, ['boom']));
    render(<OrderPage />, { wrapper: Providers });
    expect(await screen.findByRole('button', { name: /Повторить/ })).toBeInTheDocument();
  });
});
