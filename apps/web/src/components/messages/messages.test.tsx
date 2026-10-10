import type { ConversationDto, ConversationSummaryDto, MessagesPage } from '@twomc/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuthStore } from '@/lib/auth/store';
import { ConversationList } from './conversation-list';
import { ConversationView } from './conversation-view';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.delete },
}));
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  usePathname: () => '/messages',
}));
// Без сокета в тестах — действия идут через REST-фолбэк.
vi.mock('socket.io-client', () => ({
  io: () => ({ connected: false, on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }),
}));

const ME = { id: 'me', username: 'younaxo_', tag: 'younaxo_#0002', avatar: null };
const STEVE = { id: 'u2', username: 'Steve', tag: 'Steve#0001', avatar: null };

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
  for (const fn of [mocks.get, mocks.post, mocks.patch, mocks.delete, mocks.push, mocks.replace]) {
    fn.mockReset();
  }
  for (const fn of Object.values(mocks.toast)) fn.mockReset();
  mocks.post.mockResolvedValue({});
  mocks.delete.mockResolvedValue({});
  useAuthStore.setState({ status: 'anonymous', user: { id: 'me', username: 'younaxo_' } as never });
});

describe('Сообщения (срез 2.4)', () => {
  it('список: личная — ник собеседника, группа — название; непрочитанные; удалённое — без текста', async () => {
    const conversations: ConversationSummaryDto[] = [
      {
        id: 'c1',
        type: 'DIRECT',
        title: null,
        avatar: null,
        members: [ME, STEVE],
        lastMessage: {
          id: 'm1',
          conversationId: 'c1',
          senderId: 'me',
          content: 'привет',
          parentId: null,
          isEdited: false,
          isDeleted: false,
          createdAt: '2026-10-10T20:00:00.000Z',
        },
        lastMessageAt: '2026-10-10T20:00:00.000Z',
        unreadCount: 3,
        isMuted: false,
        isArchived: false,
      },
      {
        id: 'c2',
        type: 'GROUP',
        title: 'Строители',
        avatar: null,
        members: [ME, STEVE],
        lastMessage: {
          id: 'm2',
          conversationId: 'c2',
          senderId: 'u2',
          content: '',
          parentId: null,
          isEdited: false,
          isDeleted: true,
          createdAt: '2026-10-10T19:00:00.000Z',
        },
        lastMessageAt: '2026-10-10T19:00:00.000Z',
        unreadCount: 0,
        isMuted: false,
        isArchived: false,
      },
    ];
    mocks.get.mockResolvedValue(conversations);
    render(<ConversationList />, { wrapper: Providers });
    const items = await screen.findAllByTestId('conversation-item');
    expect(items[0]).toHaveTextContent('Steve');
    expect(items[0]).toHaveTextContent('Вы: привет');
    expect(within(items[0]!).getByLabelText('непрочитанных: 3')).toHaveTextContent('3');
    expect(items[0]).toHaveAttribute('href', '/messages/c1');
    expect(items[1]).toHaveTextContent('Строители');
    expect(items[1]).toHaveTextContent('Сообщение удалено');
  });

  it('новая группа: отказ приватности — текстом сервера; успех — переход в беседу', async () => {
    const user = userEvent.setup();
    mocks.get.mockResolvedValue([]);
    mocks.post.mockResolvedValueOnce({ id: 'g1', type: 'GROUP', title: 'Т', members: [] });
    render(<ConversationList />, { wrapper: Providers });
    expect(await screen.findByText('Бесед пока нет')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Новая группа' }));
    const dialog = await screen.findByTestId('new-group-dialog');
    await user.type(within(dialog).getByLabelText(/Название/), 'Т');
    await user.type(within(dialog).getByLabelText(/Участники/), 'Steve, Alex');
    await user.click(within(dialog).getByRole('button', { name: 'Создать' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/messages/conversations/group', {
        title: 'Т',
        memberUsernames: ['Steve', 'Alex'],
      }),
    );
    expect(mocks.push).toHaveBeenCalledWith('/messages/g1');
  });

  it('беседа: свои справа, удалённое — плашкой; Enter отправляет, Shift+Enter — нет; удаление — с подтверждением', async () => {
    const user = userEvent.setup();
    const conversation: ConversationDto = {
      id: 'c1',
      type: 'DIRECT',
      title: null,
      members: [
        { userId: 'me', role: 'MEMBER', user: ME },
        { userId: 'u2', role: 'MEMBER', user: STEVE },
      ],
    };
    const history: MessagesPage = {
      items: [
        {
          id: 'a',
          conversationId: 'c1',
          senderId: 'u2',
          content: '<b>Привет</b>',
          parentId: null,
          isEdited: false,
          isDeleted: false,
          createdAt: '2026-10-10T19:00:00.000Z',
          sender: STEVE,
          reactions: [{ userId: 'me', emoji: 'heart' }],
        },
        {
          id: 'b',
          conversationId: 'c1',
          senderId: 'me',
          content: 'мой ответ',
          parentId: null,
          isEdited: true,
          isDeleted: false,
          createdAt: '2026-10-10T19:05:00.000Z',
          sender: ME,
          reactions: [],
        },
        {
          id: 'c',
          conversationId: 'c1',
          senderId: 'u2',
          content: '',
          parentId: null,
          isEdited: false,
          isDeleted: true,
          createdAt: '2026-10-10T19:06:00.000Z',
        },
      ],
      total: 3,
      page: 1,
      limit: 50,
    };
    mocks.get.mockImplementation(async (path: string) =>
      path.endsWith('/messages') ? history : conversation,
    );
    render(<ConversationView conversationId="c1" />, { wrapper: Providers });
    const messages = await screen.findAllByTestId('message');
    expect(within(messages[0]!).getByTestId('message-content')).toHaveTextContent('<b>Привет</b>');
    expect(messages[0]!.querySelector('b')).toBeNull();
    expect(within(messages[0]!).getByRole('button', { name: 'Сердце: 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(messages[1]!.className).toMatch(/flex-row-reverse/);
    expect(messages[1]).toHaveTextContent('изменено');
    expect(messages[2]).toHaveTextContent('Сообщение удалено');
    // Открыли беседу — отмечено прочитанным.
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/messages/conversations/c1/read'));

    const composer = screen.getByLabelText('Сообщение');
    await user.type(composer, 'строка{Shift>}{Enter}{/Shift}вторая');
    expect(mocks.post).not.toHaveBeenCalledWith(
      '/messages/conversations/c1/messages',
      expect.anything(),
    );
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/messages/conversations/c1/messages', {
        content: 'строка\nвторая',
      }),
    );

    await user.click(within(messages[1]!).getByRole('button', { name: 'Действия с сообщением' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(mocks.delete).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/messages/messages/b'));
  });
});
