import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrdersList } from '@/components/store/orders-list';
import { useAuthStore } from '@/lib/auth/store';
import OrderPage from './[orderNumber]/page';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get },
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ orderNumber: 'TW-1' }),
  usePathname: () => '/shop/orders',
}));
vi.mock('@/lib/site/status', () => ({
  useModuleAvailability: () => ({ reason: null, bypass: false, maintenance: null }),
}));

function order(payment?: unknown) {
  return {
    id: 'o1',
    orderNumber: 'TW-1',
    status: 'COMPLETED',
    subtotal: '200.00',
    discountAmount: '0',
    total: '150.00',
    createdAt: '2026-11-10T12:00:00.000Z',
    items: [],
    ...(payment === undefined ? {} : { payment }),
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
  useAuthStore.setState({ status: 'authenticated', user: { id: 'u1' } } as never);
});

describe('способ оплаты в заказе', () => {
  it('карточка заказа: человекочитаемое название', async () => {
    mocks.get.mockResolvedValue(order({ method: 'SBP' }));
    render(<OrderPage />, { wrapper: Providers });
    expect(await screen.findByTestId('order-payment-method')).toHaveTextContent('СБП');
  });

  it('карточка заказа: неизвестный код — запасной текст без сырого кода', async () => {
    mocks.get.mockResolvedValue(order({ method: 'NEW_METHOD_X' }));
    render(<OrderPage />, { wrapper: Providers });
    const row = await screen.findByTestId('order-payment-method');
    expect(row).toHaveTextContent('Другой способ оплаты');
    expect(row).not.toHaveTextContent('NEW_METHOD_X');
  });

  it('старый заказ без способа: строки нет', async () => {
    mocks.get.mockResolvedValue(order());
    render(<OrderPage />, { wrapper: Providers });
    await screen.findByTestId('order-total');
    expect(screen.queryByTestId('order-payment-method')).not.toBeInTheDocument();
  });

  it('«Мои заказы»: способ в строке заказа', async () => {
    mocks.get.mockResolvedValue({
      items: [order({ method: 'CARD_RU' })],
      total: 1,
      page: 1,
      limit: 20,
    });
    render(<OrdersList limit={20} />, { wrapper: Providers });
    expect(await screen.findByTestId('order-row-method')).toHaveTextContent(
      'Банковская карта (РФ)',
    );
  });
});
