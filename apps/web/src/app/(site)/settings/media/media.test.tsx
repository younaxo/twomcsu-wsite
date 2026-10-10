import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/lib/auth/store';
import MediaRequestPage from './page';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post },
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/media',
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

beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue([]);
  mocks.post.mockReset().mockResolvedValue({});
  useAuthStore.setState({ status: 'authenticated', user: { id: 'u1', username: 'p' } as never });
});

describe('Настройки → Медиа', () => {
  it('отправляет заявку с площадкой и ссылкой', async () => {
    const user = userEvent.setup();
    render(<MediaRequestPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('radio', { name: 'Twitch' }));
    await user.type(
      screen.getByRole('textbox', { name: /Ссылка на канал/ }),
      'https://twitch.tv/p',
    );
    await user.click(screen.getByRole('button', { name: 'Отправить заявку' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/users/me/media-request', {
        mediaGroup: 'TWITCH',
        channelUrl: 'https://twitch.tv/p',
        description: undefined,
      }),
    );
  });

  it('пока заявка на рассмотрении — новую отправить нельзя', async () => {
    mocks.get.mockResolvedValue([
      {
        id: 'r1',
        mediaGroup: 'YOUTUBE',
        channelUrl: 'https://youtube.com/@p',
        description: null,
        status: 'PENDING',
        reviewNote: null,
        createdAt: '2026-10-01T10:00:00.000Z',
      },
    ]);
    const user = userEvent.setup();
    render(<MediaRequestPage />, { wrapper: Providers });
    expect(await screen.findByTestId('media-requests')).toHaveTextContent('На рассмотрении');
    await user.type(screen.getByRole('textbox', { name: /Ссылка на канал/ }), 'https://x.example');
    expect(screen.getByRole('button', { name: 'Отправить заявку' })).toBeDisabled();
  });
});
