import type { ChatChannelDto, ChatMessagesPage } from '@twomc/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { tokenStore } from '@/lib/api/token-store';
import { useAuthStore } from '@/lib/auth/store';
import { ChatPanel } from './chat-panel';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (payload: unknown) => void>();
  const socket = {
    connected: true,
    on: vi.fn((event: string, handler: (payload: unknown) => void) => {
      handlers.set(event, handler);
    }),
    emit: vi.fn(),
    disconnect: vi.fn(),
    timeout: vi.fn(() => socket),
    emitWithAck: vi.fn(),
  };
  return {
    get: vi.fn(),
    handlers,
    socket,
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  };
});
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get },
}));
vi.mock('socket.io-client', () => ({ io: () => mocks.socket }));
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }));

const CHANNEL: ChatChannelDto = {
  id: 'ch1',
  slug: 'general',
  name: 'Общий',
  description: 'Болтаем обо всём',
  isReadOnly: false,
  slowMode: null,
};

const HISTORY: ChatMessagesPage = {
  items: [
    {
      id: 'm1',
      channelId: 'ch1',
      content: '<i>Всем привет</i>',
      isPinned: true,
      isEdited: false,
      createdAt: '2026-10-10T20:00:00.000Z',
      author: { id: 'u2', username: 'Steve', tag: 'Steve#0001', avatar: null },
    },
  ],
  total: 1,
  page: 1,
  limit: 30,
};

function serve(channels: ChatChannelDto[] = [CHANNEL]) {
  mocks.get.mockImplementation(async (path: string) => {
    if (path === '/chat/channels') return channels;
    if (path.endsWith('/messages')) return HISTORY;
    if (path.endsWith('/pinned')) return [HISTORY.items[0]];
    if (path.endsWith('/online')) return { userIds: ['u2', 'u3'], count: 2 };
    throw new Error(path);
  });
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
  mocks.get.mockReset();
  mocks.handlers.clear();
  mocks.socket.emit.mockReset();
  mocks.socket.emitWithAck.mockReset();
  for (const fn of Object.values(mocks.toast)) fn.mockReset();
  tokenStore.set('token');
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'me', username: 'younaxo_' } as never,
  });
});

describe('Общий чат (срез 2.5)', () => {
  it('история (текст без HTML), закреплённое, онлайн; отправка Enter через WS с ack', async () => {
    const user = userEvent.setup();
    serve();
    mocks.socket.emitWithAck.mockResolvedValue({ ok: true });
    render(<ChatPanel />, { wrapper: Providers });
    const content = await screen.findByTestId('chat-message-content');
    expect(content).toHaveTextContent('<i>Всем привет</i>');
    expect(content.querySelector('i')).toBeNull();
    expect(await screen.findByTestId('chat-pinned')).toHaveTextContent('Steve: <i>Всем привет</i>');
    expect(await screen.findByTestId('chat-online')).toHaveTextContent('2 в канале');

    await user.type(screen.getByLabelText('Сообщение в чат'), 'привет{Enter}');
    await waitFor(() =>
      expect(mocks.socket.emitWithAck).toHaveBeenCalledWith('send_message', {
        channelId: 'ch1',
        content: 'привет',
      }),
    );
  });

  it('отказ сервера (флуд) — тост с текстом; мут — плашка вместо поля ввода', async () => {
    const user = userEvent.setup();
    serve();
    mocks.socket.emitWithAck.mockResolvedValue({
      ok: false,
      error: 'Слишком часто — подождите несколько секунд.',
    });
    render(<ChatPanel />, { wrapper: Providers });
    await user.type(await screen.findByLabelText('Сообщение в чат'), 'флуд{Enter}');
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith('Слишком часто — подождите несколько секунд.'),
    );

    act(() =>
      mocks.handlers.get('user:muted')?.({
        userId: 'me',
        expiresAt: null,
        reason: 'спам',
      }),
    );
    expect(await screen.findByTestId('chat-restricted')).toHaveTextContent(
      'Модератор запретил вам писать. Причина: спам.',
    );
    expect(screen.queryByLabelText('Сообщение в чат')).toBeNull();
  });

  it('гость читает, писать — после входа; канал только для чтения — без поля', async () => {
    useAuthStore.setState({ status: 'anonymous', user: null });
    serve();
    const guest = render(<ChatPanel />, { wrapper: Providers });
    expect(await screen.findByTestId('chat-sign-in')).toBeInTheDocument();
    expect(await screen.findByTestId('chat-message')).toBeInTheDocument();
    guest.unmount();

    useAuthStore.setState({ status: 'authenticated', user: { id: 'me' } as never });
    serve([{ ...CHANNEL, isReadOnly: true }]);
    render(<ChatPanel />, { wrapper: Providers });
    expect(await screen.findByTestId('chat-readonly')).toBeInTheDocument();
  });
});
