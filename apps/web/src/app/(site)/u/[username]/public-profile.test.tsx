import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import PublicProfilePage from './page';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), username: 'Steve' }));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post, put: mocks.put },
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ username: mocks.username }),
  usePathname: () => `/u/${mocks.username}`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const STATS = { views: 3, likes: 2, dislikes: 1, myReaction: null };

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset().mockResolvedValue(STATS);
  mocks.put.mockReset();
  mocks.username = 'Steve';
  useAuthStore.setState({ status: 'anonymous', user: null });
});

describe('Публичный профиль /u/[username]', () => {
  it('показывает только отданные сервером поля; ссылки соцсетей — только https', async () => {
    mocks.get.mockImplementation(async (path: string) =>
      path.endsWith('/public')
        ? {
            id: 'u1',
            username: 'Steve',
            statusText: 'Строю замок',
            bio: 'Люблю редстоун',
            city: 'Москва',
            createdAt: '2025-01-01T00:00:00.000Z',
            socialLinks: [
              { platform: 'YOUTUBE', value: 'https://youtube.com/@steve' },
              { platform: 'TELEGRAM', value: '@steve' },
            ],
          }
        : { username: 'Steve', hidden: false, roles: [] },
    );
    render(<PublicProfilePage />, { wrapper: Providers });
    const page = await screen.findByTestId('public-profile');
    expect(page).toHaveTextContent('Строю замок');
    expect(page).toHaveTextContent('Люблю редстоун');
    expect(page).toHaveTextContent('Москва');
    expect(screen.getByRole('link', { name: 'https://youtube.com/@steve' })).toHaveAttribute(
      'rel',
      'noopener noreferrer nofollow',
    );
    expect(screen.queryByRole('link', { name: '@steve' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Редактировать профиль' })).toBeNull();
  });

  it('скрытый или несуществующий профиль — понятное состояние', async () => {
    mocks.get.mockRejectedValue(new ApiError(404, ['Профиль не найден']));
    render(<PublicProfilePage />, { wrapper: Providers });
    expect(await screen.findByText('Профиль не найден или скрыт')).toBeInTheDocument();
  });

  it('свой профиль — кнопка «Редактировать профиль»', async () => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: 'u1', username: 'steve' } as never,
    });
    mocks.get.mockImplementation(async (path: string) =>
      path.endsWith('/public') ? { id: 'u1', username: 'Steve' } : { username: 'Steve', roles: [] },
    );
    render(<PublicProfilePage />, { wrapper: Providers });
    expect(await screen.findByRole('link', { name: 'Редактировать профиль' })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('B5: просмотр — один раз и не владельцем; лайк; привязанные аккаунты без ID; 3D-голова при скине', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: 'viewer', username: 'alex' } as never,
    });
    mocks.username = 'younaxo';
    mocks.get.mockImplementation(async (path: string) => {
      if (path.endsWith('/public')) {
        return {
          id: 'u1',
          username: 'younaxo_',
          stats: STATS,
          connectedAccounts: [{ provider: 'discord', name: 'steve_discord' }],
          socialLinks: [{ platform: 'GITHUB', value: 'https://github.com/steve' }],
        };
      }
      if (path.endsWith('/skin')) {
        return { available: true, model: 'classic', cape: false, version: 'v1' };
      }
      return { username: 'younaxo_', hidden: false, roles: [] };
    });
    mocks.put.mockResolvedValue({ ...STATS, likes: 3, myReaction: 'LIKE' });
    render(<PublicProfilePage />, { wrapper: Providers });
    const engagement = await screen.findByTestId('profile-engagement');
    expect(engagement).toHaveTextContent('3');
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post).toHaveBeenCalledWith('/users/younaxo/view');
    await user.click(screen.getByRole('button', { name: 'Нравится: 2' }));
    expect(mocks.put).toHaveBeenCalledWith('/users/younaxo/reaction', { type: 'LIKE' });
    expect(await screen.findByRole('button', { name: 'Нравится: 3' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const connected = screen.getByRole('region', { name: 'Привязанные аккаунты' });
    expect(connected).toHaveTextContent('Discord:steve_discord');
    expect(screen.getByRole('link', { name: /github\.com\/steve/ })).toBeInTheDocument();
    expect(await screen.findByTestId('minecraft-head')).toBeInTheDocument();
  });

  it('B5: свой профиль — круглая кнопка редактирования, просмотр не отправляется, оценить нельзя', async () => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: 'u1', username: 'steve' } as never,
    });
    mocks.get.mockImplementation(async (path: string) =>
      path.endsWith('/public')
        ? { id: 'u1', username: 'Steve', stats: STATS }
        : path.endsWith('/skin')
          ? { available: false, model: null, cape: false, version: null }
          : { username: 'Steve', roles: [] },
    );
    render(<PublicProfilePage />, { wrapper: Providers });
    const like = await screen.findByRole('button', { name: 'Нравится: 2' });
    expect(like).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('link', { name: 'Редактировать профиль' }).className).toMatch(
      /rounded-full/,
    );
    expect(mocks.post).not.toHaveBeenCalled();
    expect(screen.queryByTestId('minecraft-head')).toBeNull();
  });
});
