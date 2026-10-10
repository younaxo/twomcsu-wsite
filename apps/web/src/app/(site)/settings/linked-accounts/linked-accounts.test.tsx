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
});
