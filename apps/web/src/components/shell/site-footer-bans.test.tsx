import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api/errors';
import { ShellModeProvider } from '@/lib/site/shell-mode';
import { ThemeProvider } from '@/lib/theme/theme-provider';
import { SiteFooter } from './site-footer';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get },
}));
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: { src: string; alt: string }) => <img src={props.src} alt={props.alt} />,
}));
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

function column() {
  return within(
    within(screen.getByTestId('site-footer')).getByRole('navigation', { name: 'Игрокам' }),
  );
}

function apiError(status: number, code?: string) {
  return ApiError.fromResponse(status, { statusCode: status, code });
}

beforeEach(() => {
  mocks.get.mockReset();
});

describe('футер: «Список наказаний» (Q74)', () => {
  it('раздел включён: обычная ссылка на /bans; зонд с limit=1 без авторизации', async () => {
    mocks.get.mockResolvedValue({ items: [], nextCursor: null });
    render(<SiteFooter />, { wrapper: Providers });
    await waitFor(() =>
      expect(column().getByRole('link', { name: 'Список наказаний' })).toHaveAttribute(
        'href',
        '/bans',
      ),
    );
    expect(mocks.get).toHaveBeenCalledWith(
      '/punishments/public',
      expect.objectContaining({ auth: false, query: { limit: 1 } }),
    );
  });

  it('503: раздел включён, ссылка остаётся', async () => {
    mocks.get.mockRejectedValue(apiError(503, 'punishments_unavailable'));
    render(<SiteFooter />, { wrapper: Providers });
    await waitFor(() =>
      expect(column().getByRole('link', { name: 'Список наказаний' })).toHaveAttribute(
        'href',
        '/bans',
      ),
    );
  });

  it('404 punishments_public_disabled: «скоро», без ссылки', async () => {
    mocks.get.mockRejectedValue(apiError(404, 'punishments_public_disabled'));
    render(<SiteFooter />, { wrapper: Providers });
    await waitFor(() => expect(mocks.get).toHaveBeenCalled());
    expect(column().queryByRole('link', { name: /Список наказаний/ })).toBeNull();
    expect(
      column()
        .getByText(/Список наказаний/)
        .closest('span'),
    ).toHaveTextContent(/скоро/i);
  });

  it('пока идёт проверка: «скоро»', () => {
    mocks.get.mockReturnValue(new Promise(() => undefined));
    render(<SiteFooter />, { wrapper: Providers });
    expect(column().queryByRole('link', { name: /Список наказаний/ })).toBeNull();
  });

  it('режим сайта розыгрыша: «скоро», зонд не выполняется', () => {
    render(
      <ShellModeProvider value={{ mainSiteUrl: 'https://twomc.su', monochromeLogo: true }}>
        <SiteFooter />
      </ShellModeProvider>,
      { wrapper: Providers },
    );
    const el = column().getByRole('link', { name: /^Список наказаний/ });
    expect(el).toHaveAttribute('aria-disabled', 'true');
    expect(el).toHaveTextContent(/скоро/i);
    expect(mocks.get).not.toHaveBeenCalledWith('/punishments/public', expect.anything());
  });
});
