import { readFileSync } from 'fs';
import { join } from 'path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OfflinePage from '@/app/offline/page';
import { ErrorState } from '@/components/ui/error-state';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { useConnectivity } from '@/lib/site/connectivity';
import { ConnectivityMonitor } from './connectivity-monitor';

const navigation = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));

function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

/// Песочница Service Worker: выполняет public/sw.js с фальшивыми self/caches/
/// fetch и возвращает обработчик fetch — проверяем политику кэширования.
function loadServiceWorker(network: (request: Request) => Promise<Response>) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const store = new Map<string, Response>();
  const cache = {
    match: async (request: Request | string) =>
      store.get(typeof request === 'string' ? request : new URL(request.url).pathname)?.clone(),
    put: async (request: Request, response: Response) =>
      void store.set(new URL(request.url).pathname, response),
    add: async () => undefined,
    addAll: async () => undefined,
  };
  const self = {
    location: new URL('https://twomc.su/'),
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      listeners[type] = handler;
    },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  };
  const caches = {
    open: async () => cache,
    match: (request: Request | string) => cache.match(request),
    keys: async () => [],
    delete: async () => true,
  };
  const source = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf-8');
  new Function('self', 'caches', 'fetch', 'Response', source)(self, caches, network, Response);
  const dispatch = (request: Request) => {
    let responded: Promise<Response> | null = null;
    listeners.fetch!({ request, respondWith: (value: Promise<Response>) => (responded = value) });
    return responded as Promise<Response> | null;
  };
  return { dispatch, store };
}

const navigate = (url: string) => {
  const request = new Request(url);
  Object.defineProperty(request, 'mode', { value: 'navigate' });
  return request;
};

describe('Service Worker (ADR-0086)', () => {
  it('никогда не перехватывает API, авторизацию, не-GET и запросы с параметрами', () => {
    const { dispatch } = loadServiceWorker(() => Promise.resolve(new Response('net')));
    expect(dispatch(new Request('https://api.twomc.su/users/me'))).toBeNull();
    expect(
      dispatch(
        new Request('https://twomc.su/_next/static/chunk.js', {
          headers: { Authorization: 'Bearer x' },
        }),
      ),
    ).toBeNull();
    expect(
      dispatch(new Request('https://twomc.su/_next/static/a.js', { method: 'POST' })),
    ).toBeNull();
    expect(dispatch(new Request('https://twomc.su/icon.png?connectivity=1'))).toBeNull();
    expect(dispatch(new Request('https://twomc.su/admin/users'))).toBeNull();
  });

  it('статика кэшируется; страницы — из сети, без сети — /offline', async () => {
    let online = true;
    const { dispatch, store } = loadServiceWorker((request) =>
      online
        ? Promise.resolve(new Response(`net:${new URL(request.url).pathname}`))
        : Promise.reject(new TypeError('offline')),
    );
    store.set('/offline', new Response('offline-page'));

    const asset = await dispatch(new Request('https://twomc.su/_next/static/app.js'));
    expect(await asset!.text()).toBe('net:/_next/static/app.js');
    expect(store.has('/_next/static/app.js')).toBe(true);

    const page = await dispatch(navigate('https://twomc.su/shop'));
    expect(await page!.text()).toBe('net:/shop');
    // HTML страниц в кэш не кладётся.
    expect(store.has('/shop')).toBe(false);

    online = false;
    const fallback = await dispatch(navigate('https://twomc.su/shop'));
    expect(await fallback!.text()).toBe('offline-page');
    const cached = await dispatch(new Request('https://twomc.su/_next/static/app.js'));
    expect(await cached!.text()).toBe('net:/_next/static/app.js');
  });
});

describe('ConnectivityMonitor', () => {
  beforeEach(() => {
    navigation.pathname = '/';
    useConnectivity.setState({
      status: 'online',
      attempt: 0,
      checking: false,
      nextCheckAt: null,
      recoveries: 0,
    });
  });

  it('онлайн — ничего; нет сети — плашка с повтором; на /offline — не дублируется', async () => {
    const user = userEvent.setup();
    const check = vi.fn(async () => undefined);
    useConnectivity.setState({ check });
    const { rerender } = render(<ConnectivityMonitor />, { wrapper: Providers });
    expect(screen.queryByTestId('connectivity-banner')).toBeNull();

    useConnectivity.setState({ status: 'offline', nextCheckAt: Date.now() + 10_000 });
    rerender(<ConnectivityMonitor />);
    const banner = await screen.findByTestId('connectivity-banner');
    expect(banner).toHaveTextContent('Нет подключения к интернету');
    expect(banner).toHaveTextContent(/Повторим через \d+ с/);
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(check).toHaveBeenCalled();

    useConnectivity.setState({ status: 'api-down' });
    rerender(<ConnectivityMonitor />);
    expect(screen.getByTestId('connectivity-banner')).toHaveTextContent(
      'Сервер twomc.su не отвечает',
    );

    navigation.pathname = '/offline';
    rerender(<ConnectivityMonitor />);
    expect(screen.queryByTestId('connectivity-banner')).toBeNull();
  });

  it('событие браузера offline — только повод проверить', () => {
    const check = vi.fn(async () => undefined);
    useConnectivity.setState({ check });
    render(<ConnectivityMonitor />, { wrapper: Providers });
    window.dispatchEvent(new Event('offline'));
    expect(check).toHaveBeenCalledTimes(1);
    expect(useConnectivity.getState().status).toBe('online');
  });
});

describe('страницы и состояния', () => {
  it('/offline — без данных API, с повтором', () => {
    render(<OfflinePage />);
    expect(screen.getByTestId('offline-page')).toHaveTextContent('Нет подключения');
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'twomc.su' })).toHaveAttribute('src', '/icon.png');
  });

  it('ErrorState: сеть, техработы, выключенный модуль, 5xx', () => {
    const cases: [unknown, string][] = [
      [new NetworkError(), 'Нет соединения с сервером'],
      [new ApiError(503, ['x'], { code: 'MAINTENANCE' }), 'Идут технические работы'],
      [new ApiError(503, ['x'], { code: 'MODULE_DISABLED' }), 'Раздел временно недоступен'],
      [new ApiError(502, ['x']), 'Сервер временно не отвечает'],
      [new ApiError(400, ['x']), 'Не удалось загрузить данные'],
    ];
    for (const [error, title] of cases) {
      const { unmount } = render(<ErrorState error={error} />);
      expect(screen.getByRole('alert')).toHaveTextContent(title);
      unmount();
    }
  });
});
