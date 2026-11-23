import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import GuestOrderPage from './page';

const mocks = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/shop/order/guest',
}));
vi.mock('@/lib/site/status', () => ({
  useModuleAvailability: () => ({ reason: null, bypass: false, maintenance: null }),
}));

const ORDER = {
  orderNumber: 'TW-100',
  status: 'COMPLETED',
  guestMinecraftNick: 'Steve',
  subtotal: '200.00',
  discountAmount: '0',
  total: '200.00',
  createdAt: '2026-11-23T10:00:00.000Z',
  paidAt: '2026-11-23T10:01:00.000Z',
  deliveryStatus: 'delivered',
  items: [
    {
      name: 'Тестовый товар',
      quantity: 2,
      unitPrice: '100.00',
      totalPrice: '200.00',
      deliveryStatus: 'delivered',
    },
  ],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GuestOrderPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.post.mockReset();
  mocks.get.mockReset();
});
afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('страница гостевого заказа', () => {
  it('берёт токен из фрагмента, шлёт POST с токеном в теле и убирает его из адреса', async () => {
    window.history.replaceState(null, '', '/shop/order/guest#t=tok_ABCDEFGHIJKLMNOPQRSTUV');
    mocks.post.mockResolvedValue(ORDER);
    renderPage();
    expect(await screen.findByTestId('guest-order')).toHaveTextContent('TW-100');
    expect(mocks.post).toHaveBeenCalledTimes(1);
    const [path, body, options] = mocks.post.mock.calls[0];
    expect(path).toBe('/store/orders/guest/lookup');
    expect(path).not.toContain('tok_');
    expect(body).toEqual({ token: 'tok_ABCDEFGHIJKLMNOPQRSTUV' });
    expect(options).toMatchObject({ auth: false });
    expect(window.location.hash).toBe('');
    expect(screen.getByTestId('guest-order-item')).toHaveTextContent('Тестовый товар');
    expect(screen.getAllByText('Выдано', { exact: false }).length).toBeGreaterThan(0);
  });

  it('принимает токен, вставленный вручную', async () => {
    mocks.post.mockResolvedValue(ORDER);
    renderPage();
    await userEvent.type(
      screen.getByTestId('guest-order-input'),
      'https://twomc.su/shop/order/guest#t=manual_TOKEN_1234567890123',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Открыть заказ' }));
    await screen.findByTestId('guest-order');
    expect(mocks.post.mock.calls[0][1]).toEqual({ token: 'manual_TOKEN_1234567890123' });
  });

  it('любой 4xx даёт единое «Заказ не найден»', async () => {
    for (const status of [404, 400]) {
      mocks.post.mockReset();
      mocks.post.mockRejectedValue(new ApiError(status, ['Заказ не найден']));
      window.history.replaceState(null, '', '/shop/order/guest#t=whatever_token_value_123');
      const { unmount } = renderPage();
      expect(await screen.findByText('Заказ не найден')).toBeInTheDocument();
      unmount();
    }
  });

  it('429 показывает текст про лимит', async () => {
    mocks.post.mockRejectedValue(new ApiError(429, ['too many']));
    window.history.replaceState(null, '', '/shop/order/guest#t=whatever_token_value_123');
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('guest-order-error')).toHaveTextContent(
        'Слишком много попыток, попробуйте через минуту',
      ),
    );
  });
});
