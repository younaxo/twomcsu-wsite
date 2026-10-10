import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import PublicProfilePage from './page';

const mocks = vi.hoisted(() => ({ get: vi.fn(), username: 'Steve' }));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get },
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ username: mocks.username }),
  usePathname: () => `/u/${mocks.username}`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

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
});
