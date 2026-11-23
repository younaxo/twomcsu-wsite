import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFetchMock, jsonResponse, requestInfo, type FetchMock } from '@/test/http';
import { HomeEvents } from './events-section';
import { HomeNews } from './news-section';
import { HomeServers } from './servers-section';
import { HomeShop } from './shop-section';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const RAW = 'QueryFailedError: relation "news" does not exist';

let fetchMock: FetchMock;
beforeEach(() => {
  fetchMock = installFetchMock();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function failing(status: number, key: string) {
  fetchMock.mockImplementation(async (...args) => {
    const { path } = requestInfo(args);
    if (path.startsWith(key)) {
      return jsonResponse(
        { message: RAW, code: status === 503 ? 'MODULE_DISABLED' : undefined },
        { status },
      );
    }
    return jsonResponse([]);
  });
}

describe('блоки главной: ошибка вместо пустого состояния', () => {
  it('новости: безопасный текст без деталей API и «Повторить»', async () => {
    failing(500, '/news/latest');
    render(<HomeNews />, { wrapper: Providers });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Не удалось загрузить новости');
    expect(alert).not.toHaveTextContent('QueryFailedError');
    expect(within(alert).getByRole('button', { name: 'Повторить' })).toBeInTheDocument();

    fetchMock.mockImplementation(async () => jsonResponse([]));
    await userEvent.click(within(alert).getByRole('button', { name: 'Повторить' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByText('Пока нет данных')).toBeInTheDocument();
  });

  it('магазин: 503 «недоступно» отличается от пустого каталога', async () => {
    failing(503, '/store/products');
    render(<HomeShop />, { wrapper: Providers });
    const grid = await screen.findByTestId('home-shop-grid');
    await waitFor(() => expect(within(grid).getByRole('alert')).toBeInTheDocument());
    expect(grid).toHaveTextContent('Раздел сейчас недоступен');
    expect(grid).not.toHaveTextContent('QueryFailedError');
    expect(grid).not.toHaveTextContent('Каталог наполняется');
  });

  it('события: ошибка не маскируется под «ничего не запланировано»', async () => {
    failing(500, '/events');
    render(<HomeEvents />, { wrapper: Providers });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Не удалось загрузить события');
    expect(screen.queryByText('Пока ничего не запланировано')).toBeNull();
  });

  it('сервера: ошибка — ErrorState с повтором и кодом', async () => {
    failing(500, '/servers/overview');
    render(<HomeServers />, { wrapper: Providers });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Не удалось опросить сервера');
    expect(alert).toHaveTextContent('Код ошибки: 500');
    expect(within(alert).getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });
});
