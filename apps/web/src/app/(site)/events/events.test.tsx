import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuthStore } from '@/lib/auth/store';
import EventPage from './[slug]/page';
import EventsPage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post, delete: mocks.delete },
}));
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'cup' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/events',
}));

const future = new Date(Date.now() + 86_400_000).toISOString();
const EVENT = {
  id: 'e1',
  slug: 'cup',
  title: 'Кубок сервера',
  description: '**Призы** для всех',
  coverImage: null,
  category: 'TOURNAMENT',
  status: 'PUBLISHED',
  startsAt: future,
  endsAt: null,
  isAllDay: false,
  location: 'Арена',
  server: 'Выживание',
  isFeatured: true,
  _count: { participants: 4 },
  myStatus: null,
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

describe('События (срез 3.4)', () => {
  it('список: карточка ведёт на событие', async () => {
    mocks.get.mockResolvedValue({ items: [EVENT], total: 1, page: 1, limit: 50 });
    render(<EventsPage />, { wrapper: Providers });
    const list = await screen.findByTestId('events-list');
    expect(within(list).getByRole('link')).toHaveAttribute('href', '/events/cup');
  });

  it('событие: Markdown, участники, «Пойду»; прошедшее — без записи', async () => {
    const user = userEvent.setup();
    mocks.get.mockResolvedValue(EVENT);
    const view = render(<EventPage />, { wrapper: Providers });
    const details = await screen.findByTestId('event-details');
    expect(within(details).getByText('Призы').tagName).toBe('STRONG');
    expect(screen.getByTestId('event-participants')).toHaveTextContent('Участников: 4');
    await user.click(screen.getByRole('button', { name: 'Пойду' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/events/e1/attendance', { status: 'GOING' }),
    );
    view.unmount();

    mocks.get.mockResolvedValue({ ...EVENT, startsAt: '2026-01-01T10:00:00.000Z' });
    render(<EventPage />, { wrapper: Providers });
    expect(await screen.findByText('Событие уже прошло.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Пойду' })).toBeNull();
  });
});
