import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ShellModeProvider } from '@/lib/site/shell-mode';
import { ThemeProvider } from '@/lib/theme/theme-provider';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: { src: string; alt: string }) => <img src={props.src} alt={props.alt} />,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/giveaway',
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

const MAIN = 'https://twomc.su';

describe('каркас: режим сайта розыгрыша (внешний)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchSpy = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchSpy);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderShell() {
    return render(
      <ShellModeProvider value={{ mainSiteUrl: MAIN, monochromeLogo: true }}>
        <SiteHeader />
        <SiteFooter />
      </ShellModeProvider>,
      { wrapper: Providers },
    );
  }

  it('шапка: логотип, навигация и «Войти» ведут на основной сайт абсолютными ссылками', () => {
    renderShell();
    const header = within(screen.getByTestId('site-header'));
    expect(header.getAllByRole('link', { name: /twomc\.su — на главную/ })[0]).toHaveAttribute(
      'href',
      MAIN,
    );
    const nav = within(header.getByRole('navigation', { name: 'Основная навигация' }));
    expect(nav.getByRole('link', { name: 'Магазин' })).toHaveAttribute('href', `${MAIN}/shop`);
    expect(nav.getByRole('link', { name: 'Правила' })).toHaveAttribute('href', `${MAIN}/rules`);
    expect(nav.getByRole('link', { name: 'Сервера' })).toHaveAttribute('href', `${MAIN}/servers`);
    expect(header.getByRole('link', { name: 'Войти' })).toHaveAttribute('href', `${MAIN}/login`);
  });

  it('надпись «twomc.su» без оранжевой «o»', () => {
    renderShell();
    for (const o of document.querySelectorAll('[data-wordmark-o]')) {
      expect(o.getAttribute('class')).not.toContain('text-primary');
    }
    expect(document.querySelectorAll('[data-wordmark-o="default"]').length).toBeGreaterThan(0);
  });

  it('футер: колонки на месте, внутренние ссылки абсолютные, запросов к API нет', () => {
    renderShell();
    const footer = within(screen.getByTestId('site-footer'));
    for (const name of ['Поддержка', 'Игрокам', 'Правовая информация']) {
      expect(footer.getByRole('navigation', { name })).toBeInTheDocument();
    }
    expect(footer.getByRole('link', { name: 'Политика Cookie' })).toHaveAttribute(
      'href',
      `${MAIN}/legal/cookies`,
    );
    expect(footer.getByRole('link', { name: 'Магазин' })).toHaveAttribute('href', `${MAIN}/shop`);
    expect(footer.getByText('Тема')).toBeInTheDocument();
    expect(footer.getByTestId('legal-owner')).toBeInTheDocument();
    expect(footer.getByText(/Статус серверов/)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('каркас: основной сайт без ShellModeProvider не меняется', () => {
  it('логотип ведёт на «/», «o» оранжевая, ссылки относительные', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    render(
      <>
        <SiteHeader />
        <SiteFooter />
      </>,
      { wrapper: Providers },
    );
    const header = within(screen.getByTestId('site-header'));
    expect(header.getAllByRole('link', { name: /twomc\.su — на главную/ })[0]).toHaveAttribute(
      'href',
      '/',
    );
    expect(header.getByRole('link', { name: 'Магазин' })).toHaveAttribute('href', '/shop');
    expect(document.querySelector('[data-wordmark-o="default"]')?.getAttribute('class')).toContain(
      'text-primary',
    );
    vi.unstubAllGlobals();
  });
});
