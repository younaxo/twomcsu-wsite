import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api/errors';
import {
  EMPTY_DELIVERY_FILTERS,
  buildDeliveryQuery,
  canMarkManualDone,
  canRetryDelivery,
  describeDeliveryError,
  tasksOfOrder,
  validateDeliveryFilters,
  validateManualDoneReason,
  validateRetryReason,
  type DeliveryTaskRow,
} from '@/lib/admin/store-delivery';
import AdminStoreOrderCardPage from '../orders/[id]/page';
import AdminStoreDeliveryTaskPage from './[id]/page';
import AdminStoreDeliveryPage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  granted: new Set<string>(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  push: vi.fn(),
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
  usePathname: () => '/admin/store/delivery',
  useRouter: () => ({ push: mocks.push, replace: vi.fn() }),
  useParams: () => ({ id: 'T1' }),
}));

let cardStatus = 'NEEDS_ATTENTION';

function task(overrides: Partial<DeliveryTaskRow> = {}): DeliveryTaskRow {
  return {
    id: 'T1',
    orderItemId: 'oi1',
    step: 1,
    executor: 'manual',
    status: 'AWAITING_MANUAL',
    attempts: 0,
    nextAttemptAt: null,
    nick: 'Steve',
    lastError: null,
    deliveredAt: null,
    createdAt: '2026-11-18T10:00:00.000Z',
    updatedAt: '2026-11-18T10:00:00.000Z',
    orderItem: {
      id: 'oi1',
      quantity: 2,
      order: { id: 'o1', orderNumber: 'O-1', status: 'COMPLETED' },
      product: { id: 'p1', name: 'VIP', type: 'PRIVILEGE' },
    },
    ...overrides,
  };
}

function card() {
  return {
    ...task({ status: cardStatus as never, lastError: 'Timeout: сервер не ответил' }),
    leaseUntil: null,
    recipientUserId: 'u1',
    renderedCommand: null,
    templateVersion: null,
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
  cardStatus = 'NEEDS_ATTENTION';
  mocks.granted.clear();
  for (const fn of [mocks.get, mocks.post, mocks.push]) fn.mockReset();
  for (const fn of Object.values(mocks.toast)) fn.mockReset();
  mocks.get.mockImplementation(async (path: string) => {
    if (path === '/admin/delivery/tasks') {
      return { items: [task()], total: 1, page: 1, limit: 25 };
    }
    if (path.startsWith('/admin/delivery/tasks/')) return card();
    return [];
  });
});

describe('Выдача: чистые функции', () => {
  it('фильтры: пустые не уходят, значения обрезаются, лимиты проверяются', () => {
    expect(buildDeliveryQuery(EMPTY_DELIVERY_FILTERS, 1, 25)).toEqual({ page: 1, limit: 25 });
    expect(
      buildDeliveryQuery(
        { status: 'FAILED', executor: 'manual', orderNumber: ' O-1 ', nick: ' Steve ' },
        2,
        25,
      ),
    ).toEqual({
      page: 2,
      limit: 25,
      status: 'FAILED',
      executor: 'manual',
      orderNumber: 'O-1',
      nick: 'Steve',
    });
    expect(
      validateDeliveryFilters({ ...EMPTY_DELIVERY_FILTERS, nick: 'x'.repeat(17) }).nick,
    ).toBeTruthy();
    expect(
      validateDeliveryFilters({ ...EMPTY_DELIVERY_FILTERS, orderNumber: 'x'.repeat(41) })
        .orderNumber,
    ).toBeTruthy();
  });

  it('причина отметки обязательна, повтора — нет', () => {
    expect(validateManualDoneReason('   ')).toBe('Укажите причину отметки');
    expect(validateManualDoneReason('Выдал вручную')).toBeNull();
    expect(validateManualDoneReason('x'.repeat(1001))).toMatch(/Не длиннее/);
    expect(validateRetryReason('')).toBeNull();
    expect(validateRetryReason('x'.repeat(1001))).toMatch(/Не длиннее/);
  });

  it('доступность действий по статусу (как на API)', () => {
    expect(canMarkManualDone('AWAITING_MANUAL')).toBe(true);
    expect(canMarkManualDone('IN_PROGRESS')).toBe(false);
    expect(canMarkManualDone('DELIVERED')).toBe(false);
    expect(canRetryDelivery('FAILED')).toBe(true);
    expect(canRetryDelivery('NEEDS_ATTENTION')).toBe(true);
    expect(canRetryDelivery('PENDING')).toBe(false);
  });

  it('ошибки: 409 и 2FA — понятный текст без сырых статусов', () => {
    const conflict = describeDeliveryError(
      new ApiError(409, ['Повтор невозможен из статуса DELIVERED'], {
        code: 'delivery_invalid_status',
      }),
    );
    expect(conflict.conflict).toBe(true);
    expect(conflict.message).not.toMatch(/DELIVERED/);
    expect(
      describeDeliveryError(new ApiError(409, ['x'], { code: 'delivery_in_progress' })).message,
    ).toMatch(/выполняется/);
    expect(
      describeDeliveryError(new ApiError(403, ['2fa'], { code: 'admin_2fa_required' }))
        .needsTwoFactor,
    ).toBe(true);
  });

  it('задания заказа сужаются до точного номера', () => {
    const other = task({
      id: 'T2',
      orderItem: {
        id: 'oi2',
        quantity: 1,
        order: { id: 'o2', orderNumber: 'O-11', status: 'COMPLETED' },
        product: null,
      },
    });
    const page = { items: [task(), other], total: 2, page: 1, limit: 100 };
    expect(tasksOfOrder(page, 'O-1').map((t) => t.id)).toEqual(['T1']);
  });
});

