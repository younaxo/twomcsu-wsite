import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import AchievementPage from './[slug]/page';
import AchievementsPage from './page';

const mocks = vi.hoisted(() => ({ get: vi.fn(), routes: {} as Record<string, unknown> }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get },
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'friends-10' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/achievements',
}));

const ACH = {
  id: 'a1',
  slug: 'friends-10',
  name: 'Душа компании',
  description: 'Добавьте 10 друзей',
  iconUrl: 'javascript:alert(1)',
  category: 'SOCIAL',
  rarity: 'RARE',
  isSecret: false,
  conditionValue: 10,
  rewardRubies: 5,
  rewardTitle: null,
  unlockedCount: 3,
  currentProgress: 4,
  isCompleted: false,
  completedAt: null,
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
  mocks.routes = {};
  mocks.get.mockImplementation(async (path: string) => {
    const value = mocks.routes[path];
    if (value instanceof Error) throw value;
    return value ?? {};
  });
  useAuthStore.setState({ status: 'authenticated', user: { id: 'me' } as never });
});

describe('Достижения (срез 5.7)', () => {
  it('каталог: прогресс вошедшего, ссылка на карточку, небезопасная иконка не рендерится', async () => {
    mocks.routes['/achievements'] = [ACH];
    render(<AchievementsPage />, { wrapper: Providers });
    const list = await screen.findByTestId('achievements-list');
    expect(within(list).getByRole('link')).toHaveAttribute('href', '/achievements/friends-10');
    expect(within(list).getByText('4 из 10')).toBeInTheDocument();
    expect(list.querySelector('img')).toBeNull();
  });

  it('фильтр «Полученные» уходит в запрос', async () => {
    const user = userEvent.setup();
    mocks.routes['/achievements'] = [];
    render(<AchievementsPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('radio', { name: 'Полученные' }));
    await waitFor(() =>
      expect(mocks.get).toHaveBeenLastCalledWith('/achievements', {
        query: { filter: 'completed' },
      }),
    );
    expect(
      await screen.findByText('Вы пока не получили достижений в этой категории.'),
    ).toBeInTheDocument();
  });

  it('карточка: награда и число получивших; секретное/скрытое — «не найдено»', async () => {
    mocks.routes['/achievements/friends-10'] = ACH;
    const view = render(<AchievementPage />, { wrapper: Providers });
    const card = await screen.findByTestId('achievement');
    expect(card).toHaveTextContent('Награда: +5 рубинов');
    expect(card).toHaveTextContent('Получили 3 игрока');
    view.unmount();

    mocks.routes['/achievements/friends-10'] = new ApiError(404, ['Достижение не найдено']);
    render(<AchievementPage />, { wrapper: Providers });
    expect(await screen.findByText('Достижение не найдено')).toBeInTheDocument();
  });
});
