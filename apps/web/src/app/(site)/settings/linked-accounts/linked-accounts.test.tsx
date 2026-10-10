import type { LinkedAccountDto } from '@twomc/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuthStore } from '@/lib/auth/store';
import LinkedAccountsPage from './page';

/// «Связанные аккаунты» (ADR-0095): один реестр Discord / Telegram / VK /
/// Steam, видимость по провайдеру, VK и Steam без интеграции — «Скоро».

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: mocks,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/linked-accounts',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

const telegram: LinkedAccountDto = {
  provider: 'telegram',
  username: 'player_tg',
  displayName: 'Player',
  avatarUrl: null,
  isPublic: true,
  linkedAt: '2026-10-01T00:00:00.000Z',
  lastLoginAt: null,
  profileUrl: 'https://t.me/player_tg',
};

const discord: LinkedAccountDto = {
  provider: 'discord',
  username: 'younaxo',
  displayName: 'younaxo',
  avatarUrl: null,
  isPublic: true,
  linkedAt: '2026-10-01T00:00:00.000Z',
  lastLoginAt: null,
  profileUrl: 'https://discord.com/users/312345678901234567',
};

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.get.mockImplementation(async (path: string) =>
    path === '/auth/social/providers'
      ? {
          discord: { enabled: true },
          telegram: { enabled: true },
          vk: { enabled: false },
          steam: { enabled: false },
        }
      : [telegram],
  );
  mocks.patch.mockImplementation(async (_path: string, body: { isPublic: boolean }) => [
    { ...telegram, ...body },
  ]);
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'u1', username: 'player' } as never,
  });
});

const row = (provider: string) =>
  document.querySelector(`li[data-provider="${provider}"]`) as HTMLElement;

function serve(accounts: LinkedAccountDto[]) {
  mocks.get.mockImplementation(async (path: string) =>
    path === '/auth/social/providers'
      ? {
          discord: { enabled: true },
          telegram: { enabled: true },
          vk: { enabled: false },
          steam: { enabled: false },
        }
      : accounts,
  );
}

describe('Настройки → Связанные аккаунты', () => {
  it('четыре провайдера из одного реестра в одном порядке', async () => {
    render(<LinkedAccountsPage />, { wrapper: Providers });
    await screen.findByText('@player_tg · Player');
    const providers = Array.from(document.querySelectorAll('li[data-provider]')).map((li) =>
      li.getAttribute('data-provider'),
    );
    expect(providers).toEqual(['discord', 'telegram', 'vk', 'steam']);
    expect(row('discord')).toHaveAttribute('data-state', 'unlinked');
    expect(row('telegram')).toHaveAttribute('data-state', 'linked');
  });

  it('VK и Steam — «Скоро»: привязать нельзя, запросов нет, ручного ввода нет', async () => {
    const user = userEvent.setup();
    render(<LinkedAccountsPage />, { wrapper: Providers });
    await screen.findByText('@player_tg · Player');
    for (const provider of ['vk', 'steam']) {
      expect(row(provider)).toHaveAttribute('data-state', 'soon');
      const soon = within(row(provider)).getByRole('button', { name: /Скоро/ });
      expect(soon).toHaveAttribute('aria-disabled');
      await user.click(soon);
      expect(within(row(provider)).queryByRole('textbox')).toBeNull();
    }
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('видимость — отдельно по провайдеру: скрыть Telegram → PATCH и метка «Скрыт в профиле»', async () => {
    const user = userEvent.setup();
    render(<LinkedAccountsPage />, { wrapper: Providers });
    await screen.findByText('@player_tg · Player');
    const toggle = within(row('telegram')).getByRole('switch', { name: 'Показывать в профиле' });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/auth/linked-accounts/telegram', {
        isPublic: false,
      }),
    );
    await waitFor(() => expect(row('telegram')).toHaveAttribute('data-state', 'hidden'));
    expect(within(row('telegram')).getByText('Скрыт в профиле')).toBeInTheDocument();
  });

  it('«Открыть профиль»: Discord — по snowflake из привязки, Telegram — t.me', async () => {
    serve([discord, telegram]);
    render(<LinkedAccountsPage />, { wrapper: Providers });
    await screen.findByText('@player_tg · Player');
    expect(within(row('discord')).getByRole('link', { name: 'Открыть профиль' })).toHaveAttribute(
      'href',
      'https://discord.com/users/312345678901234567',
    );
    expect(within(row('telegram')).getByRole('link', { name: 'Открыть профиль' })).toHaveAttribute(
      'href',
      'https://t.me/player_tg',
    );
  });

  it('нет публичной страницы (Telegram без ника) — «Открыть профиль» недоступно, без выдуманной ссылки', async () => {
    serve([{ ...telegram, username: null, profileUrl: null }]);
    render(<LinkedAccountsPage />, { wrapper: Providers });
    await screen.findByText('Player');
    expect(within(row('telegram')).queryByRole('link')).toBeNull();
    expect(
      within(row('telegram')).getByRole('button', { name: 'Открыть профиль' }),
    ).toHaveAttribute('aria-disabled');
  });

  it('отвязка — только после подтверждения', async () => {
    const user = userEvent.setup();
    mocks.delete.mockResolvedValue([]);
    render(<LinkedAccountsPage />, { wrapper: Providers });
    await screen.findByText('@player_tg · Player');
    await user.click(within(row('telegram')).getByRole('button', { name: 'Отвязать' }));
    expect(mocks.delete).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog', { name: /Отключить Telegram/ });
    await user.click(within(dialog).getByRole('button', { name: 'Отключить' }));
    await waitFor(() =>
      expect(mocks.delete).toHaveBeenCalledWith('/auth/linked-accounts/telegram'),
    );
  });

  it('не удалось начать привязку — состояние «Ошибка» с причиной и «Повторить»', async () => {
    const user = userEvent.setup();
    mocks.post.mockRejectedValue(new Error('Discord временно недоступен'));
    render(<LinkedAccountsPage />, { wrapper: Providers });
    await screen.findByText('@player_tg · Player');
    await user.click(within(row('discord')).getByRole('button', { name: 'Подключить' }));
    await waitFor(() => expect(row('discord')).toHaveAttribute('data-state', 'error'));
    expect(row('discord')).toHaveTextContent('Ошибка');
    expect(within(row('discord')).getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });

  it('«Требуется повторная авторизация» не выдумывается: источника нет — состояния нет', async () => {
    serve([discord, telegram]);
    render(<LinkedAccountsPage />, { wrapper: Providers });
    await screen.findByText('@player_tg · Player');
    expect(document.querySelector('li[data-state="reauth"]')).toBeNull();
    expect(screen.queryByText('Требуется повторная авторизация')).toBeNull();
  });
});
