import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import AdminEventsPage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
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
  usePathname: () => '/admin/events',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const DRAFT = {
  id: 'e1',
  slug: 'summer-cup',
  title: 'Летний кубок',
  description: 'PvP-турнир',
  coverImage: 'https://cdn-files.twomc.su/events/cup.png',
  category: 'TOURNAMENT',
  visibility: 'PUBLIC',
  status: 'DRAFT',
  startsAt: '2026-10-20T15:00:00.000Z',
  endsAt: null,
  location: 'Арена',
  server: 'pvp',
  maxParticipants: 16,
  registrationDeadline: null,
  _count: { participants: 3 },
};
const PUBLISHED = { ...DRAFT, id: 'e2', slug: 'party', title: 'Вечеринка', status: 'PUBLISHED' };

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
  for (const fn of [mocks.get, mocks.post, mocks.patch, mocks.delete]) fn.mockReset();
  mocks.post.mockResolvedValue({ success: true });
  mocks.patch.mockResolvedValue(DRAFT);
  mocks.delete.mockResolvedValue(undefined);
  mocks.get.mockImplementation(async (path: string) => {
    if (path === '/admin/events') return { items: [DRAFT, PUBLISHED], total: 2 };
    if (path === '/admin/events/e1/participants') {
      return [
        {
          status: 'GOING',
          createdAt: '2026-10-11T10:00:00.000Z',
          user: { id: 'u1', username: 'pvp', tag: 'pvp#0007', avatar: null },
        },
        {
          status: 'INTERESTED',
          createdAt: '2026-10-11T11:00:00.000Z',
          user: { id: 'u2', username: 'fan', tag: 'fan#0008', avatar: null },
        },
      ];
    }
    return [];
  });
});

describe('События в админке (срез 7.4)', () => {
  it('только просмотр: статус, категория, участники из мест, без кнопок', async () => {
    mocks.granted.add('events.view');
    render(<AdminEventsPage />, { wrapper: Providers });
    const list = await screen.findByTestId('admin-events');
    expect(list).toHaveTextContent('Летний кубок');
    expect(within(list).getByText('Черновик')).toBeInTheDocument();
    expect(within(list).getAllByText('Турнир')).toHaveLength(2);
    expect(list).toHaveTextContent('участников: 3 из 16');
    expect(screen.queryByRole('button', { name: 'Новое событие' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Опубликовать' })).toBeNull();
  });

  it('публикация черновика и отмена опубликованного — с подтверждением', async () => {
    const user = userEvent.setup();
    for (const key of ['events.view', 'events.publish', 'events.cancel']) mocks.granted.add(key);
    render(<AdminEventsPage />, { wrapper: Providers });
    const rows = within(await screen.findByTestId('admin-events')).getAllByRole('listitem');
    expect(within(rows[1]!).queryByRole('button', { name: 'Опубликовать' })).toBeNull();
    await user.click(within(rows[0]!).getByRole('button', { name: 'Опубликовать' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/admin/events/e1/publish'));
    await user.click(within(rows[1]!).getByRole('button', { name: 'Отменить' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('получат уведомление об отмене');
    await user.click(within(dialog).getByRole('button', { name: 'Отменить событие' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/admin/events/e2/cancel'));
  });

  it('создание: проверки названия, slug, начала и обложки', async () => {
    const user = userEvent.setup();
    mocks.granted.add('events.view');
    mocks.granted.add('events.create');
    render(<AdminEventsPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Новое событие' }));
    await user.type(screen.getByLabelText(/Slug/), 'Bad Slug');
    await user.type(screen.getByLabelText(/Обложка/), 'https://evil.example.com/x.png');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(screen.getByText('Введите название')).toBeInTheDocument();
    expect(screen.getByText('Только строчные латинские буквы, цифры и дефис')).toBeInTheDocument();
    expect(screen.getByText('Укажите начало')).toBeInTheDocument();
    expect(
      screen.getByText('Ссылка на cdn-files.twomc.su или путь сайта (/…)'),
    ).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('правка: убранная обложка уходит как null, поля события сохраняются', async () => {
    const user = userEvent.setup();
    mocks.granted.add('events.view');
    mocks.granted.add('events.edit');
    render(<AdminEventsPage />, { wrapper: Providers });
    const rows = within(await screen.findByTestId('admin-events')).getAllByRole('listitem');
    await user.click(within(rows[0]!).getByRole('button', { name: 'Изменить' }));
    expect(screen.queryByLabelText(/Slug/)).toBeNull();
    await user.clear(screen.getByLabelText(/Обложка/));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/admin/events/e1', {
        title: 'Летний кубок',
        description: 'PvP-турнир',
        category: 'TOURNAMENT',
        visibility: 'PUBLIC',
        startsAt: '2026-10-20T15:00:00.000Z',
        location: 'Арена',
        server: 'pvp',
        maxParticipants: 16,
        coverImage: null,
      }),
    );
  });

  it('участники (ADR-0151): тег со ссылкой на карточку и статус участия', async () => {
    const user = userEvent.setup();
    mocks.granted.add('events.view');
    render(<AdminEventsPage />, { wrapper: Providers });
    const rows = within(await screen.findByTestId('admin-events')).getAllByRole('listitem');
    await user.click(within(rows[0]!).getByRole('button', { name: 'Участники' }));
    const list = await screen.findByTestId('event-participants');
    expect(within(list).getByRole('link', { name: 'pvp#0007' })).toHaveAttribute(
      'href',
      '/admin/users/u1',
    );
    expect(list).toHaveTextContent('Идёт');
    expect(list).toHaveTextContent('Интересуется');
  });
});
