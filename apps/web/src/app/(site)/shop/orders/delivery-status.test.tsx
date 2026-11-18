import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeliveryStatusBadge } from '@/components/store/delivery-status-badge';
import { useAuthStore } from '@/lib/auth/store';
import { readDeliveryStatus } from '@/lib/store/checkout';
import OrdersPage from './page';
import OrderPage from './[orderNumber]/page';

/// Статус выдачи у покупателя (0.7): ожидает / выдано / ошибка, без внутренних
/// деталей (исполнитель, попытки, ошибки транспорта, id заданий).

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get },
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ orderNumber: 'TW-1' }),
  usePathname: () => '/shop/orders',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/lib/site/status', () => ({
  useModuleAvailability: () => ({ reason: null, bypass: false, maintenance: null }),
}));

function order(deliveryStatus: unknown, itemStatus: unknown = deliveryStatus) {
  return {
    id: 'o1',
    orderNumber: 'TW-1',
    status: 'COMPLETED',
    deliveryStatus,
    subtotal: '200.00',
    discountAmount: '0',
    total: '150.00',
    createdAt: '2026-11-10T12:00:00.000Z',
    items: [
      {
        id: 'oi1',
        quantity: 1,
        unitPrice: '150.00',
        totalPrice: '150.00',
        deliveryStatus: itemStatus,
        product: { name: 'Тестовый товар' },
        // Внутренние поля, которых API покупателю не отдаёт: UI не должен их показывать,
        // даже если они случайно придут.
        lastError: 'ECONNREFUSED rcon:25575',
        deliveryTaskId: 'task-secret-1',
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

beforeEach(() => {
  mocks.get.mockReset();
  useAuthStore.setState({ status: 'authenticated', user: { id: 'u1' } } as never);
});

describe('статус выдачи: бейдж', () => {
  it('три значения: подпись и иконка, неизвестное и null не рендерятся', () => {
    const { rerender, container } = render(<DeliveryStatusBadge status="pending" />);
    expect(screen.getByTestId('delivery-status')).toHaveTextContent('Ожидает выдачи');
    expect(container.querySelector('svg')).not.toBeNull();
    rerender(<DeliveryStatusBadge status="delivered" />);
    expect(screen.getByTestId('delivery-status')).toHaveTextContent('Выдано');
    rerender(<DeliveryStatusBadge status="failed" />);
    expect(screen.getByTestId('delivery-status')).toHaveTextContent('Ошибка выдачи');
    rerender(<DeliveryStatusBadge status="NEEDS_ATTENTION" />);
    expect(screen.queryByTestId('delivery-status')).toBeNull();
    rerender(<DeliveryStatusBadge status={null} />);
    expect(screen.queryByTestId('delivery-status')).toBeNull();
    expect(readDeliveryStatus(undefined)).toBeNull();
  });
});

describe('статус выдачи: страница заказа', () => {
  it.each([
    ['pending', 'Ожидает выдачи'],
    ['delivered', 'Выдано'],
    ['failed', 'Ошибка выдачи'],
  ])('%s: показан в карточке заказа и у позиции', async (value, label) => {
    mocks.get.mockResolvedValue(order(value));
    render(<OrderPage />, { wrapper: Providers });
    const block = await screen.findByTestId('order-delivery');
    expect(block).toHaveTextContent(label);
    const item = screen.getByTestId('order-item');
    expect(within(item).getByTestId('delivery-status')).toHaveTextContent(label);
  });

  it('внутренних деталей нет: ни ошибки транспорта, ни id задания', async () => {
    mocks.get.mockResolvedValue(order('failed'));
    render(<OrderPage />, { wrapper: Providers });
    await screen.findByTestId('order-delivery');
    expect(document.body.textContent).not.toMatch(/ECONNREFUSED|rcon|task-secret|NEEDS_ATTENTION/);
    // Единственный polite-регион страницы остался один.
    expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
  });

  it('нет статуса выдачи (заказ не завершён): блока нет', async () => {
    mocks.get.mockResolvedValue({ ...order(null), status: 'PENDING' });
    render(<OrderPage />, { wrapper: Providers });
    await screen.findByTestId('order-total');
    expect(screen.queryByTestId('order-delivery')).toBeNull();
    expect(screen.queryByTestId('delivery-status')).toBeNull();
  });
});

describe('статус выдачи: «Мои заказы»', () => {
  it('в строке списка рядом со статусом оплаты, без внутренних деталей', async () => {
    mocks.get.mockResolvedValue({
      items: [order('pending'), { ...order('failed'), id: 'o2', orderNumber: 'TW-2' }],
      total: 2,
      page: 1,
      limit: 20,
    });
    render(<OrdersPage />, { wrapper: Providers });
    const rows = await screen.findAllByTestId('order-row');
    expect(rows[0]).toHaveTextContent('Оплачен');
    expect(rows[0]).toHaveTextContent('Ожидает выдачи');
    expect(rows[1]).toHaveTextContent('Ошибка выдачи');
    expect(document.body.textContent).not.toMatch(/ECONNREFUSED|task-secret/);
  });

  it('старый ответ без deliveryStatus: строка без бейджа выдачи', async () => {
    const legacy = order(undefined);
    mocks.get.mockResolvedValue({ items: [legacy], total: 1, page: 1, limit: 20 });
    render(<OrdersPage />, { wrapper: Providers });
    const rows = await screen.findAllByTestId('order-row');
    expect(rows[0]).toHaveTextContent('Оплачен');
    expect(screen.queryByTestId('delivery-status')).toBeNull();
  });
});
