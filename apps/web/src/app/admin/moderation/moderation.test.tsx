import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api/errors';
import CommentReportsPage from './comments/page';
import ProfileReportsPage from './profiles/page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  granted: new Set<string>(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch },
}));
vi.mock('@/lib/auth/use-permissions', () => ({
  usePermissions: () => ({
    can: (requirement: string | string[]) =>
      (Array.isArray(requirement) ? requirement : [requirement]).some((key) =>
        mocks.granted.has(key),
      ),
  }),
}));
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/moderation/comments',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const COMMENT_REPORT = {
  id: 'cr1',
  commentId: 'c1',
  reporterId: 'u9',
  reason: 'SPAM',
  description: 'Реклама сервера',
  status: 'PENDING',
  reviewedBy: null,
  reviewedAt: null,
  reviewNote: null,
  createdAt: '2026-11-20T10:00:00.000Z',
  comment: { id: 'c1', content: 'Заходи на мой сервер', isDeleted: false },
};
const DONE_REPORT = {
  ...COMMENT_REPORT,
  id: 'cr2',
  status: 'RESOLVED',
  reviewedAt: '2026-11-21T10:00:00.000Z',
  reviewNote: 'Удалено',
};
const PROFILE_REPORT = {
  id: 'pr1',
  profileId: 'p1',
  reporterId: 'u9',
  reason: 'HARASSMENT',
  description: null,
  status: 'PENDING',
  createdAt: '2026-11-20T10:00:00.000Z',
  profile: { id: 'p1', username: 'Target', passwordHash: 'SECRET-HASH', email: 'leak@example.com' },
  reporter: { id: 'u9', username: 'Reporter', email: 'reporter@example.com' },
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
  mocks.granted.clear();
  for (const fn of [mocks.get, mocks.post, mocks.patch]) fn.mockReset();
  mocks.patch.mockResolvedValue({});
  mocks.post.mockResolvedValue({ success: true });
  mocks.get.mockImplementation(async (path: string) => {
    if (path === '/admin/comment-reports') return [COMMENT_REPORT, DONE_REPORT];
    if (path === '/admin/profile-reports') return [PROFILE_REPORT];
    return [];
  });
});

describe('Очереди жалоб на контент', () => {
  it('без права просмотра — экран 403, запрос не уходит', () => {
    render(<CommentReportsPage />, { wrapper: Providers });
    expect(screen.queryByTestId('content-reports')).toBeNull();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('комментарии: по умолчанию фильтр «Ожидают», текст как текст, действия по праву edit', async () => {
    const user = userEvent.setup();
    mocks.granted.add('comment_reports.view');
    render(<CommentReportsPage />, { wrapper: Providers });
    const rows = within(await screen.findByTestId('content-reports')).getAllByRole('listitem');
    expect(mocks.get).toHaveBeenCalledWith(
      '/admin/comment-reports',
      expect.objectContaining({ query: { status: 'PENDING' } }),
    );
    expect(rows[0]).toHaveTextContent('Заходи на мой сервер');
    expect(rows[0]).toHaveTextContent('Спам');
    expect(within(rows[0]!).queryByRole('button', { name: 'Принять' })).toBeNull();
    expect(within(rows[1]!).getByText(/Рассмотрена/)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Все' }));
    await waitFor(() =>
      expect(mocks.get).toHaveBeenLastCalledWith(
        '/admin/comment-reports',
        expect.objectContaining({ query: { status: undefined } }),
      ),
    );
  });

  it('принять жалобу: подтверждение с заметкой, PATCH со статусом', async () => {
    const user = userEvent.setup();
    mocks.granted.add('comment_reports.view');
    mocks.granted.add('comment_reports.edit');
    render(<CommentReportsPage />, { wrapper: Providers });
    const rows = within(await screen.findByTestId('content-reports')).getAllByRole('listitem');
    await user.click(within(rows[0]!).getByRole('button', { name: 'Принять' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(mocks.patch).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText(/Заметка/), 'Спам подтверждён');
    await user.click(within(dialog).getByRole('button', { name: 'Принять' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/admin/comment-reports/cr1', {
        status: 'RESOLVED',
        reviewNote: 'Спам подтверждён',
      }),
    );
    expect(mocks.toast.success).toHaveBeenCalledWith('Жалоба принята');
  });

  it('отклонить жалобу — статус REJECTED', async () => {
    const user = userEvent.setup();
    mocks.granted.add('comment_reports.view');
    mocks.granted.add('comment_reports.edit');
    render(<CommentReportsPage />, { wrapper: Providers });
    const rows = within(await screen.findByTestId('content-reports')).getAllByRole('listitem');
    await user.click(within(rows[0]!).getByRole('button', { name: 'Отклонить' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Отклонить' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/admin/comment-reports/cr1', {
        status: 'REJECTED',
      }),
    );
  });

  it('жёсткое удаление комментария: только по праву, только после подтверждения', async () => {
    const user = userEvent.setup();
    mocks.granted.add('comment_reports.view');
    mocks.granted.add('comments.hard_delete');
    render(<CommentReportsPage />, { wrapper: Providers });
    const rows = within(await screen.findByTestId('content-reports')).getAllByRole('listitem');
    await user.click(within(rows[0]!).getByRole('button', { name: 'Удалить комментарий' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('необратимо');
    expect(mocks.post).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Удалить навсегда' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/moderation/comments/c1/hard-delete', {}),
    );
  });

  it('профили: только имя из белого списка, чужие поля пользователей не выводятся', async () => {
    mocks.granted.add('profile_reports.view');
    render(<ProfileReportsPage />, { wrapper: Providers });
    const list = await screen.findByTestId('content-reports');
    expect(list).toHaveTextContent('Target');
    expect(list).toHaveTextContent('Пожаловался: Reporter');
    expect(list).toHaveTextContent('Оскорбления');
    expect(document.body).not.toHaveTextContent('SECRET-HASH');
    expect(document.body).not.toHaveTextContent('example.com');
  });

  it('пустая очередь, ошибка и 403 — честные состояния', async () => {
    mocks.granted.add('profile_reports.view');
    mocks.get.mockResolvedValueOnce([]);
    const { unmount } = render(<ProfileReportsPage />, { wrapper: Providers });
    expect(await screen.findByText('Жалоб на профили нет')).toBeInTheDocument();
    unmount();

    mocks.get.mockRejectedValueOnce(new ApiError(403, ['Нет доступа']));
    render(<ProfileReportsPage />, { wrapper: Providers });
    expect(await screen.findByText('Недостаточно прав')).toBeInTheDocument();
  });
});
