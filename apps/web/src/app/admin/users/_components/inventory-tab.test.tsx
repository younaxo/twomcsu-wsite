import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdminUserFull } from '@twomc/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import { InventoryTab } from './inventory-tab';

const mocks = vi.hoisted(() => ({ get: vi.fn(), granted: new Set<string>() }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get },
}));
vi.mock('@/lib/auth/use-permissions', () => ({
  usePermissions: () => ({
    can: (requirement: string | readonly string[]) =>
      (Array.isArray(requirement) ? requirement : [requirement]).some((key) =>
        mocks.granted.has(key as string),
      ),
  }),
}));

const USER = { id: 'target1', username: 'builder' } as unknown as AdminUserFull;
const VIEWER = { relation: 'admin' as const };
const STATS = {
  state: 'ok',
  stats: {
    playTimeMinutes: 135,
    kills: 7,
    deaths: 2,
    hits: 40,
    killDeathRatio: 3.5,
    lastServer: 'survival',
    updatedAt: '2026-11-27T10:00:00.000Z',
  },
  viewer: VIEWER,
};

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

function route(inventory: () => unknown, stats: () => unknown) {
  mocks.get.mockImplementation((path: string) =>
    Promise.resolve().then(() => (path.endsWith('/stats') ? stats() : inventory())),
  );
}

beforeEach(() => {
  mocks.granted.clear();
  mocks.get.mockReset();
  useAuthStore.setState({ status: 'authenticated', user: { id: 'admin1' } as never });
});

describe('Инвентарь и статистика в карточке пользователя (Q116)', () => {
  it('без права players.inventory.view: ничего не рендерится и запросов нет', () => {
    const { container } = render(<InventoryTab user={USER} />, { wrapper: Providers });
    expect(container).toBeEmptyDOMElement();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('загрузка: скелетоны, затем статистика', async () => {
    mocks.granted.add('players.inventory.view');
    route(
      () => ({ state: 'no_data', servers: [], viewer: VIEWER }),
      () => STATS,
    );
    render(<InventoryTab user={USER} />, { wrapper: Providers });
    expect(screen.getByTestId('player-inventory-tab')).toHaveAttribute('aria-live', 'polite');
    const stats = await screen.findByTestId('player-stats');
    expect(stats).toHaveTextContent('2 ч 15 мин');
    expect(stats).toHaveTextContent('3.50');
    expect(mocks.get).toHaveBeenCalledWith('/admin/players/target1/inventory');
  });

  it('нет данных: подпись про игрока без плагина', async () => {
    mocks.granted.add('players.inventory.view');
    route(
      () => ({ state: 'no_data', servers: [], viewer: VIEWER }),
      () => ({ state: 'no_data', stats: null, viewer: VIEWER }),
    );
    render(<InventoryTab user={USER} />, { wrapper: Providers });
    expect(await screen.findByTestId('player-inventory-empty')).toHaveTextContent(
      'Нет снимка — игрок ещё не заходил на сервер с плагином.',
    );
    expect(await screen.findByTestId('player-stats-empty')).toBeInTheDocument();
  });

  it('ошибка: сообщение и повтор перезапрашивает', async () => {
    mocks.granted.add('players.inventory.view');
    let fail = true;
    route(
      () => {
        if (fail) throw new ApiError(500, ['Сбой']);
        return { state: 'no_data', servers: [], viewer: VIEWER };
      },
      () => STATS,
    );
    render(<InventoryTab user={USER} />, { wrapper: Providers });
    const retry = await screen.findByRole('button', { name: /повторить/i });
    fail = false;
    await userEvent.setup().click(retry);
    expect(await screen.findByTestId('player-inventory-empty')).toBeInTheDocument();
  });

  it('403: сообщение о нехватке прав без данных', async () => {
    mocks.granted.add('players.inventory.view');
    route(
      () => {
        throw new ApiError(403, ['x'], { code: 'admin_2fa_required' });
      },
      () => {
        throw new ApiError(403, ['x'], { code: 'forbidden' });
      },
    );
    render(<InventoryTab user={USER} />, { wrapper: Providers });
    await waitFor(() => expect(screen.getAllByText('Недостаточно прав')).toHaveLength(2));
    expect(screen.queryByTestId('player-stats')).toBeNull();
  });
});
