import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuthStore } from '@/lib/auth/store';
import VotePage from './page';

const mocks = vi.hoisted(() => ({ get: vi.fn(), sites: [] as unknown[] }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/vote',
}));

const SITE = {
  id: 's1',
  slug: 'mcsl',
  name: 'MC Server List',
  description: 'Топ серверов',
  url: 'https://example.com/vote',
  logoUrl: null,
  rewardCoins: 5,
  cooldownHours: 24,
  nextVoteAt: null,
  canVoteNow: null,
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
  mocks.get.mockReset();
  mocks.get.mockImplementation((path: string) =>
    Promise.resolve(path === '/voting' ? mocks.sites : {}),
  );
  useAuthStore.setState({ status: 'anonymous', user: null } as never);
});

describe('Голосование (срез 3.7)', () => {
  it('гость: награда, cooldown, внешняя ссылка; таймера нет', async () => {
    mocks.sites = [SITE];
    render(<VotePage />, { wrapper: Providers });
    const site = await screen.findByTestId('vote-site');
    expect(within(site).getByText('+5 монет')).toBeInTheDocument();
    expect(within(site).getByText('раз в 24 часа')).toBeInTheDocument();
    const link = within(site).getByRole('link', { name: /Проголосовать/ });
    expect(link).toHaveAttribute('href', 'https://example.com/vote');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(site).queryByTestId('vote-wait')).toBeNull();
    expect(screen.getByTestId('vote-hint')).toHaveTextContent('Войдите');
  });

  it('вошедший: ник в подсказке, таймер до следующего голоса', async () => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: 'me', username: 'Steve' } as never,
    });
    mocks.sites = [
      {
        ...SITE,
        nextVoteAt: new Date(Date.now() + 2 * 3_600_000 + 5 * 60_000).toISOString(),
        canVoteNow: false,
      },
      { ...SITE, id: 's2', name: 'Top Craft', canVoteNow: true },
    ];
    render(<VotePage />, { wrapper: Providers });
    const [first, second] = await screen.findAllByTestId('vote-site');
    expect(within(first!).getByTestId('vote-wait')).toHaveTextContent(/Через 02:0[45]:\d\d/);
    expect(within(second!).getByText('Можно голосовать')).toBeInTheDocument();
    expect(screen.getByTestId('vote-hint')).toHaveTextContent('Steve');
  });

  it('небезопасная ссылка администратора не рендерится; пусто — понятное состояние', async () => {
    mocks.sites = [{ ...SITE, url: 'javascript:alert(1)', logoUrl: 'javascript:alert(1)' }];
    const view = render(<VotePage />, { wrapper: Providers });
    const site = await screen.findByTestId('vote-site');
    expect(within(site).queryByRole('link')).toBeNull();
    expect(site.querySelector('img')).toBeNull();
    view.unmount();

    mocks.sites = [];
    render(<VotePage />, { wrapper: Providers });
    expect(await screen.findByText('Сайты для голосования пока не подключены')).toBeInTheDocument();
  });
});
