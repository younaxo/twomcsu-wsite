import type { ActivityDto } from '@twomc/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import ActivityPage from '@/app/(site)/feed/[id]/page';
import { ActivityFeed } from './activity-feed';
import { ActivityPrivacy } from './activity-privacy';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  id: 'a1',
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.delete },
}));
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: mocks.id }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/feed',
}));

const ACTIVITY: ActivityDto = {
  id: 'a1',
  type: 'FRIENDSHIP_STARTED',
  title: 'Новая дружба',
  description: null,
  visibility: 'PUBLIC',
  createdAt: '2026-10-10T20:00:00.000Z',
  user: { id: 'u1', username: 'Steve', tag: 'Steve#0001', avatar: null },
  friend: { username: 'Alex' },
  reactions: [{ key: 'fire', count: 2 }],
  myReaction: 'fire',
  commentsCount: 1,
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
  for (const fn of [mocks.get, mocks.post, mocks.patch, mocks.delete]) fn.mockReset();
  for (const fn of Object.values(mocks.toast)) fn.mockReset();
  mocks.post.mockResolvedValue({});
  mocks.delete.mockResolvedValue({});
  mocks.id = 'a1';
  useAuthStore.setState({ status: 'authenticated', user: { id: 'me' } as never });
});

describe('Лента активности (срез 2.6)', () => {
  it('карточка: «Теперь дружит с …», реакции иконками, своя реакция, ссылка на комментарии', async () => {
    const user = userEvent.setup();
    mocks.get.mockResolvedValue({ items: [ACTIVITY], total: 1, page: 1, limit: 20 });
    render(<ActivityFeed emptyText="пусто" />, { wrapper: Providers });
    const card = await screen.findByTestId('activity-card');
    expect(card).toHaveTextContent('Теперь дружит с Alex');
    expect(within(card).getByRole('link', { name: 'Alex' })).toHaveAttribute('href', '/u/Alex');
    expect(within(card).getByRole('button', { name: 'Огонь: 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(card).getByRole('link', { name: 'Комментарии: 1' })).toHaveAttribute(
      'href',
      '/feed/a1',
    );
    await user.click(within(card).getByRole('button', { name: 'Сердце' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/activity/a1/reactions', { emoji: 'heart' }),
    );
  });

  it('пустая лента — честное состояние', async () => {
    mocks.get.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    render(<ActivityFeed username="Steve" emptyText="У игрока пока нет активности." />, {
      wrapper: Providers,
    });
    expect(await screen.findByText('У игрока пока нет активности.')).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith('/activity/feed/user/Steve', expect.anything());
  });

  it('запись: недоступная — «не найдена»; комментарии, отправка и удаление с подтверждением', async () => {
    const user = userEvent.setup();
    mocks.get.mockRejectedValue(new ApiError(404, ['Запись активности не найдена']));
    const hidden = render(<ActivityPage />, { wrapper: Providers });
    expect(await screen.findByText('Запись не найдена')).toBeInTheDocument();
    hidden.unmount();

    mocks.get.mockImplementation(async (path: string) =>
      path.endsWith('/comments')
        ? {
            items: [
              {
                id: 'c1',
                content: 'Поздравляю!',
                createdAt: '2026-10-10T20:05:00.000Z',
                author: { id: 'me', username: 'younaxo_', tag: 'younaxo_#0002', avatar: null },
                canDelete: true,
              },
            ],
            total: 1,
            page: 1,
            limit: 20,
          }
        : ACTIVITY,
    );
    render(<ActivityPage />, { wrapper: Providers });
    expect(await screen.findByTestId('activity-details')).toHaveTextContent('Теперь дружит с Alex');
    expect(await screen.findByTestId('activity-comment')).toHaveTextContent('Поздравляю!');
    await user.type(screen.getByLabelText('Новый комментарий'), 'И я');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/activity/a1/comments', { content: 'И я' }),
    );
    await user.click(screen.getByRole('button', { name: 'Удалить комментарий' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(mocks.delete).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/activity/comments/c1'));
  });

  it('приватность: только реальные настройки — дружба и уведомления о комментариях', async () => {
    const user = userEvent.setup();
    mocks.get.mockResolvedValue({
      showFriendships: true,
      friendshipsVisibility: 'FRIENDS',
      notifyOnComment: true,
    });
    mocks.patch.mockResolvedValue({
      showFriendships: false,
      friendshipsVisibility: 'FRIENDS',
      notifyOnComment: true,
    });
    render(<ActivityPrivacy />, { wrapper: Providers });
    const section = await screen.findByTestId('activity-privacy');
    expect(await within(section).findAllByRole('switch')).toHaveLength(2);
    expect(section).not.toHaveTextContent(/покупк|достижени/i);
    await user.click(within(section).getByRole('switch', { name: /Показывать новые дружбы/ }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/activity/settings', { showFriendships: false }),
    );
  });
});
