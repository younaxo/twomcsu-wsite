import type { NotificationSettingsDto } from '@twomc/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  DiscordChannel,
  EmailChannel,
  NotificationTypes,
  ResetNotificationSettings,
} from './notification-channels';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  get: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.delete },
}));
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }));

const BASE: NotificationSettingsDto = {
  pushEnabled: true,
  soundEnabled: true,
  pushPreview: true,
  foregroundEnabled: true,
  emailEnabled: true,
  quietHoursEnabled: false,
  quietHoursStart: null,
  quietHoursEnd: null,
  typeSettings: { FRIEND_REQUEST: false },
  discordEnabled: false,
  discordWebhookHint: null,
  digestMode: 'INSTANT',
  digestTime: '09:00',
  emailAvailable: true,
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
  for (const fn of [mocks.post, mocks.patch, mocks.delete, mocks.get]) fn.mockReset();
  for (const fn of Object.values(mocks.toast)) fn.mockReset();
  mocks.post.mockResolvedValue(BASE);
  mocks.patch.mockResolvedValue(BASE);
  mocks.delete.mockResolvedValue(BASE);
});

describe('Настройки уведомлений (срез 2.2)', () => {
  it('типы: состояние из typeSettings (нет ключа — включено), переключение — PATCH по типу', async () => {
    const user = userEvent.setup();
    render(<NotificationTypes settings={BASE} />, { wrapper: Providers });
    const requests = screen.getByRole('switch', { name: /Заявки в друзья/ });
    expect(requests).not.toBeChecked();
    expect(screen.getByRole('switch', { name: /Принятые заявки/ })).toBeChecked();
    // Только реально отправляемые типы: заказов и наград пока нет.
    expect(screen.queryByText(/Заказ/)).toBeNull();
    await user.click(requests);
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/notifications/settings/type/FRIEND_REQUEST', {
        enabled: true,
      }),
    );
  });

  it('Discord: чужой адрес не отправляется; вебхук — POST; подключённый — маска, проверка, отключение с подтверждением', async () => {
    const user = userEvent.setup();
    const view = render(<DiscordChannel settings={BASE} />, { wrapper: Providers });
    const input = screen.getByLabelText('Ссылка вебхука');
    await user.type(input, 'https://evil.example.com/api/webhooks/1/x');
    await user.click(screen.getByRole('button', { name: 'Подключить' }));
    expect(await screen.findByText(/Нужна ссылка вида/)).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, 'https://discord.com/api/webhooks/123/abc-DEF_1');
    await user.click(screen.getByRole('button', { name: 'Подключить' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/notifications/discord/webhook', {
        url: 'https://discord.com/api/webhooks/123/abc-DEF_1',
      }),
    );
    view.unmount();

    mocks.post.mockResolvedValue({ sent: true });
    render(
      <DiscordChannel
        settings={{
          ...BASE,
          discordEnabled: true,
          discordWebhookHint: 'discord.com/api/webhooks/123/••••',
        }}
      />,
      { wrapper: Providers },
    );
    const section = screen.getByTestId('discord-channel');
    expect(section).toHaveTextContent('discord.com/api/webhooks/123/••••');
    expect(section).toHaveTextContent('Подключён');
    await user.click(within(section).getByRole('button', { name: 'Проверить' }));
    await waitFor(() =>
      expect(mocks.toast.success).toHaveBeenCalledWith(
        'Проверочное сообщение отправлено в Discord',
      ),
    );
    await user.click(within(section).getByRole('button', { name: 'Отключить' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(mocks.delete).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Отключить' }));
    await waitFor(() =>
      expect(mocks.delete).toHaveBeenCalledWith('/notifications/discord/webhook'),
    );
  });

  it('почта: без SMTP — честное «не отправляются»; с SMTP — переключатель и сводка сейчас', async () => {
    const user = userEvent.setup();
    const off = render(<EmailChannel settings={{ ...BASE, emailAvailable: false }} />, {
      wrapper: Providers,
    });
    expect(screen.getByTestId('email-unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).toBeNull();
    off.unmount();

    mocks.post.mockResolvedValue({ sent: true, count: 3 });
    render(<EmailChannel settings={BASE} />, { wrapper: Providers });
    // Режимов «раз в день» нет: сводки по расписанию пока нет (ADR-0110).
    expect(screen.queryByText(/Раз в день/)).toBeNull();
    await user.click(screen.getByRole('button', { name: /Прислать сводку/ }));
    await waitFor(() =>
      expect(mocks.toast.success).toHaveBeenCalledWith('Письмо со сводкой отправлено (3)'),
    );
    await user.click(screen.getByRole('switch', { name: /Письма с уведомлениями/ }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/notifications/settings', { emailEnabled: false }),
    );
  });

  it('«Сбросить» — только после подтверждения', async () => {
    const user = userEvent.setup();
    render(<ResetNotificationSettings />, { wrapper: Providers });
    await user.click(screen.getByRole('button', { name: 'Сбросить' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Подписки браузеров на push сохранятся');
    expect(mocks.post).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Сбросить' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/notifications/settings/reset'));
  });
});