describe('Выдача: очередь', () => {
  it('без права — экран 403, запросов нет', () => {
    render(<AdminStoreDeliveryPage />, { wrapper: Providers });
    expect(screen.getByText(/store\.delivery\.view/)).toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('загрузка: пока нет ответа, строк нет', () => {
    mocks.granted.add('store.delivery.view');
    mocks.get.mockReturnValue(new Promise(() => {}));
    render(<AdminStoreDeliveryPage />, { wrapper: Providers });
    expect(screen.queryByRole('link', { name: 'O-1' })).toBeNull();
    expect(screen.getByRole('search', { name: 'Фильтры очереди выдачи' })).toBeInTheDocument();
  });

  it('список: заказ, позиция, ник, исполнитель и статус текстом', async () => {
    mocks.granted.add('store.delivery.view');
    render(<AdminStoreDeliveryPage />, { wrapper: Providers });
    const link = await screen.findByRole('link', { name: 'O-1' });
    expect(link).toHaveAttribute('href', '/admin/store/delivery/T1');
    const row = link.closest('tr') as HTMLElement;
    expect(within(row).getByText('VIP × 2')).toBeInTheDocument();
    expect(within(row).getByText('Steve')).toBeInTheDocument();
    expect(within(row).getByText('Вручную')).toBeInTheDocument();
    expect(within(row).getByText('Ждёт ручной выдачи')).toBeInTheDocument();
  });

  it('пусто: честное пустое состояние', async () => {
    mocks.granted.add('store.delivery.view');
    mocks.get.mockResolvedValue({ items: [], total: 0, page: 1, limit: 25 });
    render(<AdminStoreDeliveryPage />, { wrapper: Providers });
    expect(await screen.findByText('Заданий выдачи нет')).toBeInTheDocument();
  });

  it('ошибка: состояние ошибки с повтором', async () => {
    mocks.granted.add('store.delivery.view');
    mocks.get.mockRejectedValue(new ApiError(500, ['boom']));
    render(<AdminStoreDeliveryPage />, { wrapper: Providers });
    expect(await screen.findByRole('button', { name: /Повторить|Обновить/ })).toBeInTheDocument();
  });

  it('фильтры статус, исполнитель и ник уходят в запрос', async () => {
    mocks.granted.add('store.delivery.view');
    const user = userEvent.setup();
    render(<AdminStoreDeliveryPage />, { wrapper: Providers });
    await screen.findByRole('link', { name: 'O-1' });
    await user.selectOptions(screen.getByLabelText('Статус'), 'FAILED');
    await user.selectOptions(screen.getByLabelText('Исполнитель'), 'command');
    await user.type(screen.getByLabelText('Ник получателя'), 'Alex');
    await user.click(screen.getByRole('button', { name: 'Применить' }));
    await waitFor(() =>
      expect(mocks.get).toHaveBeenLastCalledWith('/admin/delivery/tasks', {
        query: expect.objectContaining({
          status: 'FAILED',
          executor: 'command',
          nick: 'Alex',
          page: 1,
        }),
      }),
    );
  });

  it('слишком длинный ник: ошибка, запрос не уходит', async () => {
    mocks.granted.add('store.delivery.view');
    const user = userEvent.setup();
    render(<AdminStoreDeliveryPage />, { wrapper: Providers });
    await screen.findByRole('link', { name: 'O-1' });
    const calls = mocks.get.mock.calls.length;
    const nick = screen.getByLabelText('Ник получателя');
    // maxLength ограничивает ввод, поэтому подставляем значение напрямую.
    nick.removeAttribute('maxlength');
    await user.type(nick, 'x'.repeat(17));
    await user.click(screen.getByRole('button', { name: 'Применить' }));
    expect(await screen.findByTestId('delivery-filter-error')).toBeInTheDocument();
    expect(mocks.get.mock.calls.length).toBe(calls);
  });
});

describe('Выдача: карточка и действия', () => {
  it('без права manage: данные есть, кнопок действий нет', async () => {
    mocks.granted.add('store.delivery.view');
    render(<AdminStoreDeliveryTaskPage />, { wrapper: Providers });
    expect(await screen.findByTestId('task-summary')).toHaveTextContent(
      'Timeout: сервер не ответил',
    );
    expect(screen.queryByRole('button', { name: 'Отметить выданным' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull();
    expect(screen.getByTestId('delivery-readonly')).toBeInTheDocument();
  });

  it('статус без допустимых действий (выдано): кнопок нет даже с manage', async () => {
    cardStatus = 'DELIVERED';
    mocks.granted.add('store.delivery.view');
    mocks.granted.add('store.delivery.manage');
    render(<AdminStoreDeliveryTaskPage />, { wrapper: Providers });
    await screen.findByTestId('task-summary');
    expect(screen.queryByRole('button', { name: 'Отметить выданным' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull();
  });

  it('«Отметить выданным»: пустая причина — ошибка, POST не уходит; Esc возвращает фокус', async () => {
    mocks.granted.add('store.delivery.view');
    mocks.granted.add('store.delivery.manage');
    const user = userEvent.setup();
    render(<AdminStoreDeliveryTaskPage />, { wrapper: Providers });
    await screen.findByTestId('task-summary');
    const opener = screen.getByRole('button', { name: 'Отметить выданным' });
    await user.click(opener);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName('Отметить выданным');
    await user.click(within(dialog).getByRole('button', { name: 'Отметить выданным' }));
    expect(within(dialog).getAllByText('Укажите причину отметки').length).toBeGreaterThan(0);
    expect(mocks.post).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(opener).toHaveFocus();
  });

  it('«Отметить выданным»: POST с причиной, успех закрывает окно', async () => {
    mocks.granted.add('store.delivery.view');
    mocks.granted.add('store.delivery.manage');
    mocks.post.mockResolvedValue(card());
    const user = userEvent.setup();
    render(<AdminStoreDeliveryTaskPage />, { wrapper: Providers });
    await screen.findByTestId('task-summary');
    await user.click(screen.getByRole('button', { name: 'Отметить выданным' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Причина/), '  Выдал через консоль ');
    await user.click(within(dialog).getByRole('button', { name: 'Отметить выданным' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/admin/delivery/tasks/T1/manual-done', {
        reason: 'Выдал через консоль',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mocks.toast.success).toHaveBeenCalled();
  });

  it('«Повторить»: без подтверждения POST не уходит, с подтверждением — confirmed: true', async () => {
    mocks.granted.add('store.delivery.view');
    mocks.granted.add('store.delivery.manage');
    mocks.post.mockResolvedValue(card());
    const user = userEvent.setup();
    render(<AdminStoreDeliveryTaskPage />, { wrapper: Providers });
    await screen.findByTestId('task-summary');
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName('Повторить выдачу');
    await user.click(within(dialog).getByRole('button', { name: 'Повторить выдачу' }));
    expect(within(dialog).getAllByText(/Подтвердите/).length).toBeGreaterThan(0);
    expect(mocks.post).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'Повторить выдачу' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/admin/delivery/tasks/T1/retry', {
        confirmed: true,
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('«Повторить»: непустая причина уходит в запрос обрезанной', async () => {
    mocks.granted.add('store.delivery.view');
    mocks.granted.add('store.delivery.manage');
    mocks.post.mockResolvedValue(card());
    const user = userEvent.setup();
    render(<AdminStoreDeliveryTaskPage />, { wrapper: Providers });
    await screen.findByTestId('task-summary');
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox'));
    await user.type(within(dialog).getByLabelText(/Причина/), '  Сервер был недоступен ');
    await user.click(within(dialog).getByRole('button', { name: 'Повторить выдачу' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/admin/delivery/tasks/T1/retry', {
        confirmed: true,
        reason: 'Сервер был недоступен',
      }),
    );
  });

  it('«Повторить»: 400 по причине показывается у поля, окно остаётся открытым', async () => {
    mocks.granted.add('store.delivery.view');
    mocks.granted.add('store.delivery.manage');
    mocks.post.mockRejectedValueOnce(new ApiError(400, ['reason: слишком длинная причина']));
    const user = userEvent.setup();
    render(<AdminStoreDeliveryTaskPage />, { wrapper: Providers });
    await screen.findByTestId('task-summary');
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox'));
    const field = within(dialog).getByLabelText(/Причина/);
    await user.type(field, 'Причина');
    await user.click(within(dialog).getByRole('button', { name: 'Повторить выдачу' }));
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
    expect(within(dialog).getAllByText(/слишком длинная причина/).length).toBeGreaterThan(1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('«Повторить»: после закрытия по Esc фокус возвращается на кнопку', async () => {
    mocks.granted.add('store.delivery.view');
    mocks.granted.add('store.delivery.manage');
    const user = userEvent.setup();
    render(<AdminStoreDeliveryTaskPage />, { wrapper: Providers });
    await screen.findByTestId('task-summary');
    const opener = screen.getByRole('button', { name: 'Повторить' });
    await user.click(opener);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(opener).toHaveFocus();
  });

  it('409: понятная ошибка в окне, кнопка действия скрыта, остаётся «Закрыть»', async () => {
    mocks.granted.add('store.delivery.view');
    mocks.granted.add('store.delivery.manage');
    mocks.post.mockRejectedValueOnce(
      new ApiError(409, ['Отметить выдачу нельзя из статуса DELIVERED'], {
        code: 'delivery_invalid_status',
      }),
    );
    const user = userEvent.setup();
    render(<AdminStoreDeliveryTaskPage />, { wrapper: Providers });
    await screen.findByTestId('task-summary');
    await user.click(screen.getByRole('button', { name: 'Отметить выданным' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Причина/), 'Готово');
    await user.click(within(dialog).getByRole('button', { name: 'Отметить выданным' }));
    const error = await within(dialog).findByTestId('delivery-action-error');
    expect(error).toHaveTextContent(/другом статусе/);
    expect(error.textContent).not.toMatch(/DELIVERED/);
    expect(within(dialog).queryByRole('button', { name: 'Отметить выданным' })).toBeNull();
    expect(within(dialog).getAllByRole('button', { name: 'Закрыть' }).length).toBeGreaterThan(0);
  });

  it('пока идёт запрос, окно не закрывается по Esc', async () => {
    mocks.granted.add('store.delivery.view');
    mocks.granted.add('store.delivery.manage');
    let resolve!: (value: unknown) => void;
    mocks.post.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<AdminStoreDeliveryTaskPage />, { wrapper: Providers });
    await screen.findByTestId('task-summary');
    await user.click(screen.getByRole('button', { name: 'Отметить выданным' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Причина/), 'Готово');
    await user.click(within(dialog).getByRole('button', { name: 'Отметить выданным' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    resolve(card());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('Выдача: карточка заказа админки', () => {
  const orderCard = {
    id: 'o1',
    orderNumber: 'O-1',
    userId: 'u1',
    guestMinecraftNick: null,
    status: 'COMPLETED',
    subtotal: '500.00',
    discountAmount: '0',
    promoCodeId: null,
    total: '500.00',
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
    items: [],
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

  beforeEach(() => {
    mocks.get.mockImplementation(async (path: string) => {
      if (path === '/admin/delivery/tasks') {
        return { items: [task()], total: 1, page: 1, limit: 100 };
      }
      return orderCard;
    });
  });

  it('без права store.delivery.view блока выдачи и запроса заданий нет', async () => {
    mocks.granted.add('orders.view');
    render(<AdminStoreOrderCardPage />, { wrapper: Providers });
    await screen.findByTestId('order-summary');
    expect(screen.queryByTestId('order-delivery')).toBeNull();
    expect(mocks.get).not.toHaveBeenCalledWith('/admin/delivery/tasks', expect.anything());
  });

  it('с правом: статус выдачи позиций со ссылкой на задание', async () => {
    mocks.granted.add('orders.view');
    mocks.granted.add('store.delivery.view');
    render(<AdminStoreOrderCardPage />, { wrapper: Providers });
    const list = await screen.findByTestId('order-delivery');
    expect(within(list).getByText('Ждёт ручной выдачи')).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Открыть задание' })).toHaveAttribute(
      'href',
      '/admin/store/delivery/T1',
    );
    expect(mocks.get).toHaveBeenCalledWith('/admin/delivery/tasks', {
      query: { orderNumber: 'O-1', limit: 100, page: 1 },
    });
  });

  it('заданий нет: пояснение', async () => {
    mocks.granted.add('orders.view');
    mocks.granted.add('store.delivery.view');
    mocks.get.mockImplementation(async (path: string) =>
      path === '/admin/delivery/tasks' ? { items: [], total: 0, page: 1, limit: 100 } : orderCard,
    );
    render(<AdminStoreOrderCardPage />, { wrapper: Providers });
    expect(await screen.findByTestId('order-delivery-empty')).toBeInTheDocument();
  });
});
