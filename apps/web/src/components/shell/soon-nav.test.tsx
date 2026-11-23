import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuthStore } from '@/lib/auth/store';
import { ThemeProvider } from '@/lib/theme/theme-provider';
import { installFetchMock, jsonResponse, requestInfo } from '@/test/http';
import { MobileNav } from './mobile-nav';
import { SidebarRail } from './sidebar-rail';
import { SiteHeader } from './site-header';

// Тестовый конфиг: раздел «Правила» помечен как неготовый (available: false).
vi.mock('@/lib/site/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/site/config')>();
  return {
    ...actual,
    SITE_NAVIGATION: actual.SITE_NAVIGATION.map((item) =>
      item.href === '/rules' ? { ...item, available: false } : item,
    ),
  };
});
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
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

beforeEach(() => {
  const fetchMock = installFetchMock();
  fetchMock.mockImplementation(async (...args) => {
    const { path } = requestInfo(args);
    if (path.startsWith('/servers/overview')) {
      return jsonResponse({ totalServers: 0, onlineServers: 0, totalPlayers: 0, servers: [] });
    }
    return new Response(null, { status: 404 });
  });
  useAuthStore.setState({ status: 'anonymous', user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function expectSoon(el: HTMLElement) {
  expect(el).toHaveAttribute('aria-disabled', 'true');
  expect(el).toHaveAttribute('tabindex', '0');
  expect(el).not.toHaveAttribute('href');
  expect(el.closest('a')).toBeNull();
  // Контраст: без двойного ослабления (text-muted-foreground/70 + opacity-60).
  expect(el.className).not.toMatch(/text-muted-foreground\/\d+/);
  expect(el.className).not.toMatch(/\bopacity-\d+/);
  expect(el.className).toContain('focus-visible:ring-2');
}

describe('ветка «Скоро» в навигации', () => {
  it('SiteHeader: «Правила» — фокусируемый aria-disabled элемент без перехода', () => {
    render(<SiteHeader />, { wrapper: Providers });
    const nav = screen.getByRole('navigation', { name: 'Основная навигация' });
    const soon = nav.querySelector('[data-soon="true"]') as HTMLElement;
    expect(soon).not.toBeNull();
    expect(soon).toHaveTextContent('Правила');
    expect(soon).toHaveTextContent('Скоро');
    expectSoon(soon);
    expect(within(nav).queryByRole('link', { name: 'Правила' })).toBeNull();
    expect(within(nav).getByRole('link', { name: 'Магазин' })).toHaveAttribute('href', '/shop');
  });

  it('SidebarRail: «Скоро» достижим с клавиатуры, tooltip открывается по фокусу', async () => {
    const user = userEvent.setup();
    render(<SidebarRail />, { wrapper: Providers });
    const rail = screen.getByTestId('sidebar-rail');
    const soon = rail.querySelector('[data-soon="true"]') as HTMLElement;
    expect(soon).not.toBeNull();
    expect(soon).toHaveTextContent('Правила');
    expectSoon(soon);
    expect(within(rail).queryByRole('link', { name: 'Правила' })).toBeNull();

    await user.tab();
    let guard = 0;
    while (document.activeElement !== soon && guard++ < 20) {
      await user.tab();
    }
    expect(soon).toHaveFocus();
    await waitFor(() => expect(screen.getAllByText('Скоро').length).toBeGreaterThan(0));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Скоро');
  });

  it('MobileNav: «Правила» — не ссылка, подпись «Скоро» для скринридера', () => {
    render(<MobileNav />);
    const nav = screen.getByRole('navigation', { name: 'Разделы сайта' });
    const soon = nav.querySelector('[data-soon="true"]') as HTMLElement;
    expect(soon).not.toBeNull();
    expect(soon).toHaveTextContent('Правила');
    expect(soon.querySelector('.sr-only')).toHaveTextContent('Скоро');
    expectSoon(soon);
    const labels = within(nav)
      .getAllByRole('link')
      .map((link) => link.getAttribute('aria-label'));
    expect(labels).toEqual(['Главная', 'Магазин', 'Сервера', 'Бонусы']);
  });
});
