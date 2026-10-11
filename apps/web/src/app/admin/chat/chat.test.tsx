import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import AdminChatPage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  delete: vi.fn(),
  granted: new Set<string>(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, delete: mocks.delete },
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
  usePathname: () => '/admin/chat',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const user = { id: 'u1', username: 'Griefer', tag: null, avatar: null };

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
  mocks.get.mockReset();
  mocks.delete.mockReset().mockResolvedValue({ success: true });
  mocks.get.mockImplementation(async (path: string) => {
    if (path === '/admin/chat/mutes') {
      return [
        {
          id: 'm1',
          userId: 'u1',
          reason: 'TOXIC',
          reasonNote: 'оскорбления',
          mutedUntil: null,
          isActive: true,
          createdAt: '2026-10-10T10:00:00.000Z',
          user,
        },
      ];
    }
    if (path === '/admin/chat/messages/search') {
      return {
        items: [
          {
            id: 'c1',
            content: 'купите дешёвые рубины',
            isDeleted: false,
            createdAt: '2026-10-10T11:00:00.000Z',
            author: user,
            channel: { id: 'g', name: 'Общий' },
          },
        ],
        total: 1,
        page: 1,
        limit: 30,
      };
    }
    return [];
  });
});

describe('Чат в админке (срез 7.7)', () => {
  it('муты: причина, срок, «Снять мут» по праву', async () => {
    const actor = userEvent.setup();
    mocks.granted.add('chat.mutes.view');
    mocks.granted.add('chat.mutes.delete');
    render(<AdminChatPage />, { wrapper: Providers });
    const list = await screen.findByTestId('chat-mutes');
    expect(list).toHaveTextContent('Токсичность');
    expect(list).toHaveTextContent('бессрочно · оскорбления');
    await actor.click(within(list).getByRole('button', { name: 'Снять мут' }));
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/admin/chat/mutes/m1'));
  });

  it('поиск сообщений: запрос и результаты; без прав на муты вкладки нет', async () => {
    const actor = userEvent.setup();
    mocks.granted.add('chat.messages.search.view');
    render(<AdminChatPage />, { wrapper: Providers });
    expect(screen.queryByRole('tab', { name: 'Муты' })).toBeNull();
    await actor.type(screen.getByLabelText('Текст сообщения'), 'рубины');
    await actor.click(screen.getByRole('button', { name: 'Найти' }));
    const results = await screen.findByTestId('chat-search');
    expect(results).toHaveTextContent('купите дешёвые рубины');
    expect(mocks.get).toHaveBeenCalledWith('/admin/chat/messages/search', {
      query: { q: 'рубины', page: 1, limit: 30 },
    });
  });
});
