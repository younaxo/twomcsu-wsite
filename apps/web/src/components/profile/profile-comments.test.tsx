import type { ProfileCommentDto, ProfileCommentsPage } from '@twomc/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ProfileComments } from './profile-comments';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.delete },
}));
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }));

function comment(overrides: Partial<ProfileCommentDto> = {}): ProfileCommentDto {
  return {
    id: 'c1',
    parentId: null,
    content: '<b>Привет</b>\nвторая строка',
    createdAt: '2026-10-10T20:00:00.000Z',
    isEdited: false,
    mentions: [],
    author: { id: 'u2', username: 'Steve', tag: 'Steve#0002', avatar: null },
    reactions: [{ key: 'heart', count: 2 }],
    myReaction: null,
    canEdit: false,
    canDelete: false,
    ...overrides,
  };
}

function page(overrides: Partial<ProfileCommentsPage> = {}): ProfileCommentsPage {
  return {
    items: [comment()],
    total: 1,
    page: 1,
    limit: 20,
    commentsEnabled: true,
    canComment: true,
    ...overrides,
  };
}

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
  mocks.delete.mockResolvedValue({ success: true });
});

describe('Комментарии профиля (срез 2.3)', () => {
  it('текст — без HTML, переносы строк; реакции — иконки со счётчиком; отправка комментария', async () => {
    const user = userEvent.setup();
    mocks.get.mockResolvedValue(page());
    render(<ProfileComments username="younaxo_" signedIn />, { wrapper: Providers });
    const content = await screen.findByTestId('comment-content');
    expect(content).toHaveTextContent('<b>Привет</b>');
    expect(content.querySelector('b')).toBeNull();
    expect(content.className).toMatch(/whitespace-pre-wrap/);
    expect(screen.getByRole('button', { name: 'Сердце: 2' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    // Иконки — lucide (SVG), не emoji (ADR-0085).
    expect(screen.getByTestId('comment-reactions').querySelector('svg')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Сердце: 2' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/comments/c1/reactions', { emoji: 'heart' }),
    );

    await user.type(screen.getByLabelText('Новый комментарий'), '  Отличный профиль  ');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/users/younaxo_/comments', {
        content: 'Отличный профиль',
      }),
    );
  });

  it('права: гостю — «Войдите», запрет политикой, отключено владельцем; пусто — честно', async () => {
    mocks.get.mockResolvedValue(page({ canComment: false, items: [], total: 0 }));
    const guest = render(<ProfileComments username="younaxo_" signedIn={false} />, {
      wrapper: Providers,
    });
    expect(await screen.findByTestId('comments-sign-in')).toBeInTheDocument();
    expect(screen.getByText('Комментариев пока нет')).toBeInTheDocument();
    expect(screen.queryByTestId('comment-form')).toBeNull();
    guest.unmount();

    const restricted = render(<ProfileComments username="younaxo_" signedIn />, {
      wrapper: Providers,
    });
    expect(await screen.findByTestId('comments-restricted')).toBeInTheDocument();
    restricted.unmount();

    mocks.get.mockResolvedValue(page({ commentsEnabled: false, canComment: false }));
    render(<ProfileComments username="younaxo_" signedIn />, { wrapper: Providers });
    expect(await screen.findByTestId('comments-disabled')).toBeInTheDocument();
    expect(screen.queryByTestId('comment-form')).toBeNull();
  });

  it('удаление — только после подтверждения; правка своего; жалоба на чужой с причиной', async () => {
    const user = userEvent.setup();
    mocks.patch.mockResolvedValue({});
    mocks.get.mockResolvedValue(
      page({
        items: [
          comment({ id: 'own', canEdit: true, canDelete: true, content: 'мой' }),
          comment({ id: 'other', content: 'чужой' }),
        ],
        total: 2,
      }),
    );
    render(<ProfileComments username="younaxo_" signedIn />, { wrapper: Providers });
    const [own, other] = await screen.findAllByTestId('profile-comment');

    await user.click(within(own!).getByRole('button', { name: 'Действия с комментарием' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(mocks.delete).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/comments/own'));

    await user.click(within(own!).getByRole('button', { name: 'Действия с комментарием' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Изменить' }));
    const editor = within(own!).getByLabelText('Текст комментария');
    await user.clear(editor);
    await user.type(editor, 'исправлено');
    await user.click(within(own!).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/comments/own', { content: 'исправлено' }),
    );

    await user.click(within(other!).getByRole('button', { name: 'Действия с комментарием' }));
    expect(screen.queryByRole('menuitem', { name: 'Удалить' })).toBeNull();
    await user.click(await screen.findByRole('menuitem', { name: 'Пожаловаться' }));
    const report = await screen.findByTestId('comment-report-dialog');
    await user.click(within(report).getByRole('button', { name: 'Отправить жалобу' }));
    expect(await within(report).findByRole('alert')).toHaveTextContent('Выберите причину');
    await user.click(within(report).getByRole('radio', { name: 'Спам или реклама' }));
    await user.click(within(report).getByRole('button', { name: 'Отправить жалобу' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/comments/other/report', { reason: 'SPAM' }),
    );
  });
});
