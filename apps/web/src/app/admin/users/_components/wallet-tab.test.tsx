import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdminUserFull } from '@twomc/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import { WalletTab } from './wallet-tab';

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
    can: (requirement: string | readonly string[]) =>
      (Array.isArray(requirement) ? requirement : [requirement]).some((key) =>
        mocks.granted.has(key as string),
      ),
  }),
}));
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }));

const USER = { id: 'target1', username: 'builder' } as unknown as AdminUserFull;

const VIEW = {
  userId: 'target1',
  currency: 'RUBY',
  scale: 0,
  balance: '1500',
  consistent: true,
  history: {
    items: [
      {
        id: 'e1',
        kind: 'ADMIN_ADJUST',
        amount: '-200',
        balanceAfter: '1500',
        reason: 'Откат бонуса',
        orderId: null,
        createdAt: '2026-11-20T10:00:00.000Z',
        actorId: 'admin-actor-1',
        refundId: null,
      },
    ],
    total: 45,
    page: 1,
    limit: 20,
  },
};

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
  mocks.granted.clear();
  mocks.get.mockReset();
  mocks.post.mockReset();
  for (const fn of Object.values(mocks.toast)) fn.mockReset();
  mocks.get.mockResolvedValue(VIEW);
  mocks.post.mockResolvedValue({ entry: {}, balance: '1700', replayed: false });
  useAuthStore.setState({ status: 'authenticated', user: { id: 'admin1' } as never });
});

async function openAdjust(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Корректировка' }));
}

async function fillDetails(user: ReturnType<typeof userEvent.setup>, amount = '+200') {
  await user.type(screen.getByLabelText(/Сумма, рубины/), amount);
  await user.type(screen.getByLabelText(/Причина/), 'Компенсация');
  await user.click(screen.getByRole('button', { name: 'Далее' }));
}

