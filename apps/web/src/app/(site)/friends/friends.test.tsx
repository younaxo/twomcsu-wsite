import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FriendControls } from '@/components/friends/friend-button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import FriendsPage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  replace: vi.fn(),
  search: '',
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post, delete: mocks.delete },
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/friends',
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

const STEVE = { id: 'u2', username: 'Steve', tag: 'Steve#0002', avatar: null };
const ALEX = { id: 'u3', username: 'Alex', tag: 'Alex#0003', avatar: null };

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

function serve(data: Partial<Record<string, unknown>> = {}) {
  mocks.get.mockImplementation(async (path: string) => {
    if (path === '/friends') return data.friends ?? [];
    if (path === '/friends/requests/incoming') return data.incoming ?? [];
    if (path === '/friends/requests/outgoing') return data.outgoing ?? [];
    if (path === '/friends/blocked') return data.blocked ?? [];
    if (path === '/friends/requests/incoming/count') return { count: data.count ?? 0 };
    throw new ApiError(404, ['Не найдено']);
  });
}

beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset().mockResolvedValue({});
  mocks.delete.mockReset().mockResolvedValue({ success: true });
  mocks.replace.mockReset();
  mocks.toastError.mockReset();
  mocks.toastSuccess.mockReset();
  mocks.search = '';
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'u1', username: 'younaxo_' } as never,
  });
});

describe('Страница «Друзья» (срез 2.1)', () => {
  it('список друзей: ник#тег, дата дружбы; удаление — только после подтверждения', async () => {
    const user = userEvent.setup();
    serve({ friends: [{ user: STEVE, since: '2026-10-01T10:00:00.000Z' }] });
    render(<FriendsPage />, { wrapper: Providers });
    const row = await screen.findByTestId('friend-row');
    expect(row).toHaveTextContent('Steve#0002');
    expect(row).toHaveTextContent('Друзья с');
    await user.click(within(row).getByRole('button', { name: 'Удалить' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Удалить из друзей?');
    expect(mocks.delete).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/friends/u2'));
  });

  it('пусто — честное пустое состояние, без выдуманных друзей', async () => {
    serve();
    render(<FriendsPage />, { wrapper: Providers });
    expect(await screen.findByText('Друзей пока нет')).toBeInTheDocument();
    expect(screen.queryByTestId('friend-row')).toBeNull();
  });

  it('?tab=incoming: счётчик на вкладке, «Принять» и «Отклонить»', async () => {
    const user = userEvent.setup();
    mocks.search = 'tab=incoming';
    serve({
      count: 2,
      incoming: [
        { id: 'r1', createdAt: '2026-10-09T10:00:00.000Z', user: STEVE },
        { id: 'r2', createdAt: '2026-10-09T11:00:00.000Z', user: ALEX },
      ],
    });
    render(<FriendsPage />, { wrapper: Providers });
    expect(await screen.findByTestId('friends-incoming-count')).toHaveTextContent('2');
    const rows = await screen.findAllByTestId('friend-row');
    expect(rows).toHaveLength(2);
    await user.click(within(rows[0]!).getByRole('button', { name: 'Принять' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/friends/requests/r1/accept'));
    await user.click(within(rows[1]!).getByRole('button', { name: 'Отклонить' }));
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/friends/requests/r2'));
  });

  it('исходящие — «Отменить»; заблокированные — «Разблокировать»; смена вкладки — в адресе', async () => {
    const user = userEvent.setup();
    mocks.search = 'tab=outgoing';
    serve({
      outgoing: [{ id: 'r3', createdAt: '2026-10-09T10:00:00.000Z', user: ALEX }],
      blocked: [{ user: STEVE, blockedAt: '2026-10-08T10:00:00.000Z' }],
    });
    const view = render(<FriendsPage />, { wrapper: Providers });
    const row = await screen.findByTestId('friend-row');
    await user.click(within(row).getByRole('button', { name: 'Отменить' }));
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/friends/requests/r3'));
    await user.click(screen.getByRole('tab', { name: 'Заблокированные' }));
    expect(mocks.replace).toHaveBeenCalledWith('/friends?tab=blocked', { scroll: false });
    view.unmount();

    mocks.search = 'tab=blocked';
    render(<FriendsPage />, { wrapper: Providers });
    const blocked = await screen.findByTestId('friend-row');
    expect(blocked).toHaveTextContent('В блокировке с');
    await user.click(within(blocked).getByRole('button', { name: 'Разблокировать' }));
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/friends/block/u2'));
  });
});

describe('FriendButton (кнопка на профиле)', () => {
  const controls = (status: string, requestId: string | null = null) =>
    render(
      <FriendControls
        username="Steve"
        relation={{ userId: 'u2', status: status as never, requestId }}
      />,
      { wrapper: Providers },
    );

  it('нет связи — «В друзья»; ошибка политики заявок показывается по-человечески', async () => {
    const user = userEvent.setup();
    mocks.post.mockRejectedValueOnce(
      new ApiError(403, ['Пользователь не принимает заявки в друзья']),
    );
    controls('NONE');
    await user.click(screen.getByRole('button', { name: 'В друзья' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/friends/requests/Steve'));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('Пользователь не принимает заявки в друзья'),
    );
  });

  it('исходящая — «Отменить заявку»; входящая — «Принять» / «Отклонить»', async () => {
    const user = userEvent.setup();
    const outgoing = controls('OUTGOING', 'r9');
    await user.click(screen.getByRole('button', { name: 'Отменить заявку' }));
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/friends/requests/r9'));
    outgoing.unmount();
    controls('INCOMING', 'r8');
    await user.click(screen.getByRole('button', { name: 'Принять заявку' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/friends/requests/r8/accept'));
    expect(screen.getByRole('button', { name: 'Отклонить' })).toBeInTheDocument();
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('Теперь вы друзья'));
  });

  it('друзья — метка и «Удалить из друзей» в меню; блокировка — с подтверждением', async () => {
    const user = userEvent.setup();
    controls('FRIENDS');
    expect(screen.getByTestId('friend-status')).toHaveTextContent('В друзьях');
    await user.click(screen.getByRole('button', { name: 'Ещё действия' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Заблокировать' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Заблокировать Steve?');
    expect(mocks.post).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Заблокировать' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/friends/block/u2'));

    await user.click(screen.getByRole('button', { name: 'Ещё действия' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить из друзей' }));
    const remove = await screen.findByRole('alertdialog');
    await user.click(within(remove).getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/friends/u2'));
  });

  it('заблокирован мной — только «Разблокировать», без меню', async () => {
    const user = userEvent.setup();
    controls('BLOCKED');
    expect(screen.queryByRole('button', { name: 'Ещё действия' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Разблокировать' }));
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/friends/block/u2'));
  });
});
