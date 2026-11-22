import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { maskWebhookUrl } from '@/lib/admin/notifications';
import AdminNotificationsPage from './page';

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
  usePathname: () => '/admin/notifications',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const SECRET = 'https://discord.com/api/webhooks/123456/SECRET-TOKEN-abcd';

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
  mocks.post.mockResolvedValue({ count: 42 });
  mocks.patch.mockResolvedValue({});
  mocks.delete.mockResolvedValue({ success: true });
  mocks.get.mockImplementation(async (path: string) => {
    if (path === '/admin/notifications/webhooks') {
      return [
        {
          id: 'w1',
          name: 'Системный канал',
          url: SECRET,
          eventTypes: ['ANNOUNCEMENT', 'SYSTEM'],
          isActive: true,
          createdBy: 'u1',
          createdAt: '2026-11-01T10:00:00.000Z',
        },
      ];
    }
    if (path === '/admin/notifications/stats') {
      return { total: 120, unread: 30, byType: { ANNOUNCEMENT: 20, FRIEND_REQUEST: 100 } };
    }
    return [];
  });
});

describe('Админ-уведомления', () => {
  it('maskWebhookUrl скрывает токен', () => {
    expect(maskWebhookUrl(SECRET)).toBe('discord.com/…abcd');
    expect(maskWebhookUrl('мусор')).toBe('…скрыт');
    expect(maskWebhookUrl(undefined)).toBe('—');
  });

  it('без прав — экран 403', () => {
    render(<AdminNotificationsPage />, { wrapper: Providers });
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('вкладки только по правам', async () => {
    mocks.granted.add('notifications.stats.view');
    render(<AdminNotificationsPage />, { wrapper: Providers });
    expect(await screen.findByTestId('notification-stats')).toHaveTextContent(
      'Всего: 120 · не прочитано: 30',
    );
    expect(screen.queryByRole('tab', { name: 'Рассылка' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Вебхуки' })).toBeNull();
  });

  it('рассылка: валидация, подтверждение «всем», затем POST', async () => {
    const user = userEvent.setup();
    mocks.granted.add('notifications.broadcast');
    render(<AdminNotificationsPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Отправить всем' }));
    expect(await screen.findByText('Введите заголовок')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();

    await user.type(screen.getByLabelText(/Заголовок/), 'Обновление сервера');
    await user.type(screen.getByLabelText('Ссылка'), 'javascript:alert(1)');
    await user.click(screen.getByRole('button', { name: 'Отправить всем' }));
    expect(await screen.findByText('Ссылка вида https://…')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Ссылка'));
    await user.click(screen.getByRole('button', { name: 'Отправить всем' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Действие необратимо');
    expect(mocks.post).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Отправить всем' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/admin/notifications/broadcast', {
        title: 'Обновление сервера',
        type: 'ANNOUNCEMENT',
        priority: 'NORMAL',
      }),
    );
    expect(mocks.toast.success).toHaveBeenCalledWith('Отправлено получателям: 42');
  });

  it('вебхуки: адрес только маской, удаление с подтверждением', async () => {
    const user = userEvent.setup();
    mocks.granted.add('notifications.webhooks.view');
    mocks.granted.add('notifications.webhooks.delete');
    render(<AdminNotificationsPage />, { wrapper: Providers });
    const list = await screen.findByTestId('webhooks');
    expect(list).toHaveTextContent('discord.com/…abcd');
    expect(document.body).not.toHaveTextContent('SECRET-TOKEN');
    expect(within(list).queryByRole('button', { name: 'Изменить' })).toBeNull();

    await user.click(within(list).getByRole('button', { name: 'Удалить' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(mocks.delete).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    await waitFor(() =>
      expect(mocks.delete).toHaveBeenCalledWith('/admin/notifications/webhooks/w1'),
    );
  });

  it('новый вебхук: нужен https-адрес и тип события', async () => {
    const user = userEvent.setup();
    mocks.granted.add('notifications.webhooks.view');
    mocks.granted.add('notifications.webhooks.create');
    render(<AdminNotificationsPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Добавить вебхук' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect(await within(dialog).findByText('Введите название')).toBeInTheDocument();
    expect(within(dialog).getByText('Выберите хотя бы один тип событий')).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText(/Название/), 'Канал');
    await user.type(within(dialog).getByLabelText(/Адрес Discord-вебхука/), SECRET);
    await user.click(within(dialog).getByRole('checkbox', { name: 'Объявление' }));
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/admin/notifications/webhooks', {
        name: 'Канал',
        url: SECRET,
        eventTypes: ['ANNOUNCEMENT'],
        isActive: true,
      }),
    );
  });
});
