import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { AdminTopic } from '@/lib/admin/topics';
import { TopicEditor } from './_components/topic-editor';
import AdminTopicsPage from './page';

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
  usePathname: () => '/admin/topics',
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace }),
  useParams: () => ({ id: 't1' }),
}));

const RULES = {
  id: 't1',
  slug: 'server-rules',
  title: 'Правила сервера',
  category: 'RULES',
  visibility: 'PUBLIC',
  description: 'Основные правила',
  order: 0,
  isActive: true,
  isPinned: false,
  views: 12,
  updatedAt: '2026-10-10T10:00:00.000Z',
};
const INTERNAL = {
  ...RULES,
  id: 't2',
  slug: 'staff-guide',
  title: 'Памятка персонала',
  category: 'ADMIN_INTERNAL',
  visibility: 'MODERATOR_ONLY',
  isActive: false,
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
  for (const fn of [mocks.get, mocks.post, mocks.patch, mocks.delete, mocks.replace]) {
    fn.mockReset();
  }
  mocks.post.mockResolvedValue({ ...RULES, id: 't3', content: 'x' });
  mocks.patch.mockResolvedValue({ ...RULES, content: 'x' });
  mocks.delete.mockResolvedValue(undefined);
  mocks.get.mockImplementation(async (path: string) =>
    path === '/admin/topics' ? [RULES, INTERNAL] : [],
  );
});

describe('Темы в админке (срез 7.4)', () => {
  it('список: раздел, видимость, скрытые; фильтр по разделу', async () => {
    const user = userEvent.setup();
    mocks.granted.add('topics.view');
    render(<AdminTopicsPage />, { wrapper: Providers });
    const list = await screen.findByTestId('admin-topics');
    expect(list).toHaveTextContent('Правила сервера');
    expect(within(list).getByText('Модераторам и выше')).toBeInTheDocument();
    expect(within(list).getByText('Скрыта')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Новая тема' })).toBeNull();
    await user.selectOptions(screen.getByLabelText('Раздел'), 'RULES');
    expect(screen.getByTestId('admin-topics')).not.toHaveTextContent('Памятка персонала');
  });

  it('закреп и удаление с подтверждением — по правам', async () => {
    const user = userEvent.setup();
    for (const key of ['topics.view', 'topics.pin', 'topics.delete']) mocks.granted.add(key);
    render(<AdminTopicsPage />, { wrapper: Providers });
    const rows = within(await screen.findByTestId('admin-topics')).getAllByRole('listitem');
    await user.click(within(rows[0]!).getByRole('button', { name: 'Закрепить' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/admin/topics/t1/pin'));
    await user.click(within(rows[0]!).getByRole('button', { name: 'Удалить' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/admin/topics/t1'));
  });

  it('создание: подсказка slug юрдокументов, POST и переход в редактор', async () => {
    const user = userEvent.setup();
    render(<TopicEditor topic={null} />, { wrapper: Providers });
    await user.selectOptions(screen.getByLabelText('Раздел'), 'DOCUMENTS');
    expect(
      screen.getByText(/Юридический документ на сайте: terms, privacy, personal-data/),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Заголовок/), 'Пользовательское соглашение');
    await user.type(screen.getByLabelText(/Slug/), 'terms');
    await user.type(screen.getByLabelText(/Текст \(Markdown\)/), 'Текст соглашения');
    await user.click(screen.getByRole('button', { name: 'Создать' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/admin/topics', {
        title: 'Пользовательское соглашение',
        slug: 'terms',
        category: 'DOCUMENTS',
        visibility: 'PUBLIC',
        description: '',
        content: 'Текст соглашения',
      }),
    );
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/admin/topics/t3'));
  });

  it('правка: предпросмотр и снятие с публикации', async () => {
    const user = userEvent.setup();
    const topic = { ...RULES, content: '# Раздел\n\n*важно*' } as unknown as AdminTopic;
    render(<TopicEditor topic={topic} />, { wrapper: Providers });
    expect(screen.queryByLabelText(/Slug/)).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'Предпросмотр' }));
    expect(
      within(await screen.findByTestId('topic-preview')).getByText('важно'),
    ).toBeInTheDocument();
    await user.click(screen.getByLabelText(/Опубликована/));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith(
        '/admin/topics/t1',
        expect.objectContaining({ isActive: false, category: 'RULES' }),
      ),
    );
  });
});