describe('Кошелёк в карточке пользователя (0.15)', () => {
  it('wallet.view: баланс, журнал с причиной и исполнителем; кнопки корректировки нет', async () => {
    mocks.granted.add('wallet.view');
    render(<WalletTab user={USER} />, { wrapper: Providers });
    expect(await screen.findByText('Корректировка администратором')).toBeInTheDocument();
    expect(screen.getByTestId('wallet-balance')).toHaveTextContent(/1\s500/);
    expect(screen.getByText(/Причина: Откат бонуса/)).toBeInTheDocument();
    expect(screen.getByTestId('wallet-entry-amount')).toHaveTextContent('−200');
    expect(screen.queryByRole('button', { name: 'Корректировка' })).toBeNull();
    expect(screen.queryByTestId('wallet-inconsistent')).toBeNull();
  });

  it('расхождение с журналом: предупреждение', async () => {
    mocks.granted.add('wallet.view');
    mocks.get.mockResolvedValue({ ...VIEW, consistent: false });
    render(<WalletTab user={USER} />, { wrapper: Providers });
    expect(await screen.findByTestId('wallet-inconsistent')).toBeInTheDocument();
  });

  it('503 wallet_disabled: кошелёк выключен', async () => {
    mocks.granted.add('wallet.view');
    mocks.get.mockRejectedValue(new ApiError(503, ['off'], { code: 'wallet_disabled' }));
    render(<WalletTab user={USER} />, { wrapper: Providers });
    expect(await screen.findByText('Кошелёк выключен')).toBeInTheDocument();
  });

  it('пагинация: вторая страница запрашивает page=2', async () => {
    mocks.granted.add('wallet.view');
    render(<WalletTab user={USER} />, { wrapper: Providers });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Страница 2' }));
    await waitFor(() =>
      expect(mocks.get).toHaveBeenLastCalledWith('/admin/wallet/users/target1', {
        query: { page: 2, limit: 20 },
      }),
    );
  });

  it('свой кошелёк: корректировка отключена', async () => {
    mocks.granted.add('wallet.view').add('wallet.adjust');
    useAuthStore.setState({ status: 'authenticated', user: { id: 'target1' } as never });
    render(<WalletTab user={USER} />, { wrapper: Providers });
    expect(await screen.findByRole('button', { name: 'Корректировка' })).toBeDisabled();
  });

  it('валидация: без причины и с неверной суммой — на второй шаг не пускает', async () => {
    mocks.granted.add('wallet.view').add('wallet.adjust');
    render(<WalletTab user={USER} />, { wrapper: Providers });
    const user = userEvent.setup();
    await openAdjust(user);
    await user.type(screen.getByLabelText(/Сумма, рубины/), '0');
    await user.click(screen.getByRole('button', { name: 'Далее' }));
    expect(screen.getByText(/Целое число, не 0, до 9 цифр/)).toBeInTheDocument();
    expect(screen.getByText('Укажите причину.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Код 2FA/)).toBeNull();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('успех: подтверждение, 2FA one-time-code, тело запроса без «+», toast', async () => {
    mocks.granted.add('wallet.view').add('wallet.adjust');
    render(<WalletTab user={USER} />, { wrapper: Providers });
    const user = userEvent.setup();
    await openAdjust(user);
    await fillDetails(user, '+200');
    expect(screen.getByTestId('adjust-summary')).toHaveTextContent(/Начислить\s+200\s+рубинов/);
    const code = screen.getByLabelText(/Код 2FA/);
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    await user.type(code, '123456');
    await user.click(screen.getByRole('button', { name: 'Начислить' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    const [path, body] = mocks.post.mock.calls[0] as [string, Record<string, string>];
    expect(path).toBe('/admin/wallet/users/target1/adjust');
    expect(body).toMatchObject({ amount: '200', reason: 'Компенсация', twoFactorCode: '123456' });
    expect(body.requestId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalled());
  });

  it('неверный 2FA: сообщение в alert, код очищен', async () => {
    mocks.granted.add('wallet.view').add('wallet.adjust');
    mocks.post.mockRejectedValue(new ApiError(403, ['bad'], { code: 'wallet_two_factor_invalid' }));
    render(<WalletTab user={USER} />, { wrapper: Providers });
    const user = userEvent.setup();
    await openAdjust(user);
    await fillDetails(user, '-50');
    expect(screen.getByRole('button', { name: 'Списать' })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Код 2FA/), '111111');
    await user.click(screen.getByRole('button', { name: 'Списать' }));
    const alert = await screen.findByTestId('adjust-error');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent('Неверный код 2FA');
    expect(screen.getByLabelText(/Код 2FA/)).toHaveValue('');
  });

  it.each([
    ['wallet_self_adjust_forbidden', 403, 'Нельзя корректировать собственный кошелёк'],
    ['wallet_adjust_daily_limit', 400, 'Суточный лимит корректировок исчерпан'],
    ['wallet_adjust_limit', 400, 'Сумма больше лимита одной корректировки'],
    ['wallet_insufficient', 409, 'Баланс не может стать отрицательным'],
  ])('код %s -> понятный текст', async (code, status, text) => {
    mocks.granted.add('wallet.view').add('wallet.adjust');
    mocks.post.mockRejectedValue(new ApiError(status, ['x'], { code }));
    render(<WalletTab user={USER} />, { wrapper: Providers });
    const user = userEvent.setup();
    await openAdjust(user);
    await fillDetails(user, '+10');
    await user.type(screen.getByLabelText(/Код 2FA/), '123456');
    await user.click(screen.getByRole('button', { name: 'Начислить' }));
    await waitFor(() => expect(screen.getAllByText(new RegExp(text)).length).toBeGreaterThan(0));
  });

  it('429: «Слишком много попыток», код очищен', async () => {
    mocks.granted.add('wallet.view').add('wallet.adjust');
    mocks.post.mockRejectedValue(new ApiError(429, ['throttled']));
    render(<WalletTab user={USER} />, { wrapper: Providers });
    const user = userEvent.setup();
    await openAdjust(user);
    await fillDetails(user, '+10');
    await user.type(screen.getByLabelText(/Код 2FA/), '123456');
    await user.click(screen.getByRole('button', { name: 'Начислить' }));
    expect(await screen.findByTestId('adjust-error')).toHaveTextContent('Слишком много попыток');
    expect(screen.getByLabelText(/Код 2FA/)).toHaveValue('');
  });
});
