import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
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

  it('шапка: логотип на основной сайт, навигации нет, «Войти» неактивна с подсказкой «Скоро»', async () => {
    renderShell();
    const header = within(screen.getByTestId('site-header'));
    expect(header.getAllByRole('link', { name: /twomc\.su — на главную/ })[0]).toHaveAttribute(
      'href',
      MAIN,
    );
    expect(header.queryByRole('navigation', { name: 'Основная навигация' })).toBeNull();
    expect(header.queryByRole('link', { name: 'Магазин' })).toBeNull();
    expect(header.queryByRole('link', { name: 'Войти' })).toBeNull();
    const login = header.getByRole('button', { name: 'Войти' });
    expect(login).toHaveAttribute('aria-disabled', 'true');
    expect(login.className).toContain('cursor-not-allowed');
    login.focus();
    expect((await screen.findAllByText('Скоро')).length).toBeGreaterThan(0);
  });

  it('шапка: «Войти» справа на любой ширине (без lg:ml-0, нет навигации по центру)', () => {
    renderShell();
    const actions = screen.getByTestId('site-header-actions');
    expect(actions.className).toContain('ml-auto');
    expect(actions.className).not.toContain('lg:ml-0');
    expect(within(actions).getByRole('button', { name: 'Войти' })).toBeInTheDocument();
  });

  it('футер: «Игрокам» - главная основного сайта, правила, «Скоро» без перехода', () => {
    renderShell();
    const col = within(
      within(screen.getByTestId('site-footer')).getByRole('navigation', { name: 'Игрокам' }),
    );
    for (const name of ['Начать играть', 'Магазин', 'Серверы']) {
      expect(col.getByRole('link', { name })).toHaveAttribute('href', MAIN);
    }
    expect(col.getByRole('link', { name: 'Правила' })).toHaveAttribute('href', `${MAIN}/rules`);
    for (const name of [
      /^Wiki/,
      /^Новости/,
      /^Голосование/,
      /^Рейтинги/,
      /^Список наказаний/,
      /^Достижения/,
      /^Формы и заявки/,
    ]) {
      const el = col.getByRole('link', { name });
      expect(el).toHaveAttribute('aria-disabled', 'true');
      expect(el).not.toHaveAttribute('href');
      expect(el.className).toContain('cursor-not-allowed');
      expect(el).toHaveTextContent(/скоро/i);
      fireEvent.click(el);
    }
  });

  it('футер: «Статус серверов» неактивна', () => {
    renderShell();
    const btn = screen.getByTestId('server-status-soon');
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn.className).toContain('cursor-not-allowed');
  });

  it('соцсети: без env все пять неактивны, без href', () => {
    renderShell();
    const list = within(screen.getByRole('list', { name: 'Соцсети' }));
    expect(list.getAllByRole('button')).toHaveLength(5);
    for (const b of list.getAllByRole('button')) {
      expect(b).toHaveAttribute('aria-disabled', 'true');
      expect(b.className).toContain('cursor-not-allowed');
    }
    expect(list.queryAllByRole('link')).toHaveLength(0);
  });

  it('соцсети: заданный адрес даёт ссылку', () => {
    vi.stubEnv('NEXT_PUBLIC_GIVEAWAY_SOCIAL_DISCORD', 'https://discord.gg/abc');
    renderShell();
    const list = within(screen.getByRole('list', { name: 'Соцсети' }));
    expect(list.getByRole('link', { name: 'Discord' })).toHaveAttribute(
      'href',
      'https://discord.gg/abc',
    );
    expect(list.getAllByRole('button')).toHaveLength(4);
    vi.unstubAllEnvs();
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
    const footer = within(screen.getByTestId('site-footer'));
    expect(footer.getByRole('link', { name: 'Новости' })).toHaveAttribute('href', '/news');
    expect(
      footer.getByRole('link', { name: 'Статус серверов: Статус неизвестен' }),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-wordmark-o="default"]')?.getAttribute('class')).toContain(
      'text-primary',
    );
    vi.unstubAllGlobals();
  });
});
