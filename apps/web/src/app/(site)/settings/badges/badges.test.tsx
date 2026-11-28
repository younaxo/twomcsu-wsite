import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import BadgesSettingsPage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, put: mocks.put },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/settings/badges',
}));

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
  mocks.get.mockReset();
  mocks.put.mockReset().mockResolvedValue({ success: true });
  useAuthStore.setState({ status: 'authenticated', user: { id: 'me' } as never });
  mocks.get.mockImplementation(async (path: string) => {
    if (path === '/users/me/badges') {
      return [
        { id: 'b1', type: 'VERIFIED', grantedAt: '2026-01-01' },
        { id: 'b2', type: 'LEADERSHIP', grantedAt: '2026-01-02' },
      ];
    }
    if (path === '/users/me/awards') {
      return [
        { id: 'a1', slug: 'first', name: 'Первая награда', grantedAt: '2026-01-01' },
        { id: 'a2', slug: 'second', name: 'Вторая награда', grantedAt: '2026-01-02' },
      ];
    }
    if (path === '/users/me/profile') return { displayBadge: { id: 'b1', type: 'VERIFIED' } };
    throw new ApiError(404, ['Cannot GET ' + path]);
  });
});

describe('Бейджи и награды (J-07-6)', () => {
  it('кнопки с aria-label, границы disabled', async () => {
    render(<BadgesSettingsPage />, { wrapper: Providers });
    const list = await screen.findByTestId('badges-order');
    expect(within(list).getByRole('button', { name: 'Выше: Подтверждённый игрок' })).toBeDisabled();
    expect(within(list).getByRole('button', { name: 'Ниже: Подтверждённый игрок' })).toBeEnabled();
    expect(within(list).getByRole('button', { name: 'Ниже: Руководство проекта' })).toBeDisabled();
    const awards = screen.getByTestId('awards-order');
    expect(within(awards).getByRole('button', { name: 'Выше: Первая награда' })).toBeDisabled();
  });

  it('переставляет и сохраняет порядок и выбранный бейдж', async () => {
    const user = userEvent.setup();
    render(<BadgesSettingsPage />, { wrapper: Providers });
    const list = await screen.findByTestId('badges-order');
    await user.click(within(list).getByRole('button', { name: 'Ниже: Подтверждённый игрок' }));
    const awards = screen.getByTestId('awards-order');
    await user.click(within(awards).getByRole('button', { name: 'Ниже: Первая награда' }));
    await user.click(screen.getByRole('radio', { name: 'Руководство проекта' }));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(3));
    expect(mocks.put).toHaveBeenCalledWith('/users/me/badges/order', { ids: ['b2', 'b1'] });
    expect(mocks.put).toHaveBeenCalledWith('/users/me/awards/order', { ids: ['a2', 'a1'] });
    expect(mocks.put).toHaveBeenCalledWith('/users/me/display-badge', { userBadgeId: 'b2' });
    expect(await screen.findByRole('status')).toHaveTextContent('Сохранено');
  });

  it('«Нет» отправляет null', async () => {
    const user = userEvent.setup();
    render(<BadgesSettingsPage />, { wrapper: Providers });
    await screen.findByTestId('badges-order');
    await user.click(screen.getByRole('radio', { name: 'Нет' }));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(mocks.put).toHaveBeenCalledWith('/users/me/display-badge', { userBadgeId: null }),
    );
  });

  it('фокус остаётся на кнопке элемента; у края уходит на соседнюю; объявляется позиция', async () => {
    const user = userEvent.setup();
    render(<BadgesSettingsPage />, { wrapper: Providers });
    const list = await screen.findByTestId('badges-order');
    await user.click(within(list).getByRole('button', { name: 'Ниже: Подтверждённый игрок' }));
    // элемент стал последним: «Ниже» недоступна — фокус на «Выше» того же элемента
    await waitFor(() =>
      expect(
        within(list).getByRole('button', { name: 'Выше: Подтверждённый игрок' }),
      ).toHaveFocus(),
    );
    expect(screen.getByTestId('badges-order-live')).toHaveTextContent(
      'Подтверждённый игрок: позиция 2 из 2',
    );
    expect(screen.getByTestId('badges-order-live')).toHaveAttribute('aria-live', 'polite');
    await user.click(within(list).getByRole('button', { name: 'Выше: Подтверждённый игрок' }));
    await waitFor(() =>
      expect(
        within(list).getByRole('button', { name: 'Ниже: Подтверждённый игрок' }),
      ).toHaveFocus(),
    );
    expect(screen.getByTestId('badges-order-live')).toHaveTextContent(
      'Подтверждённый игрок: позиция 1 из 2',
    );
  });

  it('ошибка шага: называет шаг, перечитывает данные', async () => {
    const user = userEvent.setup();
    mocks.put.mockImplementation(async (path: string) => {
      if (path === '/users/me/awards/order') throw new Error('сбой сети');
      return { success: true };
    });
    render(<BadgesSettingsPage />, { wrapper: Providers });
    await screen.findByTestId('badges-order');
    const callsBefore = mocks.get.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    const status = await screen.findByText(/Не удалось сохранить: порядок наград/);
    expect(status).toHaveTextContent('Предыдущие шаги (1 из 3) уже сохранены');
    expect(mocks.put).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(mocks.get.mock.calls.length).toBeGreaterThanOrEqual(callsBefore + 3),
    );
  });

  it('истёкший или отозванный бейдж: понятная ошибка и refetch', async () => {
    const user = userEvent.setup();
    mocks.put.mockImplementation(async (path: string) => {
      if (path === '/users/me/badges/order') throw new ApiError(404, ['Бейдж не найден']);
      return { success: true };
    });
    render(<BadgesSettingsPage />, { wrapper: Providers });
    await screen.findByTestId('badges-order');
    const callsBefore = mocks.get.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    const status = await screen.findByText(/Не удалось сохранить: порядок бейджей/);
    expect(status).toHaveTextContent('Один из бейджей истёк или отозван');
    await waitFor(() =>
      expect(mocks.get.mock.calls.length).toBeGreaterThanOrEqual(callsBefore + 3),
    );
  });

  it('обращается только к существующим маршрутам API (без GET /users/me)', async () => {
    const existing = ['/users/me/badges', '/users/me/awards', '/users/me/profile'];
    render(<BadgesSettingsPage />, { wrapper: Providers });
    const list = await screen.findByTestId('badges-order');
    expect(within(list).getByRole('button', { name: 'Ниже: Подтверждённый игрок' })).toBeEnabled();
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('/users/me/profile'));
    const called = mocks.get.mock.calls.map((call) => call[0] as string);
    expect(called.filter((path) => !existing.includes(path))).toEqual([]);
    expect(called).not.toContain('/users/me');
    expect(screen.queryByText(/Не удалось загрузить/)).toBeNull();
  });
});
