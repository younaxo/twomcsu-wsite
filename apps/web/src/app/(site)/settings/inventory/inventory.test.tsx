import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import InventorySettingsPage from './page';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get },
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/inventory',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

const item = (over: Record<string, unknown> = {}) => ({
  id: 'minecraft:diamond_sword',
  count: 1,
  damage: 10,
  maxDamage: 1561,
  enchants: [{ id: 'minecraft:sharpness', level: 5 }],
  storedEnchants: [],
  name: [{ text: 'Меч Рассвета' }],
  lore: [[{ text: 'Подарок за событие' }]],
  loreTruncated: false,
  customModelData: null,
  itemsAdderId: null,
  unbreakable: false,
  dyeColor: null,
  potion: null,
  containerItemCount: null,
  ...over,
});

const mainGroup = {
  group: 'main',
  state: 'ok',
  capturedAt: '2026-11-20T10:00:00.000Z',
  playerOnline: false,
  isFresh: true,
  slots: [
    { area: 'hotbar', slot: 0, item: item() },
    {
      area: 'main',
      slot: 3,
      item: item({
        id: 'minecraft:apple',
        name: [],
        count: 16,
        lore: [],
        enchants: [],
        maxDamage: null,
        damage: null,
      }),
    },
  ],
};
const enderNoData = {
  group: 'ender',
  state: 'no_data',
  capturedAt: null,
  playerOnline: null,
  isFresh: true,
  slots: [],
};

const PRIVATE = { inventoryPublic: false, enderPublic: false };

function route(inventory: unknown, decorations: unknown = []) {
  const pick = (value: unknown) => {
    if (value instanceof Error) throw value;
    return value;
  };
  mocks.get.mockImplementation(async (path: string) => {
    if (path === '/inventory/me') return pick(inventory);
    if (path === '/inventory/me/privacy') return PRIVATE;
    if (path === '/users/me/decorations') return pick(decorations);
    throw new Error(`unexpected ${path}`);
  });
}

function renderPage() {
  return render(<InventorySettingsPage />, { wrapper: Providers });
}

const oneServer = (groups: unknown[]) => ({
  state: 'ok',
  servers: [{ server: { slug: 'anarchy', name: 'Анархия' }, groups }],
  viewer: { relation: 'owner' },
});

beforeEach(() => {
  mocks.get.mockReset();
  useAuthStore.setState({ status: 'authenticated', user: { id: 'u1', username: 'p' } as never });
});

describe('Настройки → Мой инвентарь', () => {
  it('загрузка: скелетон, без ошибки и пустого состояния', () => {
    mocks.get.mockImplementation(() => new Promise(() => undefined));
    renderPage();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByTestId('inventory-empty')).toBeNull();
  });

  it('ok: сетки слотов с подписями, часть без снимка сообщает об этом', async () => {
    route(oneServer([mainGroup, enderNoData]));
    renderPage();
    const grid = await screen.findByRole('grid', { name: 'Панель быстрого доступа' });
    expect(
      within(grid).getByRole('button', {
        name: 'Панель быстрого доступа, слот 1: Меч Рассвета, количество 1',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: 'Основной инвентарь' })).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: 'Броня' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Основной инвентарь, слот 4: Apple, количество 16' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('group-no-data')).toHaveTextContent(
      'Данных пока нет — сервер не прислал снимок.',
    );
    await waitFor(() =>
      expect(screen.getByTestId('inventory-privacy-note')).toHaveTextContent(
        'Инвентарь виден только вам.',
      ),
    );
  });

  it('выбор слота показывает описание предмета', async () => {
    route(oneServer([mainGroup]));
    renderPage();
    await userEvent.click(
      await screen.findByRole('button', { name: /Панель быстрого доступа, слот 1/ }),
    );
    const details = screen.getByTestId('item-details');
    expect(details).toHaveTextContent('Меч Рассвета');
    expect(details).toHaveTextContent('Прочность: 1551 из 1561');
    expect(details).toHaveTextContent('Sharpness 5');
    expect(details).toHaveTextContent('Подарок за событие');
  });

  it('клавиатура: одна точка входа Tab, стрелки/Home/End двигают фокус', async () => {
    route(oneServer([mainGroup]));
    renderPage();
    const grid = await screen.findByRole('grid', { name: 'Панель быстрого доступа' });
    const cells = within(grid).getAllByRole('button');
    expect(cells).toHaveLength(9);
    expect(cells.filter((cell) => cell.tabIndex === 0)).toHaveLength(1);
    cells[0].focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(cells[1]).toHaveFocus();
    expect(cells[1].tabIndex).toBe(0);
    expect(cells[0].tabIndex).toBe(-1);
    await userEvent.keyboard('{End}');
    expect(cells[8]).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(cells[0]).toHaveFocus();
  });

  it('пусто: нет серверов в ответе', async () => {
    route({ state: 'no_data', servers: [], viewer: { relation: 'owner' } });
    renderPage();
    expect(await screen.findByTestId('inventory-empty')).toHaveTextContent(
      'Данных пока нет — сервер не прислал снимок.',
    );
  });

  it('ошибка: безопасный ErrorState без деталей сервера, повтор доступен', async () => {
    route(new ApiError(500, ['SELECT * FROM secret_table failed']));
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).not.toHaveTextContent('secret_table');
    expect(within(alert).getByRole('button', { name: /Повторить/ })).toBeInTheDocument();
  });

  it('флаг выключен (503 inventory_unavailable): «скоро», украшения остаются', async () => {
    route(new ApiError(503, ['Раздел временно недоступен'], { code: 'inventory_unavailable' }), [
      {
        id: 'ud1',
        acquiredAt: '2026-11-01T00:00:00.000Z',
        decoration: { id: 'd1', slug: 'sun', name: 'Солнце', imageUrl: '' },
      },
    ]);
    renderPage();
    expect(await screen.findByTestId('inventory-disabled')).toHaveTextContent(
      'Инвентарь скоро появится',
    );
    expect(screen.queryByRole('grid')).toBeNull();
    expect(await screen.findByText('Солнце')).toBeInTheDocument();
  });

  it('украшения: пустой список', async () => {
    route({ state: 'no_data', servers: [], viewer: { relation: 'owner' } }, []);
    renderPage();
    expect(await screen.findByTestId('decorations-empty')).toBeInTheDocument();
  });
});
