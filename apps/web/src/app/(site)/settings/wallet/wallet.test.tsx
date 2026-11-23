import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import WalletSettingsPage from './page';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get },
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/wallet',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

const entry = (over: Record<string, unknown>) => ({
  id: 'e1',
  kind: 'PURCHASE',
  amount: '100',
  balanceAfter: '1500',
  reason: null,
  orderId: null,
  createdAt: '2026-11-20T10:00:00.000Z',
  ...over,
});

function route(history: unknown) {
  mocks.get.mockImplementation(async (path: string, options?: { query?: { page?: number } }) => {
    if (path === '/wallet') {
      return { balances: [{ currency: 'RUBY', amountMinor: '1500', scale: 0 }] };
    }
    if (path === '/wallet/history') {
      if (typeof history === 'function') return history(options);
      if (history instanceof Error) throw history;
      return history;
    }
    throw new Error(`unexpected ${path}`);
  });
}

beforeEach(() => {
  mocks.get.mockReset();
  useAuthStore.setState({ status: 'authenticated', user: { id: 'u1', username: 'p' } as never });
});

describe('Настройки → Кошелёк', () => {
  it('баланс, надпись про валюту и история: тип по-русски, знак суммы, заказ', async () => {
    route({
      items: [
        entry({ id: 'a', kind: 'PURCHASE', amount: '-300', orderId: 'cmorder1234567890' }),
        entry({ id: 'b', kind: 'ADMIN_ADJUST', amount: '500' }),
      ],
      total: 2,
      page: 1,
      limit: 20,
    });
    render(<WalletSettingsPage />, { wrapper: Providers });
    expect(await screen.findByText('Покупка')).toBeInTheDocument();
    expect(screen.getByText('Корректировка администратором')).toBeInTheDocument();
    expect(screen.getByTestId('wallet-balance')).toHaveTextContent(/1\s500/);
    expect(screen.getByTestId('wallet-disclaimer')).toHaveTextContent(
      'Рубины — внутриигровая валюта, не деньги; передача и вывод недоступны.',
    );
    const amounts = screen.getAllByTestId('wallet-entry-amount').map((n) => n.textContent);
    expect(amounts).toEqual(['−300', '+500']);
    expect(screen.getByText(/Заказ #34567890/)).toBeInTheDocument();
    // Только чтение: ни кнопок трат, ни передачи.
    expect(
      screen.queryByRole('button', { name: /перевести|передать|вывести|потратить/i }),
    ).toBeNull();
  });

  it('пустой журнал: пустое состояние', async () => {
    route({ items: [], total: 0, page: 1, limit: 20 });
    render(<WalletSettingsPage />, { wrapper: Providers });
    expect(await screen.findByText('Операций пока нет')).toBeInTheDocument();
  });

  it('503 wallet_disabled: «Кошелёк пока недоступен», без баланса', async () => {
    route(new ApiError(503, ['Кошелёк отключён'], { code: 'wallet_disabled' }));
    render(<WalletSettingsPage />, { wrapper: Providers });
    expect(await screen.findByText('Кошелёк пока недоступен')).toBeInTheDocument();
    expect(screen.queryByTestId('wallet-balance')).toBeNull();
  });

  it('прочая ошибка: сообщение и повтор', async () => {
    route(new ApiError(500, ['boom']));
    render(<WalletSettingsPage />, { wrapper: Providers });
    expect(await screen.findByRole('button', { name: /повторить/i })).toBeInTheDocument();
    expect(screen.queryByText('Кошелёк пока недоступен')).toBeNull();
  });

  it('пагинация: переход на вторую страницу запрашивает page=2', async () => {
    route((options?: { query?: { page?: number } }) => {
      const page = options?.query?.page ?? 1;
      return {
        items: [entry({ id: `p${page}`, kind: page === 1 ? 'PURCHASE' : 'REFUND_REVERSAL' })],
        total: 45,
        page,
        limit: 20,
      };
    });
    render(<WalletSettingsPage />, { wrapper: Providers });
    expect(await screen.findByText('Покупка')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Страница 2' }));
    await waitFor(() => expect(screen.getByText('Возврат по заказу')).toBeInTheDocument());
    const calls = mocks.get.mock.calls.filter(([path]) => path === '/wallet/history');
    expect(calls.at(-1)?.[1]).toEqual({ query: { page: 2, limit: 20 } });
    expect(within(document.body).queryByText('Покупка')).toBeNull();
  });
});
