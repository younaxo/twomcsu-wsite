import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuthStore } from '@/lib/auth/store';
import { ThemeProvider } from '@/lib/theme/theme-provider';
import { installFetchMock, jsonResponse, requestInfo, type FetchMock } from '@/test/http';
import { CartButton } from './floating-actions';
import { SidebarRail } from './sidebar-rail';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

const navigation = vi.hoisted(() => ({ pathname: '/shop/cart' }));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function route(fetchMock: FetchMock, handlers: Record<string, unknown>) {
  fetchMock.mockImplementation(async (...args) => {
    const { path } = requestInfo(args);
    const key = Object.keys(handlers).find((prefix) => path.startsWith(prefix));
    if (key === undefined) {
      return new Response(null, { status: 404 });
    }
    const value = handlers[key];
    if (value instanceof Error) {
      throw value;
    }
    return jsonResponse(value);
  });
}

const overview = { totalServers: 2, onlineServers: 2, totalPlayers: 1035, servers: [] };
const settings = {
  siteName: 'twomc.su',
  siteDescription: null,
  siteLogo: null,
  contactEmail: 'support@twomc.su',
  socials: { discord: 'https://discord.gg/x', vk: null, telegram: 'https://t.me/x', youtube: null },
  registrationEnabled: true,
  modules: { chat: true, friends: true, store: true, comments: true, news: true, reports: true },
  meta: { title: null, description: null, keywords: [] },
  updatedAt: '2026-10-09T00:00:00.000Z',
};

let fetchMock: FetchMock;

