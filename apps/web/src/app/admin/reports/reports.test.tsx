import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuthStore } from '@/lib/auth/store';
import ReportCardPage from './[reportNumber]/page';
import AdminReportsPage from './page';

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
  useParams: () => ({ reportNumber: 'R-1' }),
  usePathname: () => '/admin/reports',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const user = (id: string, username: string) => ({ id, username, tag: null, avatar: null });
const REPORT = {
  id: 'r1',
  reportNumber: 'R-1',
  type: 'PLAYER_COMPLAINT',
  status: 'PENDING',
  description: 'Гриферство на спавне',
  server: 'Выживание',
  createdAt: '2026-10-10T10:00:00.000Z',
  isLocked: false,
  lockedReason: null,
  contactEmail: null,
  verdict: null,
  author: user('a1', 'Alice'),
  assignedTo: null,
  assignedToId: null,
  targets: [{ id: 't1', username: 'Griefer', userId: 'g1' }],
  messages: [
    {
      id: 'm1',
      authorId: 'a1',
      content: 'Вот доказательства',
      isStaff: false,
      isSystem: false,
      isDeleted: false,
      createdAt: '2026-10-10T11:00:00.000Z',
    },
  ],
  moderatorNotes: [
    {
      id: 'n1',
      authorId: 'me',
      content: 'Проверить логи',
      isPinned: false,
      createdAt: '2026-10-10T12:00:00.000Z',
    },
  ],
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
  mocks.post.mockResolvedValue({});
  mocks.patch.mockResolvedValue({});
  mocks.get.mockImplementation(async (path: string) => {
    if (path === '/moderation/reports') return { items: [REPORT], total: 1, page: 1, limit: 30 };
    if (path === '/reports/R-1') return REPORT;
    return null;
  });
  useAuthStore.setState({ status: 'authenticated', user: { id: 'me' } as never });
});

describe('Обращения в админке (срез 7.3)', () => {
  it('очередь: фильтр статуса уходит в запрос, строка ведёт в карточку', async () => {
    const actor = userEvent.setup();
    mocks.granted.add('reports.view');
    render(<AdminReportsPage />, { wrapper: Providers });
    const list = await screen.findByTestId('staff-reports');
    expect(within(list).getByRole('link')).toHaveAttribute('href', '/admin/reports/R-1');
    expect(within(list).getByText(/Alice · не назначено/)).toBeInTheDocument();
    await actor.selectOptions(screen.getByLabelText('Статус'), 'IN_REVIEW');
    await waitFor(() =>
      expect(mocks.get).toHaveBeenLastCalledWith('/moderation/reports', {
        query: { page: 1, limit: 30, status: 'IN_REVIEW' },
      }),
    );
  });

  it('карточка: действия — по правам; ответ, заметка, «взять себе», вердикт', async () => {
    const actor = userEvent.setup();
    for (const key of [
      'reports.view',
      'reports.messages',
      'reports.notes',
      'reports.assign',
      'reports.verdict',
    ]) {
      mocks.granted.add(key);
    }
    render(<ReportCardPage />, { wrapper: Providers });
    const card = await screen.findByTestId('staff-report');
    expect(within(card).getByRole('link', { name: 'Alice' })).toHaveAttribute('href', '/u/Alice');
    expect(card).toHaveTextContent('Нарушители: Griefer');
    expect(screen.getByText('Проверить логи')).toBeInTheDocument();
    // Нет reports.status и reports.lock — нет и этих элементов.
    expect(screen.queryByLabelText('Статус')).toBeNull();
    expect(screen.queryByRole('button', { name: /Заблокировать/ })).toBeNull();

    await actor.type(screen.getByLabelText('Ответ автору'), 'Принято в работу');
    await actor.click(screen.getByRole('button', { name: 'Ответить' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/moderation/reports/R-1/messages', {
        content: 'Принято в работу',
      }),
    );
    await actor.type(screen.getByLabelText('Новая заметка'), 'Логи выгружены');
    await actor.click(screen.getByRole('button', { name: 'Добавить заметку' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/moderation/reports/R-1/notes', {
        content: 'Логи выгружены',
      }),
    );
    await actor.click(screen.getByRole('button', { name: 'Взять себе' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/moderation/reports/R-1/assign', {
        assignedToId: 'me',
      }),
    );
    await actor.type(screen.getByLabelText('Решение'), 'Нарушитель наказан');
    await actor.click(screen.getByRole('button', { name: 'Сохранить решение' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/moderation/reports/R-1/verdict', {
        verdict: 'Нарушитель наказан',
      }),
    );
  });

  it('без reports.view — экран 403', async () => {
    render(<AdminReportsPage />, { wrapper: Providers });
    expect(screen.queryByTestId('reports-filters')).toBeNull();
  });
});
