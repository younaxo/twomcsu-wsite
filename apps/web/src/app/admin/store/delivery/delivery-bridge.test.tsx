import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api/errors';
import {
  bridgeRetryMayDuplicate,
  bridgeRetryNeedsServerCheck,
  describeDeliveryError,
} from '@/lib/admin/store-delivery';
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

describe('Повтор Bridge: проверка на сервере (R167)', () => {
  const openRetry = async () => {
    mocks.granted.add('store.delivery.view');
    mocks.granted.add('store.delivery.manage');
    const user = userEvent.setup();
    render(<AdminStoreDeliveryTaskPage />, { wrapper: Providers });
    await screen.findByTestId('bridge-job-summary');
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    return user;
  };

  it('bridgeRetryNeedsServerCheck: только bridge в UNKNOWN/CLAIMED', () => {
    expect(
      bridgeRetryNeedsServerCheck({ executor: 'bridge', bridgeJob: { status: 'UNKNOWN' } }),
    ).toBe(true);
    expect(
      bridgeRetryNeedsServerCheck({ executor: 'bridge', bridgeJob: { status: 'CLAIMED' } }),
    ).toBe(true);
    expect(
      bridgeRetryNeedsServerCheck({ executor: 'bridge', bridgeJob: { status: 'FAILED' } }),
    ).toBe(false);
    expect(
      bridgeRetryNeedsServerCheck({ executor: 'manual', bridgeJob: { status: 'UNKNOWN' } }),
    ).toBe(false);
    expect(bridgeRetryNeedsServerCheck({ executor: 'bridge', bridgeJob: null })).toBe(false);
  });

  it('UNKNOWN: предупреждение, кнопка disabled до чекбокса и причины, затем шлёт serverChecked и reason', async () => {
    mocks.post.mockResolvedValue({});
    const user = await openRetry();
    expect(await screen.findByTestId('bridge-server-check-warning')).toHaveTextContent(
      'Перед повтором проверьте на игровом сервере, что выдачи не было — иначе возможна двойная выдача',
    );
    const submit = screen.getByRole('button', { name: 'Повторить выдачу' });
    expect(submit).toBeDisabled();
    const checkbox = screen.getByRole('checkbox', {
      name: 'Я проверил на сервере: выдачи не было',
    });
    const reason = screen.getByRole('textbox', { name: /Причина/ });
    expect(reason).toBeRequired();
    expect(checkbox).toHaveAttribute('aria-describedby');
    await user.click(checkbox);
    expect(submit).toBeDisabled();
    await user.type(reason, '  Проверил журнал сервера  ');
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(mocks.post).toHaveBeenCalledWith('/admin/delivery/tasks/T1/retry', {
      confirmed: true,
      serverChecked: true,
      reason: 'Проверил журнал сервера',
    });
  });

  it('CLAIMED: тоже требует проверку', async () => {
    job = { ...(job as object), status: 'CLAIMED' };
    await openRetry();
    expect(screen.getByRole('button', { name: 'Повторить выдачу' })).toBeDisabled();
    expect(screen.getByTestId('bridge-server-check-warning')).toBeInTheDocument();
  });

  it('другой статус job: поведение как раньше, serverChecked не шлётся', async () => {
    job = { ...(job as object), status: 'FAILED', claimCount: 1 };
    mocks.post.mockResolvedValue({});
    const user = await openRetry();
    expect(screen.queryByTestId('bridge-server-check-warning')).toBeNull();
    const submit = screen.getByRole('button', { name: 'Повторить выдачу' });
    expect(submit).toBeEnabled();
    await user.click(screen.getByRole('checkbox'));
    await user.click(submit);
    expect(mocks.post).toHaveBeenCalledWith('/admin/delivery/tasks/T1/retry', { confirmed: true });
  });

  it('русские сообщения для кодов 400', () => {
    const check = describeDeliveryError(
      new ApiError(400, ['Server check'], { code: 'delivery_retry_server_check_required' }),
    );
    expect(check.message).toMatch(/Проверьте игрока на игровом сервере/);
    const reason = describeDeliveryError(
      new ApiError(400, ['Reason'], { code: 'delivery_retry_reason_required' }),
    );
    expect(reason.message).toMatch(/Укажите причину повтора/);
    expect(reason.reasonError).toBe(reason.message);
  });
});
