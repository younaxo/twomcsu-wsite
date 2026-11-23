import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import PlayersPage from './page';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get },
}));

function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const result = (items: { username: string; tag: string | null; avatar: string | null }[]) => ({
  items,
  page: 1,
  limit: 20,
  hasMore: false,
});

describe('Игроки: поиск (Q73)', () => {
  beforeEach(() => {
    mocks.get.mockReset();
  });

  it('до 2 символов запрос не уходит, показывается подсказка', async () => {
    const user = userEvent.setup();
    render(<PlayersPage />, { wrapper: Providers });
    await user.type(screen.getByLabelText('Ник игрока'), 'a');
    expect(screen.getByText('Введите минимум 2 символа.')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('после паузы ищет и показывает карточки со ссылкой на профиль', async () => {
    mocks.get.mockResolvedValue(result([{ username: 'Steve', tag: 'Steve#0002', avatar: null }]));
    const user = userEvent.setup();
    render(<PlayersPage />, { wrapper: Providers });
    await user.type(screen.getByLabelText('Ник игрока'), 'ste');
    const link = await screen.findByRole('link', { name: /Steve/ });
    expect(link).toHaveAttribute('href', '/u/Steve');
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.get).toHaveBeenCalledWith('/users/search', { query: { q: 'ste', limit: 20 } });
    await waitFor(() =>
      expect(screen.getByTestId('players-status')).toHaveTextContent('Найдено игроков: 1'),
    );
  });

  it('пустая выдача — понятное пустое состояние', async () => {
    mocks.get.mockResolvedValue(result([]));
    const user = userEvent.setup();
    render(<PlayersPage />, { wrapper: Providers });
    await user.type(screen.getByLabelText('Ник игрока'), 'zzz');
    expect(
      await screen.findByText('Проверьте ник. Закрытые профили в поиске не показываются.'),
    ).toBeInTheDocument();
  });

  it('429 — сообщение про лимит запросов', async () => {
    mocks.get.mockImplementation(() => {
      return Promise.reject(new ApiError(429, ['Too Many Requests']));
    });
    const user = userEvent.setup();
    render(<PlayersPage />, { wrapper: Providers });
    await user.type(screen.getByLabelText('Ник игрока'), 'abc');
    await waitFor(() => expect(mocks.get).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await screen.findByText('Слишком много запросов')).toBeInTheDocument();
  });

  it('другая ошибка — состояние ошибки с повтором', async () => {
    mocks.get.mockImplementation(() => {
      return Promise.reject(new ApiError(500, ['boom']));
    });
    const user = userEvent.setup();
    render(<PlayersPage />, { wrapper: Providers });
    await user.type(screen.getByLabelText('Ник игрока'), 'abc');
    expect(await screen.findByRole('button', { name: /Повторить/ })).toBeInTheDocument();
  });
});
