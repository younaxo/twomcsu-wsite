import type { NotificationDto } from '@twomc/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationsPage from '@/app/(site)/notifications/page';
import { NotificationsPopover } from '@/components/shell/notifications-popover';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuthStore } from '@/lib/auth/store';
import { installFetchMock, jsonResponse, requestInfo, type FetchMock } from '@/test/http';

vi.mock('next/navigation', () => ({
  usePathname: () => '/notifications',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const base = {
  type: 'SYSTEM',
  message: null,
  link: null,
  imageUrl: null,
  actionUrl: null,
  actionLabel: null,
  priority: 'NORMAL',
  readAt: null,
  createdAt: new Date().toISOString(),
} as unknown as NotificationDto;

const items: NotificationDto[] = [
  { ...base, id: 'n1', title: 'Заявка в друзья', isRead: false },
  { ...base, id: 'n2', title: 'Заказ выдан', isRead: true },
];

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

let fetchMock: FetchMock;
const calls: string[] = [];

beforeEach(() => {
  calls.length = 0;
  fetchMock = installFetchMock();
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'u', username: 'player' } as never,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/// Мок API с состоянием: действия меняют данные, перезапрос видит изменения.
function serve(unread = 1, initial: NotificationDto[] = items) {
  let list = initial.map((item) => ({ ...item }));
  fetchMock.mockImplementation(async (...args) => {
    const { path, method } = requestInfo(args);
    const clean = path.split('?')[0] ?? path;
    calls.push(`${method} ${clean}`);
    if (clean === '/notifications/unread-count') {
      return jsonResponse({ count: unread });
    }
    const one = /^\/notifications\/([^/]+)\/(read|unread)$/.exec(clean);
    if (one && method === 'PATCH') {
      list = list.map((item) =>
        item.id === one[1] ? { ...item, isRead: one[2] === 'read' } : item,
      );
      return jsonResponse({});
    }
    if (method === 'DELETE') {
      list =
        clean === '/notifications'
          ? []
          : list.filter((item) => `/notifications/${item.id}` !== clean);
      return jsonResponse({ count: 0 });
    }
    if (clean === '/notifications' && method === 'GET') {
      return jsonResponse({ items: list, total: list.length, page: 1, limit: 20 });
    }
    return jsonResponse({});
  });
}

describe('Уведомления', () => {
  it('список, фильтр со счётчиком; «прочитано» и «удалить» обновляются сразу', async () => {
    const user = userEvent.setup();
    serve();
    render(<NotificationsPage />, { wrapper: Providers });
    const list = await screen.findByTestId('notifications-list');
    expect(within(list).getAllByTestId('notification-item')).toHaveLength(2);
    expect(await screen.findByRole('radio', { name: 'Непрочитанные · 1' })).toBeInTheDocument();

    const [first] = within(list).getAllByTestId('notification-item');
    await user.click(within(first!).getByRole('button', { name: 'Отметить прочитанным' }));
    expect(first).toHaveAttribute('data-read', 'true');
    await waitFor(() => expect(calls).toContain('PATCH /notifications/n1/read'));

    const second = within(list).getAllByTestId('notification-item')[1]!;
    await user.click(within(second).getByRole('button', { name: 'Удалить уведомление' }));
    await waitFor(() => expect(calls).toContain('DELETE /notifications/n2'));
  });

  it('ПКМ на пункте — те же действия', async () => {
    serve();
    render(<NotificationsPage />, { wrapper: Providers });
    const [first] = within(await screen.findByTestId('notifications-list')).getAllByTestId(
      'notification-item',
    );
    fireEvent.contextMenu(first!);
    expect(
      await screen.findByRole('menuitem', { name: 'Отметить прочитанным' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Удалить' })).toBeInTheDocument();
  });

  it('«Очистить все» — только после подтверждения', async () => {
    const user = userEvent.setup();
    serve();
    render(<NotificationsPage />, { wrapper: Providers });
    await screen.findByTestId('notifications-list');
    await user.click(screen.getByRole('button', { name: 'Другие действия с уведомлениями' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Очистить все' }));
    expect(calls).not.toContain('DELETE /notifications');
    await user.click(await screen.findByRole('button', { name: 'Очистить' }));
    await waitFor(() => expect(calls).toContain('DELETE /notifications'));
  });

  it('бейдж: больше 99 — «99+», ноль — без бейджа', async () => {
    serve(150);
    const { unmount } = render(<NotificationsPopover />, { wrapper: Providers });
    expect(await screen.findByTestId('unread-badge')).toHaveTextContent('99+');
    unmount();
    serve(0);
    render(<NotificationsPopover />, { wrapper: Providers });
    await waitFor(() => expect(calls).toContain('GET /notifications/unread-count'));
    expect(screen.queryByTestId('unread-badge')).toBeNull();
  });
});
