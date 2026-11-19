import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api/errors';
import {
  EMPTY_ORDER_FILTERS,
  buildOrderExportBody,
  buildOrderQuery,
  describeCancelError,
  validateCancelReason,
  validateOrderFilters,
} from '@/lib/admin/store-orders';
import AdminStoreOrdersPage from './page';
import AdminStoreOrderCardPage from './[id]/page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  granted: new Set<string>(),
  download: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, patch: mocks.patch },
}));
vi.mock('@/lib/admin/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin/api')>()),
  downloadExport: mocks.download,
}));
vi.mock('@/lib/auth/use-permissions', () => ({
  usePermissions: () => ({
    can: (key: string | string[]) =>
      (Array.isArray(key) ? key : [key]).some((k) => mocks.granted.has(k)),
  }),
}));
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/store/orders',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: 'O-1' }),
}));

let cardDiscount = '50.00';

function order(status: string) {
  return {
    id: 'o1',
    orderNumber: 'O-1',
    userId: 'u1',
    guestMinecraftNick: null,
    status,
    subtotal: '500.00',
    discountAmount: cardDiscount,
    promoCodeId: null,
    total: '450.00',
    paymentMethod: null,
    paymentId: 'pay-1',
    paymentProvider: 'yookassa',
    paymentWebhookVerifiedAt: null,
    paidAt: null,
    cancelledAt: null,
    refundedAt: null,
    cancelReason: null,
    createdAt: '2026-11-18T10:00:00.000Z',
    updatedAt: '2026-11-18T10:00:00.000Z',
    items: [
      {
        id: 'i1',
        orderId: 'o1',
        productId: 'p1',
        variantId: null,
        bundleId: null,
        quantity: 2,
        unitPrice: '250.00',
        totalPrice: '500.00',
        giftToUserId: null,
        giftMessage: null,
        isDelivered: false,
        deliveredAt: null,
        product: { id: 'p1', name: 'VIP', slug: 'vip', type: 'PRIVILEGE' },
        variant: null,
        bundle: null,
        giftToUser: null,
      },
    ],
    user: { id: 'u1', username: 'Steve', email: 's@example.com' },
    promoCode: null,
    payment: {
      provider: 'yookassa',
      paymentId: 'pay-1',
      isPaid: false,
      paidAt: null,
      webhookVerifiedAt: null,
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

let cardStatus = 'PENDING';
beforeEach(() => {
  cardStatus = 'PENDING';
  cardDiscount = '50.00';
  mocks.granted.clear();
  for (const fn of [mocks.get, mocks.patch, mocks.download]) fn.mockReset();
  for (const fn of Object.values(mocks.toast)) fn.mockReset();
  mocks.download.mockResolvedValue(undefined);
  mocks.get.mockImplementation(async (path: string) => {
    if (path === '/admin/orders') {
      return { items: [order('PENDING')], total: 1, page: 1, limit: 25 };
    }
    if (path.startsWith('/admin/orders/')) return order(cardStatus);
    return [];
  });
});

describe('Заказы: чистые функции', () => {
  it('фильтры: пустые значения не уходят в запрос, ник и номер не попадают в экспорт', () => {
    expect(buildOrderQuery(EMPTY_ORDER_FILTERS, 1, 25)).toEqual({ page: 1, limit: 25 });
    const filters = {
      status: 'PENDING' as const,
      nickname: ' Steve ',
      orderNumber: 'O-1',
      dateFrom: '2026-11-01',
      dateTo: '',
    };
    expect(buildOrderQuery(filters, 2, 25)).toMatchObject({
      nickname: 'Steve',
      status: 'PENDING',
      page: 2,
    });
    expect(buildOrderExportBody(filters)).toEqual({ status: 'PENDING', dateFrom: '2026-11-01' });
  });

  it('dateTo YYYY-MM-DD уходит как есть и в список, и в экспорт (API: конец суток UTC, включительно)', () => {
    const filters = {
      ...EMPTY_ORDER_FILTERS,
      dateFrom: '2026-11-01',
      dateTo: '2026-11-10',
    };
    // Без добавления времени и без сдвига часового пояса на стороне веба.
    expect(buildOrderQuery(filters, 1, 25)).toMatchObject({
      dateFrom: '2026-11-01',
      dateTo: '2026-11-10',
    });
    expect(buildOrderExportBody(filters)).toEqual({ dateFrom: '2026-11-01', dateTo: '2026-11-10' });
    // Один и тот же день в обеих границах допустим: это целые сутки.
    expect(
      validateOrderFilters({ ...EMPTY_ORDER_FILTERS, dateFrom: '2026-11-10', dateTo: '2026-11-10' })
        .dateTo,
    ).toBeUndefined();
  });

  it('валидация дат и причины отмены', () => {
    const bad = { ...EMPTY_ORDER_FILTERS, dateFrom: '2026-11-10', dateTo: '2026-11-01' };
    expect(validateOrderFilters(bad).dateTo).toBeTruthy();
    expect(validateCancelReason('  ')).toBe('Укажите причину отмены');
    expect(validateCancelReason('ok')).toBeNull();
    expect(validateCancelReason('x'.repeat(1001))).toMatch(/Не длиннее/);
  });

  it('409 — понятная ошибка без сырого статуса', () => {
    const info = describeCancelError(
      new ApiError(409, ['status: COMPLETED'], { code: 'ORDER_NOT_CANCELLABLE' }),
    );
    expect(info.notCancellable).toBe(true);
    expect(info.message).not.toMatch(/COMPLETED/);
  });
});

describe('Заказы: список (0.4)', () => {
  it('без права — экран 403, запросов нет', () => {
    render(<AdminStoreOrdersPage />, { wrapper: Providers });
    expect(screen.getByText(/orders\.view/)).toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('список, фильтр по нику уходит в запрос, экспорта без права нет', async () => {
    mocks.granted.add('orders.view');
    const user = userEvent.setup();
    render(<AdminStoreOrdersPage />, { wrapper: Providers });
    expect(await screen.findByRole('link', { name: 'O-1' })).toHaveAttribute(
      'href',
      '/admin/store/orders/O-1',
    );
    expect(screen.queryByRole('button', { name: /Экспорт|Выгрузить/ })).toBeNull();
    await user.type(screen.getByLabelText('Ник'), 'Steve');
    await user.click(screen.getByRole('button', { name: 'Применить' }));
    await waitFor(() =>
      expect(mocks.get).toHaveBeenLastCalledWith('/admin/orders', {
        query: expect.objectContaining({ nickname: 'Steve', page: 1 }),
      }),
    );
  });

  it('экспорт: POST через downloadExport с текущими фильтрами', async () => {
    mocks.granted.add('orders.view');
    mocks.granted.add('orders.export');
    const user = userEvent.setup();
    render(<AdminStoreOrdersPage />, { wrapper: Providers });
    await screen.findByRole('link', { name: 'O-1' });
    await user.click(screen.getByRole('button', { name: /CSV|Экспорт|Выгрузить/ }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledWith('orders', {}));
  });
});

describe('Заказы: карточка и отмена (0.4)', () => {
  it('PENDING: позиции, суммы, сводка оплаты; кнопки возврата нет', async () => {
    mocks.granted.add('orders.view');
    mocks.granted.add('orders.cancel');
    mocks.granted.add('orders.refund');
    render(<AdminStoreOrderCardPage />, { wrapper: Providers });
    expect(await screen.findByText('VIP')).toBeInTheDocument();
    expect(within(screen.getByTestId('order-payment')).getByText('pay-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отменить заказ' })).toBeInTheDocument();
    expect(screen.queryByText(/Вернуть/)).toBeNull();
  });

  it('оплаченный заказ: отмены нет', async () => {
    cardStatus = 'COMPLETED';
    mocks.granted.add('orders.view');
    mocks.granted.add('orders.cancel');
    render(<AdminStoreOrderCardPage />, { wrapper: Providers });
    await screen.findByText('VIP');
    expect(screen.queryByRole('button', { name: 'Отменить заказ' })).toBeNull();
    expect(screen.getByTestId('order-not-cancellable')).toBeInTheDocument();
  });

  it('диалог: пустая причина — ошибка, запроса нет; Esc возвращает фокус на кнопку', async () => {
    mocks.granted.add('orders.view');
    mocks.granted.add('orders.cancel');
    const user = userEvent.setup();
    render(<AdminStoreOrderCardPage />, { wrapper: Providers });
    await screen.findByText('VIP');
    const opener = screen.getByRole('button', { name: 'Отменить заказ' });
    await user.click(opener);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Отменить заказ' }));
    expect(within(dialog).getAllByText('Укажите причину отмены').length).toBeGreaterThan(0);
    expect(mocks.patch).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(opener).toHaveFocus();
  });

  it('отмена: PATCH с причиной; 409 — понятная ошибка в окне', async () => {
    mocks.granted.add('orders.view');
    mocks.granted.add('orders.cancel');
    mocks.patch.mockRejectedValueOnce(
      new ApiError(409, ['conflict'], { code: 'ORDER_NOT_CANCELLABLE' }),
    );
    const user = userEvent.setup();
    render(<AdminStoreOrderCardPage />, { wrapper: Providers });
    await screen.findByText('VIP');
    await user.click(screen.getByRole('button', { name: 'Отменить заказ' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Причина отмены/), 'Дубликат');
    await user.click(within(dialog).getByRole('button', { name: 'Отменить заказ' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/admin/orders/o1/cancel', {
        reason: 'Дубликат',
      }),
    );
    expect(await within(dialog).findByTestId('cancel-order-error')).toHaveTextContent(
      /нельзя отменить/,
    );
    expect(within(dialog).getAllByRole('button', { name: 'Закрыть' }).length).toBeGreaterThan(0);
  });

  it('403 admin_2fa_required: подсказка и ссылка на включение 2FA', async () => {
    mocks.granted.add('orders.view');
    mocks.granted.add('orders.cancel');
    mocks.patch.mockRejectedValueOnce(
      new ApiError(403, ['Требуется 2FA'], { code: 'admin_2fa_required' }),
    );
    const user = userEvent.setup();
    render(<AdminStoreOrderCardPage />, { wrapper: Providers });
    await screen.findByText('VIP');
    await user.click(screen.getByRole('button', { name: 'Отменить заказ' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Причина отмены/), 'Ошибка');
    await user.click(within(dialog).getByRole('button', { name: 'Отменить заказ' }));
    const error = await within(dialog).findByTestId('cancel-order-error');
    expect(error).toHaveTextContent(/двухфакторная/);
    expect(within(error).getByRole('link', { name: 'Включить 2FA' })).toHaveAttribute(
      'href',
      '/settings/security',
    );
    // Кнопка отмены остаётся: 2FA можно включить и повторить.
    expect(within(dialog).getByRole('button', { name: 'Отменить заказ' })).toBeInTheDocument();
  });

  it('пока идёт запрос, окно не закрывается (Esc, «Не отменять»)', async () => {
    mocks.granted.add('orders.view');
    mocks.granted.add('orders.cancel');
    let resolve!: (value: unknown) => void;
    mocks.patch.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<AdminStoreOrderCardPage />, { wrapper: Providers });
    await screen.findByText('VIP');
    await user.click(screen.getByRole('button', { name: 'Отменить заказ' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Причина отмены/), 'Дубликат');
    await user.click(within(dialog).getByRole('button', { name: 'Отменить заказ' }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    expect(within(dialog).getByRole('button', { name: 'Не отменять' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Повторный submit не создаёт второй запрос.
    await user.type(within(dialog).getByLabelText(/Причина отмены/), '{Enter}');
    expect(mocks.patch).toHaveBeenCalledTimes(1);
    cardStatus = 'CANCELLED';
    resolve({});
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('успешная отмена: кнопки отмены нет, фокус на сводке заказа', async () => {
    mocks.granted.add('orders.view');
    mocks.granted.add('orders.cancel');
    mocks.patch.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<AdminStoreOrderCardPage />, { wrapper: Providers });
    await screen.findByText('VIP');
    await user.click(screen.getByRole('button', { name: 'Отменить заказ' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Причина отмены/), 'Дубликат');
    cardStatus = 'CANCELLED';
    await user.click(within(dialog).getByRole('button', { name: 'Отменить заказ' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.getByTestId('order-summary')).toHaveFocus());
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Отменить заказ' })).toBeNull(),
    );
    expect(mocks.toast.success).toHaveBeenCalledWith(expect.stringMatching(/отменён/));
  });

  it('скидка: нулевая не показывается, ненулевая — да (без float)', async () => {
    mocks.granted.add('orders.view');
    const { unmount } = render(<AdminStoreOrderCardPage />, { wrapper: Providers });
    await screen.findByText('VIP');
    expect(screen.getByText('Скидка').nextElementSibling).toHaveTextContent(/50/);
    unmount();
    for (const zero of ['0', '0.00', '-0.00']) {
      cardDiscount = zero;
      const view = render(<AdminStoreOrderCardPage />, { wrapper: Providers });
      await screen.findByText('VIP');
      expect(screen.getByText('Скидка').nextElementSibling).toHaveTextContent(/^—$/);
      view.unmount();
    }
  });
});
