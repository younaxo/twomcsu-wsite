import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { bridgeRetryMayDuplicate } from '@/lib/admin/store-delivery';
import AdminStoreDeliveryTaskPage from './[id]/page';
import AdminStoreDeliveryPage from './page';

/// 0.13, срез 2: задания Bridge в админке выдачи (UNKNOWN/NEEDS_ATTENTION,
/// предупреждение о двойной выдаче перед повтором, M2).

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  granted: new Set<string>(),
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post },
}));
vi.mock('@/lib/auth/use-permissions', () => ({
  usePermissions: () => ({
    can: (key: string | string[]) =>
      (Array.isArray(key) ? key : [key]).some((k) => mocks.granted.has(k)),
  }),
}));
vi.mock('@/components/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/store/delivery',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: 'T1' }),
}));

let job: Record<string, unknown> | null;

function row() {
  return {
    id: 'T1',
    orderItemId: 'oi1',
    step: 1,
    executor: 'bridge',
    status: 'NEEDS_ATTENTION',
    attempts: 1,
    nextAttemptAt: null,
    nick: 'Steve',
    lastError: 'bridge_ack_timeout',
    deliveredAt: null,
    createdAt: '2026-11-18T10:00:00.000Z',
    updatedAt: '2026-11-18T10:00:00.000Z',
    bridgeJob: job,
    orderItem: {
      id: 'oi1',
      quantity: 1,
      order: { id: 'o1', orderNumber: 'O-1', status: 'COMPLETED' },
      product: { id: 'p1', name: 'VIP', type: 'PRIVILEGE' },
    },
  };
}

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
  job = {
    status: 'UNKNOWN',
    serverSlug: 'survival',
    ackCode: 'timeout',
    claimCount: 1,
    claimedAt: '2026-11-18T10:00:05.000Z',
    ackedAt: null,
    attempt: 1,
  };
  mocks.granted.clear();
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.get.mockImplementation(async (path: string) =>
    path === '/admin/delivery/tasks'
      ? { items: [row()], total: 1, page: 1, limit: 25 }
      : {
          ...row(),
          leaseUntil: null,
          recipientUserId: null,
          renderedCommand: null,
          templateVersion: null,
        },
  );
});

describe('bridgeRetryMayDuplicate', () => {
  it('риск только у bridge с уже переданным серверу заданием', () => {
    expect(bridgeRetryMayDuplicate({ executor: 'manual', bridgeJob: null })).toBe(false);
    expect(bridgeRetryMayDuplicate({ executor: 'bridge', bridgeJob: null })).toBe(false);
    expect(
      bridgeRetryMayDuplicate({
        executor: 'bridge',
        bridgeJob: { status: 'UNKNOWN', claimCount: 1 },
      }),
    ).toBe(true);
    expect(
      bridgeRetryMayDuplicate({
        executor: 'bridge',
        bridgeJob: { status: 'CANCELLED', claimCount: 0 },
      }),
    ).toBe(false);
  });
});

describe('Админка выдачи: Bridge', () => {
  it('очередь: состояние Bridge в строке и быстрый фильтр «Требуют внимания»', async () => {
    mocks.granted.add('store.delivery.view');
    const user = userEvent.setup();
    render(<AdminStoreDeliveryPage />, { wrapper: Providers });
    expect(await screen.findByText('Bridge: Исход неизвестен')).toBeInTheDocument();
    await user.click(screen.getByTestId('preset-needs-attention'));
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/admin/delivery/tasks',
      expect.objectContaining({ query: expect.objectContaining({ status: 'NEEDS_ATTENTION' }) }),
    );
  });

  it('карточка: сводка Bridge, предупреждение и усиленный текст в диалоге повтора', async () => {
    mocks.granted.add('store.delivery.view');
    mocks.granted.add('store.delivery.manage');
    const user = userEvent.setup();
    render(<AdminStoreDeliveryTaskPage />, { wrapper: Providers });
    const summary = await screen.findByTestId('bridge-job-summary');
    expect(within(summary).getByText('Исход неизвестен')).toBeInTheDocument();
    expect(within(summary).getByText('survival')).toBeInTheDocument();
    expect(screen.getByTestId('bridge-duplicate-warning')).toHaveTextContent(
      'Возможна двойная выдача, если сервер уже выполнил команду',
    );
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByTestId('bridge-retry-warning')).toHaveTextContent(
      'Возможна двойная выдача, если сервер выполнил команду',
    );
    // Без подтверждения POST не уходит.
    await user.click(screen.getByRole('button', { name: 'Повторить выдачу' }));
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('задание не передавалось серверу: усиленного предупреждения нет', async () => {
    job = {
      status: 'CANCELLED',
      serverSlug: 'survival',
      ackCode: 'not_claimed',
      claimCount: 0,
      claimedAt: null,
      ackedAt: null,
      attempt: 1,
    };
    mocks.granted.add('store.delivery.view');
    mocks.granted.add('store.delivery.manage');
    const user = userEvent.setup();
    render(<AdminStoreDeliveryTaskPage />, { wrapper: Providers });
    await screen.findByTestId('bridge-job-summary');
    expect(screen.queryByTestId('bridge-duplicate-warning')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(screen.queryByTestId('bridge-retry-warning')).toBeNull();
  });
});
