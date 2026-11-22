import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api/errors';
import { ADMIN_NAV } from '@/lib/admin/navigation';
import {
  centsToDecimal,
  describeRefundError,
  remainingToRefund,
  toCents,
  validateRefundForm,
} from '@/lib/admin/store-refunds';
import AdminStoreOrderCardPage from '../orders/[id]/page';
import AdminStoreRefundsPage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  granted: new Set<string>(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
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
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/store/orders',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: 'O-1' }),
}));

let orderStatus = 'COMPLETED';
let delivered = false;
let refundsReply: () => unknown;

function order() {
  return {
    id: 'o1',
    orderNumber: 'O-1',
    userId: 'u1',
    guestMinecraftNick: null,
    status: orderStatus,
    subtotal: '500.00',
    discountAmount: '50.00',
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
        quantity: 1,
        unitPrice: '450.00',
        totalPrice: '450.00',
        giftToUserId: null,
        giftMessage: null,
        isDelivered: delivered,
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
      isPaid: true,
      paidAt: null,
      webhookVerifiedAt: null,
    },
  };
}

function refundRow(status: string, amount = '100.00') {
  return {
    id: 'r1',
    orderId: 'o1',
    amount,
    reason: 'ошибка покупателя',
    kind: 'NORMAL',
    status,
    providerRefundId: null,
    errorCode: null,
    requiresManualRevoke: false,
    actorId: 'a1',
    createdAt: '2026-11-19T10:00:00.000Z',
    updatedAt: '2026-11-19T10:00:00.000Z',
    completedAt: null,
    order: { orderNumber: 'O-1', status: 'REFUNDED', total: '450.00' },
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

const disabledError = () => new ApiError(503, ['Возвраты отключены'], { code: 'refunds_disabled' });

beforeEach(() => {
  orderStatus = 'COMPLETED';
  delivered = false;
  refundsReply = () => ({ items: [], total: 0, page: 1, limit: 100 });
  mocks.granted.clear();
  mocks.get.mockReset();
  mocks.post.mockReset();
  for (const fn of Object.values(mocks.toast)) fn.mockReset();
  mocks.get.mockImplementation(async (path: string) => {
    if (path === '/admin/store/refunds') {
      const reply = refundsReply();
      if (reply instanceof Error) throw reply;
      return reply;
    }
    if (path.startsWith('/admin/orders/')) return order();
    return [];
  });
});

async function openRefundDialog(name: string) {
  const user = userEvent.setup();
  render(<AdminStoreOrderCardPage />, { wrapper: Providers });
  await screen.findByText('VIP');
  const button = await screen.findByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
  return { user, dialog: await screen.findByRole('dialog') };
}

describe('Возвраты: чистые функции', () => {
  it('копейки и остаток считаются без float', () => {
    expect(toCents('450')).toBe(45000);
    expect(toCents('0.1')).toBe(10);
    expect(toCents('1.234')).toBeNull();
    expect(centsToDecimal(45005)).toBe('450.05');
    expect(
      remainingToRefund('450.00', [
        refundRow('SUCCEEDED', '100.10') as never,
        refundRow('FAILED', '300.00') as never,
      ]),
    ).toBe('349.90');
    expect(
      remainingToRefund('450.00', [
        refundRow('SUCCEEDED', '100.00') as never,
        refundRow('PENDING', '50.00') as never,
      ]),
    ).toBe('300.00');
  });

  it('валидация: причина и код обязательны, override требует слово', () => {
    const base = { reason: ' ', amount: '', twoFactorCode: '', confirmText: '' };
    const errors = validateRefundForm(base, { withAmount: true, requireConfirm: true });
    expect(errors.reason).toBeTruthy();
    expect(errors.twoFactorCode).toBeTruthy();
    expect(errors.confirmText).toBeTruthy();
    expect(
      validateRefundForm(
        { reason: 'ок', amount: '999', twoFactorCode: '123456' },
        { withAmount: true, requireConfirm: false, remaining: '450.00' },
      ).amount,
    ).toMatch(/больше остатка/);
    expect(
      validateRefundForm(
        { reason: 'ок', amount: '', twoFactorCode: '123456', confirmText: 'ВОЗВРАТ' },
        { withAmount: true, requireConfirm: true },
      ),
    ).toEqual({});
  });

  it('коды ошибок — русские тексты, 429 — «Слишком много попыток»', () => {
    const err = (status: number, code?: string) => new ApiError(status, ['x'], { code });
    expect(describeRefundError(err(429)).message).toMatch(/Слишком много попыток/);
    expect(describeRefundError(err(429, 'refund_two_factor_locked')).message).toMatch(
      /Слишком много попыток/,
    );
    expect(describeRefundError(err(503, 'refunds_disabled'))).toMatchObject({ disabled: true });
    expect(describeRefundError(err(409, 'refund_in_progress')).message).toMatch(/уже выполняется/);
    expect(describeRefundError(err(422, 'refund_rubies_unsupported')).message).toMatch(/рубинов/);
    expect(describeRefundError(err(409, 'refund_after_delivery')).message).toMatch(/выдан/);
    expect(describeRefundError(err(409)).message).toMatch(/изменилось/);
    expect(describeRefundError(err(403, 'refund_two_factor_invalid'))).toMatchObject({
      field: 'twoFactorCode',
    });
  });

  it('неизвестные коды и не-ApiError: общий текст без серверных сообщений', () => {
    const generic = describeRefundError(new ApiError(500, ['SQL boom stack'], { code: 'weird' }));
    expect(generic.message).toBe('Не удалось выполнить действие (код: weird)');
    expect(describeRefundError(new ApiError(500, ['SQL boom stack'])).message).not.toMatch(/SQL/);
    const plain = describeRefundError(new Error('secret internals'));
    expect(plain.message).toBe('Не удалось выполнить действие (код: unknown)');
    const busy = new ApiError(409, ['x'], { code: 'delivery_in_progress' });
    expect(describeRefundError(busy).message).toMatch(/выдаётся/);
  });

  it('код 2FA: ровно 6 цифр', () => {
    const opts = { withAmount: false, requireConfirm: false };
    const base = { reason: 'ок', amount: '' };
    expect(validateRefundForm({ ...base, twoFactorCode: '1234567' }, opts).twoFactorCode).toBe(
      'Код — 6 цифр',
    );
    expect(validateRefundForm({ ...base, twoFactorCode: '12345' }, opts).twoFactorCode).toBe(
      'Код — 6 цифр',
    );
    expect(validateRefundForm({ ...base, twoFactorCode: '123456' }, opts)).toEqual({});
  });

  it('меню: пункт «Возвраты» по праву orders.refund', () => {
    const store = ADMIN_NAV.find((g) => g.id === 'store')!.items[0]!;
    const section = store.sections?.find((s) => s.href === '/admin/store/refunds');
    expect(section?.requirement).toBe('orders.refund');
    expect(JSON.stringify(store.requirement)).toContain('orders.refund');
  });
});

describe('Возврат в карточке заказа', () => {
  it('без права orders.refund блока нет', async () => {
    mocks.granted.add('orders.view');
    render(<AdminStoreOrderCardPage />, { wrapper: Providers });
    await screen.findByText('VIP');
    expect(screen.queryByTestId('refund-panel')).toBeNull();
    expect(mocks.get).not.toHaveBeenCalledWith('/admin/store/refunds', expect.anything());
  });

  it('PENDING-заказ: блока возврата нет даже с правом', async () => {
    orderStatus = 'PENDING';
    mocks.granted.add('orders.view');
    mocks.granted.add('orders.refund');
    render(<AdminStoreOrderCardPage />, { wrapper: Providers });
    await screen.findByText('VIP');
    expect(screen.queryByTestId('refund-panel')).toBeNull();
  });

  it('флаг выключен (503): «Возвраты выключены», кнопки неактивны', async () => {
    refundsReply = disabledError;
    mocks.granted.add('orders.view');
    mocks.granted.add('orders.refund');
    mocks.granted.add('store.refund.override');
    render(<AdminStoreOrderCardPage />, { wrapper: Providers });
    expect(await screen.findByTestId('refunds-disabled')).toHaveTextContent('Возвраты выключены');
    expect(screen.getByRole('button', { name: 'Вернуть' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Возврат по ошибке' })).toBeDisabled();
  });

  it('«Возврат по ошибке» только с правом override', async () => {
    mocks.granted.add('orders.view');
    mocks.granted.add('orders.refund');
    render(<AdminStoreOrderCardPage />, { wrapper: Providers });
    await screen.findByRole('button', { name: 'Вернуть' });
    expect(screen.queryByRole('button', { name: 'Возврат по ошибке' })).toBeNull();
  });

  it('пустые причина и код — ошибки, запроса нет; сумма по умолчанию — остаток', async () => {
    mocks.granted.add('orders.view');
    mocks.granted.add('orders.refund');
    const { user, dialog } = await openRefundDialog('Вернуть');
    expect(within(dialog).getByLabelText(/Сумма возврата/)).toHaveValue('450.00');
    expect(within(dialog).getByLabelText(/Код 2FA/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Вернуть' }));
    expect(within(dialog).getByText('Укажите причину')).toBeInTheDocument();
    expect(within(dialog).getByText('Введите код из приложения 2FA')).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('успех: POST с причиной, суммой и кодом; результат в aria-live', async () => {
    mocks.granted.add('orders.view');
    mocks.granted.add('orders.refund');
    mocks.post.mockResolvedValue({ refund: refundRow('SUCCEEDED'), orderStatus: 'REFUNDED' });
    const { user, dialog } = await openRefundDialog('Вернуть');
    await user.type(within(dialog).getByLabelText(/Причина возврата/), 'Ошибка покупателя');
    await user.type(within(dialog).getByLabelText(/Код 2FA/), '123456');
    await user.click(within(dialog).getByRole('button', { name: 'Вернуть' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/admin/store/refunds/orders/o1', {
        reason: 'Ошибка покупателя',
        twoFactorCode: '123456',
        amount: '450.00',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByTestId('refund-result')).toHaveTextContent('Возврат выполнен.');
    expect(screen.getByTestId('refund-result')).toHaveAttribute('aria-live', 'polite');
  });

  it('429: «Слишком много попыток», код 2FA очищается', async () => {
    mocks.granted.add('orders.view');
    mocks.granted.add('orders.refund');
    mocks.post.mockRejectedValue(new ApiError(429, ['Too Many Requests']));
    const { user, dialog } = await openRefundDialog('Вернуть');
    await user.type(within(dialog).getByLabelText(/Причина возврата/), 'x');
    await user.type(within(dialog).getByLabelText(/Код 2FA/), '123456');
    await user.click(within(dialog).getByRole('button', { name: 'Вернуть' }));
    expect(await within(dialog).findByTestId('refund-error')).toHaveTextContent(
      'Слишком много попыток',
    );
    expect(within(dialog).getByLabelText(/Код 2FA/)).toHaveValue('');
  });

  it('поле кода: one-time-code; после любой ошибки очищается; причина с HTML сохраняется текстом', async () => {
    mocks.granted.add('orders.view');
    mocks.granted.add('orders.refund');
    mocks.post.mockRejectedValue(new ApiError(500, ['boom'], { code: 'weird' }));
    const { user, dialog } = await openRefundDialog('Вернуть');
    const codeInput = within(dialog).getByLabelText(/Код 2FA/);
    expect(codeInput).toHaveAttribute('autocomplete', 'one-time-code');
    await user.type(within(dialog).getByLabelText(/Причина возврата/), '<b>x</b>');
    await user.type(codeInput, '123456');
    await user.click(within(dialog).getByRole('button', { name: 'Вернуть' }));
    expect(await within(dialog).findByTestId('refund-error')).toHaveTextContent(
      'Не удалось выполнить действие (код: weird)',
    );
    expect(within(dialog).getByLabelText(/Код 2FA/)).toHaveValue('');
    expect(within(dialog).getByLabelText(/Причина возврата/)).toHaveValue('<b>x</b>');
  });

  it('двойная отправка: пока запрос идёт, второй POST не уходит', async () => {
    mocks.granted.add('orders.view');
    mocks.granted.add('orders.refund');
    let resolve: (v: unknown) => void = () => {};
    mocks.post.mockImplementation(() => new Promise((r) => (resolve = r)));
    const { user, dialog } = await openRefundDialog('Вернуть');
    await user.type(within(dialog).getByLabelText(/Причина возврата/), 'x');
    await user.type(within(dialog).getByLabelText(/Код 2FA/), '123456');
    const submit = within(dialog).getByRole('button', { name: 'Вернуть' });
    await user.click(submit);
    await user.click(submit);
    await user.keyboard('{Enter}');
    expect(mocks.post).toHaveBeenCalledTimes(1);
    resolve({ refund: refundRow('SUCCEEDED'), orderStatus: 'REFUNDED' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('история: причина с HTML отображается текстом', async () => {
    mocks.granted.add('orders.view');
    mocks.granted.add('orders.refund');
    refundsReply = () => ({
      items: [{ ...refundRow('FAILED'), reason: '<img src=x onerror=alert(1)>' }],
      total: 1,
      page: 1,
      limit: 100,
    });
    render(<AdminStoreOrderCardPage />, { wrapper: Providers });
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });

  it('refund_in_progress (409) — понятный текст в окне', async () => {
    mocks.granted.add('orders.view');
    mocks.granted.add('orders.refund');
    mocks.post.mockRejectedValue(
      new ApiError(409, ['Возврат по заказу уже выполняется'], { code: 'refund_in_progress' }),
    );
    const { user, dialog } = await openRefundDialog('Вернуть');
    await user.type(within(dialog).getByLabelText(/Причина возврата/), 'x');
    await user.type(within(dialog).getByLabelText(/Код 2FA/), '123456');
    await user.click(within(dialog).getByRole('button', { name: 'Вернуть' }));
    expect(await within(dialog).findByTestId('refund-error')).toHaveTextContent('уже выполняется');
  });

  it('после выдачи обычный «Вернуть» неактивен', async () => {
    delivered = true;
    mocks.granted.add('orders.view');
    mocks.granted.add('orders.refund');
    mocks.granted.add('store.refund.override');
    render(<AdminStoreOrderCardPage />, { wrapper: Providers });
    await screen.findByText('VIP');
    const button = await screen.findByRole('button', { name: 'Вернуть' });
    expect(button).toBeDisabled();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Возврат по ошибке' })).toBeEnabled(),
    );
  });

  it('override: предупреждение, без слова ВОЗВРАТ запроса нет, со словом — POST /override', async () => {
    delivered = true;
    mocks.granted.add('orders.view');
    mocks.granted.add('orders.refund');
    mocks.granted.add('store.refund.override');
    mocks.post.mockResolvedValue({
      refund: { ...refundRow('SUCCEEDED'), requiresManualRevoke: true },
      orderStatus: 'REFUNDED',
    });
    const { user, dialog } = await openRefundDialog('Возврат по ошибке');
    expect(within(dialog).getByTestId('override-warning')).toHaveTextContent('необратимо');
    expect(within(dialog).getByTestId('override-warning')).toHaveTextContent('вручную');
    await user.type(within(dialog).getByLabelText(/Причина возврата по ошибке/), 'Выдали не то');
    await user.type(within(dialog).getByLabelText(/Код 2FA/), '123456');
    const submit = within(dialog).getByRole('button', { name: 'Выполнить возврат по ошибке' });
    await user.click(submit);
    expect(within(dialog).getByText(/Введите слово ВОЗВРАТ/)).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText(/Для подтверждения введите/), 'ВОЗВРАТ');
    await user.click(submit);
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith(
        '/admin/store/refunds/orders/o1/override',
        expect.objectContaining({ reason: 'Выдали не то', twoFactorCode: '123456' }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('refund-result')).toHaveTextContent('отозвать вручную'),
    );
  });

  it('REFUND_PENDING: «Отметить возврат неудавшимся» → POST /mark-failed без суммы', async () => {
    orderStatus = 'REFUND_PENDING';
    mocks.granted.add('orders.view');
    mocks.granted.add('orders.refund');
    mocks.post.mockResolvedValue({ refund: refundRow('FAILED'), orderStatus: 'REFUND_FAILED' });
    const { user, dialog } = await openRefundDialog('Отметить возврат неудавшимся');
    expect(within(dialog).queryByLabelText(/Сумма возврата/)).toBeNull();
    await user.type(within(dialog).getByLabelText(/^Причина/), 'провайдер молчит');
    await user.type(within(dialog).getByLabelText(/Код 2FA/), '654321');
    await user.click(within(dialog).getByRole('button', { name: 'Отметить неудавшимся' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/admin/store/refunds/orders/o1/mark-failed', {
        reason: 'провайдер молчит',
        twoFactorCode: '654321',
      }),
    );
  });
});

describe('Список возвратов', () => {
  it('без права — нет данных; с правом — строки со ссылкой на заказ и фильтр статуса', async () => {
    refundsReply = () => ({ items: [refundRow('SUCCEEDED')], total: 1, page: 1, limit: 30 });
    mocks.granted.add('orders.refund');
    const user = userEvent.setup();
    render(<AdminStoreRefundsPage />, { wrapper: Providers });
    const link = await screen.findByRole('link', { name: 'O-1' });
    expect(link).toHaveAttribute('href', '/admin/store/orders/O-1');
    expect(within(screen.getByRole('table')).getByText('Выполнен')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Статус возврата'), 'FAILED');
    await waitFor(() =>
      expect(mocks.get).toHaveBeenLastCalledWith('/admin/store/refunds', {
        query: { page: 1, limit: 30, status: 'FAILED' },
      }),
    );
  });

  it('нет права orders.refund — запроса нет', async () => {
    render(<AdminStoreRefundsPage />, { wrapper: Providers });
    await waitFor(() => expect(mocks.get).not.toHaveBeenCalled());
  });

  it('флаг выключен — «Возвраты выключены»', async () => {
    refundsReply = disabledError;
    mocks.granted.add('orders.refund');
    render(<AdminStoreRefundsPage />, { wrapper: Providers });
    expect(await screen.findByTestId('refunds-disabled')).toHaveTextContent('Возвраты выключены');
  });
});
