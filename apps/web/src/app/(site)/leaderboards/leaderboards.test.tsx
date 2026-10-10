import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import LeaderboardsPage from './page';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/leaderboards',
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

const entry = (rank: number, username: string, value: number) => ({
  rank,
  userId: `u${rank}`,
  username,
  avatar: null,
  value,
});

beforeEach(() => {
  mocks.get.mockReset();
  mocks.get.mockImplementation((path: string) =>
    Promise.resolve(
      path === '/leaderboards'
        ? {
            playtime: [entry(1, 'Steve', 125), entry(2, 'Alex', 60)],
            kills: [],
            coins: [],
            achievements: [entry(1, 'Steve', 3)],
            purchases: [],
          }
        : {},
    ),
  );
});

describe('Рейтинги (срез 5.8)', () => {
  it('время в игре: места, ссылки на профиль, часы и минуты', async () => {
    render(<LeaderboardsPage />, { wrapper: Providers });
    const board = await screen.findByTestId('leaderboard');
    const rows = within(board).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByRole('link', { name: 'Steve' })).toHaveAttribute(
      'href',
      '/u/Steve',
    );
    expect(rows[0]).toHaveTextContent('2 ч 5 мин');
  });

  it('пустой игровой рейтинг — честное состояние; монеты ведут на голосование', async () => {
    const user = userEvent.setup();
    render(<LeaderboardsPage />, { wrapper: Providers });
    await screen.findByTestId('leaderboard');
    await user.click(screen.getByRole('radio', { name: 'Убийства' }));
    expect(screen.getByText(/Статистика из игры появится/)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Монеты' }));
    expect(screen.getByRole('link', { name: 'Голосование' })).toHaveAttribute('href', '/vote');
  });
});
