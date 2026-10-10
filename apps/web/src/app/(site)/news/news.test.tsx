import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import NewsArticlePage from './[slug]/page';
import NewsPage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  slug: 'patch-1',
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post, delete: mocks.delete },
}));
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: mocks.slug }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/news',
}));

const ITEM = {
  id: 'n1',
  slug: 'patch-1',
  title: 'Патч 1.0',
  excerpt: 'Что нового',
  coverImage: null,
  category: 'PATCH_NOTES',
  publishedAt: '2026-10-01T10:00:00.000Z',
  isPinned: false,
  isFeatured: false,
  viewsCount: 5,
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
  for (const fn of [mocks.get, mocks.post, mocks.delete]) fn.mockReset();
  mocks.post.mockResolvedValue({});
  useAuthStore.setState({ status: 'authenticated', user: { id: 'me' } as never });
});

describe('Новости (срез 3.3)', () => {
  it('список: карточка ведёт на статью; фильтр категории — запрос с category', async () => {
    const user = userEvent.setup();
    mocks.get.mockResolvedValue({ items: [ITEM], total: 1, page: 1, limit: 12 });
    render(<NewsPage />, { wrapper: Providers });
    const list = await screen.findByTestId('news-list');
    expect(within(list).getByRole('link')).toHaveAttribute('href', '/news/patch-1');
    await user.click(screen.getByRole('radio', { name: 'Патч-ноут' }));
    await waitFor(() =>
      expect(mocks.get).toHaveBeenCalledWith(
        '/news',
        expect.objectContaining({ query: expect.objectContaining({ category: 'PATCH_NOTES' }) }),
      ),
    );
  });

  it('статья: Markdown без HTML, лайк, комментарии с реакциями; снятая — «не найдена»', async () => {
    const user = userEvent.setup();
    mocks.get.mockImplementation(async (path: string) =>
      path.endsWith('/comments')
        ? {
            items: [
              {
                id: 'c1',
                parentId: null,
                content: 'Круто!',
                createdAt: '2026-10-01T11:00:00.000Z',
                isEdited: false,
                isPinned: false,
                author: { id: 'u2', username: 'Steve', avatar: null },
                reactions: [{ key: 'fire', count: 3 }],
                myReaction: null,
                canEdit: false,
                canDelete: false,
              },
            ],
            total: 1,
            page: 1,
            limit: 20,
          }
        : {
            ...ITEM,
            content: '**Важно**\n\n<script>alert(1)</script>',
            likesCount: 2,
            commentsCount: 1,
            allowComments: true,
            liked: false,
            tags: [{ id: 't1', name: 'release', slug: 'release' }],
            author: { id: 'u1', username: 'younaxo_', avatar: null },
          },
    );
    const view = render(<NewsArticlePage />, { wrapper: Providers });
    const article = await screen.findByTestId('news-article');
    expect(within(article).getByText('Важно').tagName).toBe('STRONG');
    expect(article.querySelector('script')).toBeNull();
    expect(article).toHaveTextContent('#release');
    await user.click(within(article).getByRole('button', { name: '2' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/news/n1/like'));
    const comment = await screen.findByTestId('news-comment');
    await user.click(within(comment).getByRole('button', { name: 'Огонь: 3' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/news/patch-1/comments/c1/reactions', {
        emoji: 'fire',
      }),
    );
    view.unmount();

    mocks.get.mockImplementation(async () => {
      throw new ApiError(404, ['Новость не найдена']);
    });
    render(<NewsArticlePage />, { wrapper: Providers });
    expect(await screen.findByText('Новость не найдена')).toBeInTheDocument();
  });
});
