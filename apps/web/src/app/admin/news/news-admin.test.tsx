import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { AdminNewsArticle } from '@/lib/admin/news';
import { NewsEditor } from './_components/news-editor';
import AdminNewsPage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  replace: vi.fn(),
  granted: new Set<string>(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.delete },
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
  usePathname: () => '/admin/news',
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace }),
  useParams: () => ({ id: 'n1' }),
}));

const ITEM = {
  id: 'n1',
  slug: 'patch-1-0',
  title: 'Патч 1.0',
  category: 'PATCH_NOTES',
  status: 'PUBLISHED',
  isPinned: false,
  isFeatured: true,
  publishedAt: '2026-10-10T10:00:00.000Z',
  createdAt: '2026-10-09T10:00:00.000Z',
  viewsCount: 42,
  author: { id: 'u1', username: 'editor', tag: 'editor#0001', avatar: null },
  tags: [{ tag: 'patch' }],
};
const ARTICLE = {
  ...ITEM,
  excerpt: 'Коротко',
  content: '**Новое**',
  coverImage: 'https://cdn-files.twomc.su/news/cover.png',
  metaTitle: null,
  metaDescription: null,
  allowComments: true,
} as unknown as AdminNewsArticle;

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
  for (const fn of [mocks.get, mocks.post, mocks.patch, mocks.delete, mocks.replace]) {
    fn.mockReset();
  }
  mocks.post.mockResolvedValue({ ...ARTICLE, id: 'n2' });
  mocks.patch.mockResolvedValue(ARTICLE);
  mocks.delete.mockResolvedValue(undefined);
  mocks.get.mockImplementation(async (path: string) =>
    path === '/admin/news' ? { items: [ITEM], total: 1, page: 1, limit: 20 } : ARTICLE,
  );
});

describe('Новости в админке (срез 7.4)', () => {
  it('список: статус, категория, «на главной»; фильтр уходит в запрос', async () => {
    const user = userEvent.setup();
    mocks.granted.add('news.view');
    render(<AdminNewsPage />, { wrapper: Providers });
    const list = await screen.findByTestId('admin-news');
    expect(list).toHaveTextContent('Патч 1.0');
    expect(within(list).getByText('Опубликована')).toBeInTheDocument();
    expect(within(list).getByText('Патч-ноут')).toBeInTheDocument();
    expect(within(list).getByText('На главной')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Новая новость' })).toBeNull();
    await user.selectOptions(screen.getByLabelText('Статус'), 'DRAFT');
    await waitFor(() =>
      expect(mocks.get).toHaveBeenLastCalledWith('/admin/news', {
        query: { page: 1, limit: 20, status: 'DRAFT' },
      }),
    );
  });

  it('закреп и архивация — по правам, архив с подтверждением', async () => {
    const user = userEvent.setup();
    for (const key of ['news.view', 'news.pin', 'news.delete']) mocks.granted.add(key);
    render(<AdminNewsPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Закрепить' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/admin/news/n1/pin'));
    expect(screen.queryByRole('button', { name: 'Убрать с главной' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'В архив' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'В архив' }));
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/admin/news/n1'));
  });

  it('создание: проверка slug и обложки, переход в редактор', async () => {
    const user = userEvent.setup();
    render(<NewsEditor article={null} />, { wrapper: Providers });
    const statuses = within(screen.getByLabelText('Статус'))
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(statuses).toEqual(['Черновик', 'Запланирована', 'Опубликована', 'В архиве']);
    await user.type(screen.getByLabelText(/Заголовок/), 'Ивент');
    await user.type(screen.getByLabelText(/Slug/), 'Big Event');
    await user.type(screen.getByLabelText(/Текст \(Markdown\)/), 'Приходите');
    await user.type(screen.getByLabelText(/Обложка/), 'https://evil.example.com/x.png');
    await user.click(screen.getByRole('button', { name: 'Создать' }));
    expect(screen.getByText('Только строчные латинские буквы, цифры и дефис')).toBeInTheDocument();
    expect(
      screen.getByText('Ссылка на cdn-files.twomc.su или путь сайта (/…)'),
    ).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/Slug/));
    await user.type(screen.getByLabelText(/Slug/), 'big-event');
    await user.clear(screen.getByLabelText(/Обложка/));
    await user.type(screen.getByLabelText(/Теги/), 'Ивент, ивент, лето');
    await user.click(screen.getByRole('button', { name: 'Создать' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/admin/news', {
        title: 'Ивент',
        slug: 'big-event',
        content: 'Приходите',
        category: 'ANNOUNCEMENT',
        status: 'DRAFT',
        allowComments: true,
        tags: ['ивент', 'лето'],
        excerpt: '',
        metaTitle: '',
        metaDescription: '',
      }),
    );
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/admin/news/n2'));
  });

  it('правка: предпросмотр Markdown, убранная обложка уходит как null', async () => {
    const user = userEvent.setup();
    render(<NewsEditor article={ARTICLE} />, { wrapper: Providers });
    expect(screen.queryByLabelText(/Slug/)).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'Предпросмотр' }));
    const preview = await screen.findByTestId('news-preview');
    expect(within(preview).getByText('Новое').tagName).toBe('STRONG');
    await user.clear(screen.getByLabelText(/Обложка/));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith(
        '/admin/news/n1',
        expect.objectContaining({ coverImage: null, tags: ['patch'], excerpt: 'Коротко' }),
      ),
    );
  });

  it('«Запланирована» без даты в будущем не сохраняется (ADR-0146)', async () => {
    const user = userEvent.setup();
    render(<NewsEditor article={null} />, { wrapper: Providers });
    await user.type(screen.getByLabelText(/Заголовок/), 'Анонс');
    await user.type(screen.getByLabelText(/Slug/), 'anons');
    await user.type(screen.getByLabelText(/Текст \(Markdown\)/), 'Скоро');
    await user.selectOptions(screen.getByLabelText('Статус'), 'SCHEDULED');
    expect(screen.getByText(/Новость выйдет сама в это время/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Создать' }));
    expect(screen.getByText('Укажите дату и время публикации в будущем')).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
