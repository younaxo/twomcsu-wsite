import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import ServersPage from '../page';
import ServerDetailPage from './page';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get },
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'survival' }),
  usePathname: () => '/servers/survival',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/lib/site/status', () => ({
  useModuleAvailability: () => ({ reason: null, bypass: false, maintenance: null }),
}));
vi.mock('@/lib/site/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/site/hooks')>()),
  useServersOverview: () => ({
    isPending: false,
    isError: false,
    isSuccess: true,
    isFetching: false,
    refetch: vi.fn(),
    data: {
      totalServers: 1,
      onlineServers: 1,
      totalPlayers: 3,
      servers: [
        {
          id: 's1',
          slug: 'survival',
          name: 'Выживание',
          online: true,
          playerCount: 3,
          maxPlayers: 100,
        },
      ],
    },
  }),
}));

const CARD = {
  id: 's1',
  name: 'Выживание',
  slug: 'survival',
  address: 'play.twomc.su',
  port: 25570,
  type: 'survival',
  description: 'Ванильное выживание',
  iconUrl: null,
  maxPlayers: 100,
  version: '1.21',
};
const STATUS = {
  online: true,
  playerCount: 3,
  maxPlayers: 100,
  version: '1.21',
  motd: null,
  ping: 42,
};
const HISTORY = [
  {
    id: 'h2',
    online: true,
    playerCount: 5,
    maxPlayers: 100,
    timestamp: '2026-11-22T10:00:00.000Z',
  },
  {
    id: 'h1',
    online: true,
    playerCount: 2,
    maxPlayers: 100,
    timestamp: '2026-11-22T09:00:00.000Z',
  },
];

function route(overrides: Record<string, unknown | (() => never)> = {}) {
  mocks.get.mockImplementation(async (path: string) => {
    const key = path.replace('/servers/survival', '') || 'card';
    const value =
      key in overrides
        ? overrides[key]
        : { card: CARD, '/status': STATUS, '/players': ['Steve', 'Alex'], '/history': HISTORY }[
            key
          ];
    if (value instanceof Error) throw value;
    return value;
  });
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mocks.get.mockReset();
});

describe('/servers/[slug]', () => {
  it('показывает скелетон, затем карточку, статус, график и игроков', async () => {
    route();
    render(<ServerDetailPage />, { wrapper: Providers });
    expect(screen.getByTestId('server-skeleton')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: 'Выживание' })).toBeVisible();
    expect(await screen.findByTestId('server-address')).toHaveTextContent('play.twomc.su:25570');
    expect(await screen.findByText('42 мс')).toBeVisible();
    const chart = await screen.findByTestId('online-chart');
    expect(within(chart).getByRole('img')).toHaveAccessibleName(/от 2 до 5 игроков, замеров 2/);
    const players = await screen.findByTestId('server-players');
    expect(
      within(players)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Steve', 'Alex']);
    expect(mocks.get).toHaveBeenCalledWith('/servers/survival', { auth: false });
  });

  it('404: честное «Сервер не найден», без запросов статуса', async () => {
    route({ card: new ApiError(404, ['Сервер не найден']) });
    render(<ServerDetailPage />, { wrapper: Providers });
    expect(await screen.findByText('Сервер не найден')).toBeVisible();
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });

  it('пустые игроки и мало истории: пустые состояния', async () => {
    route({ '/players': [], '/history': [HISTORY[0]] });
    render(<ServerDetailPage />, { wrapper: Providers });
    expect(await screen.findByText('Список недоступен или пуст')).toBeVisible();
    expect(await screen.findByText('Истории пока мало')).toBeVisible();
  });

  it('ошибка статуса не ломает страницу и даёт повтор', async () => {
    route({ '/status': new ApiError(500, ['Сбой']) });
    render(<ServerDetailPage />, { wrapper: Providers });
    expect(await screen.findByRole('heading', { level: 1, name: 'Выживание' })).toBeVisible();
    expect(await screen.findAllByRole('button', { name: /Повторить/ })).not.toHaveLength(0);
  });
});

describe('/servers → ссылка на страницу сервера', () => {
  it('название сервера ведёт на /servers/[slug]', () => {
    render(<ServersPage />, { wrapper: Providers });
    expect(screen.getByRole('link', { name: 'Выживание' })).toHaveAttribute(
      'href',
      '/servers/survival',
    );
  });
});