beforeEach(() => {
  fetchMock = installFetchMock();
  useAuthStore.setState({ status: 'anonymous', user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SidebarRail', () => {
  it('не раскрывается: нет кнопок collapse/expand, только иконки с aria-label и tooltip', async () => {
    route(fetchMock, { '/servers/overview': overview, '/site/settings': settings });
    render(<SidebarRail />, { wrapper: Providers });
    const rail = screen.getByTestId('sidebar-rail');
    expect(
      within(rail).queryByRole('button', { name: /свернуть|развернуть|collapse|expand/i }),
    ).toBeNull();
    const shop = within(rail).getByRole('link', { name: 'Магазин' });
    expect(shop).toHaveAttribute('href', '/shop');
    expect(shop.textContent).toBe('');
    expect(within(rail).getByRole('link', { name: 'Правила' })).toBeInTheDocument();
    expect(within(rail).getByRole('link', { name: 'Сервера' })).toBeInTheDocument();
  });

  it('активный раздел определяется по вложенному маршруту', async () => {
    route(fetchMock, { '/servers/overview': overview, '/site/settings': settings });
    render(<SidebarRail />, { wrapper: Providers });
    const rail = screen.getByTestId('sidebar-rail');
    expect(within(rail).getByRole('link', { name: 'Магазин' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(rail).getByRole('link', { name: 'Главная' })).not.toHaveAttribute('aria-current');
  });

  it('общий онлайн: сначала загрузка, потом реальное число; соцсети — из настроек сайта', async () => {
    route(fetchMock, { '/servers/overview': overview, '/site/settings': settings });
    render(<SidebarRail />, { wrapper: Providers });
    expect(screen.getByTestId('online-counter')).toHaveAccessibleName('Загружаем онлайн');
    await waitFor(() => expect(screen.getByTestId('online-counter')).toHaveTextContent('1 035'));
    expect(screen.getByTestId('online-counter')).toHaveAccessibleName(/1.035 игроков/);
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Telegram' })).toHaveAttribute(
        'href',
        'https://t.me/x',
      ),
    );
    expect(screen.queryByRole('link', { name: 'TikTok' })).toBeNull();
  });

  it('онлайн недоступен — fallback «—», без выдуманных чисел', async () => {
    route(fetchMock, { '/servers/overview': new Error('network'), '/site/settings': settings });
    render(<SidebarRail />, { wrapper: Providers });
    await waitFor(() => expect(screen.getByTestId('online-counter')).toHaveTextContent('—'));
    expect(screen.getByTestId('online-counter')).toHaveAccessibleName('Онлайн недоступен');
  });
});

describe('SiteHeader', () => {
  it('анониму — логотип twomc.su, навигация и кнопка «Войти», без колокольчика', async () => {
    route(fetchMock, { '/servers/overview': overview, '/site/settings': settings });
    render(<SiteHeader />, { wrapper: Providers });
    expect(screen.getByRole('link', { name: 'twomc.su — на главную' })).toHaveAttribute(
      'href',
      '/',
    );
    const nav = screen.getByRole('navigation', { name: 'Основная навигация' });
    expect(within(nav).getByRole('link', { name: 'Магазин' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: /Войти/ })).toHaveAttribute(
      'href',
      '/login?next=%2Fshop%2Fcart',
    );
    expect(screen.queryByRole('button', { name: /Уведомления/ })).toBeNull();
  });

  it('вошедшему — профиль с префиксом роли и счётчик непрочитанных', async () => {
    route(fetchMock, {
      '/servers/overview': overview,
      '/site/settings': settings,
      '/notifications/unread-count': { count: 3 },
    });
    useAuthStore.setState({
      status: 'authenticated',
      user: {
        id: 'u1',
        shortId: 1,
        tag: 'younaxo#0001',
        email: 'a@b.c',
        username: 'younaxo_',
        accountType: 'DEFAULT',
        mustChangePassword: false,
        roles: [
          {
            id: 'r',
            name: 'Chief Curator',
            slug: 'chief-curator',
            displayName: 'Chief Curator',
            color: null,
            priority: 900,
            isSuperuser: true,
          },
        ],
        permissions: { superuser: true, permissions: [], maxPriority: 900 },
      },
    });
    render(<SiteHeader />, { wrapper: Providers });
    expect(screen.getByRole('button', { name: 'Профиль: younaxo_' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('unread-badge')).toHaveTextContent('3'));
    expect(screen.getByRole('button', { name: 'Уведомления, 3 новых' })).toBeInTheDocument();
  });
});

describe('SiteFooter', () => {
  it('правовые ссылки без документов помечены «скоро», соцсети и e-mail из настроек, статус и оплата на месте', async () => {
    route(fetchMock, { '/servers/overview': overview, '/site/settings': settings });
    render(<SiteFooter />, { wrapper: Providers });
    const legal = screen.getByRole('navigation', { name: 'Правовая информация' });
    expect(within(legal).queryAllByRole('link')).toHaveLength(0);
    expect(within(legal).getByText('Политика конфиденциальности')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Discord' })).toHaveAttribute(
        'href',
        'https://discord.gg/x',
      ),
    );
    expect(screen.getByRole('link', { name: 'support@twomc.su' })).toHaveAttribute(
      'href',
      'mailto:support@twomc.su',
    );
    expect(screen.getByRole('button', { name: 'Язык: Русский' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Статус серверов/ })).toHaveAttribute(
        'data-health',
        'operational',
      ),
    );
    expect(screen.getByRole('link', { name: /Статус серверов/ })).toHaveAttribute(
      'href',
      '/status',
    );
    expect(
      within(screen.getByRole('list', { name: 'Способы оплаты' })).getAllByRole('listitem'),
    ).toHaveLength(4);
    expect(screen.getByText(/© \d{4} twomc\.su/)).toBeInTheDocument();
    expect(screen.queryByText(/TwoMC\b/)).toBeNull();
  });
});

describe('CartButton', () => {
  it('анониму — приглашение войти; вошедшему — счётчик по количеству', async () => {
    route(fetchMock, {
      '/store/cart': {
        id: 'c',
        items: [
          { id: 'i1', quantity: 2 },
          { id: 'i2', quantity: 1 },
        ],
        total: '1500',
      },
    });
    const { unmount } = render(<CartButton />, { wrapper: Providers });
    expect(screen.getByRole('button', { name: 'Корзина' })).toBeInTheDocument();
    expect(screen.queryByTestId('cart-count')).toBeNull();
    unmount();

    useAuthStore.setState({
      status: 'authenticated',
      user: {
        id: 'u1',
        shortId: 1,
        tag: 'a#1',
        email: 'a@b.c',
        username: 'a',
        accountType: 'DEFAULT',
        mustChangePassword: false,
        roles: [],
        permissions: { superuser: false, permissions: [], maxPriority: null },
      },
    });
    render(<CartButton />, { wrapper: Providers });
    await waitFor(() => expect(screen.getByTestId('cart-count')).toHaveTextContent('3'));
    expect(screen.getByRole('button', { name: 'Корзина, 3 товара' })).toBeInTheDocument();
  });
});
