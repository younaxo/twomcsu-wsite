import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { inputClassName } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuthStore } from '@/lib/auth/store';
import { ThemeProvider } from '@/lib/theme/theme-provider';
import { installFetchMock } from '@/test/http';
import { ProfileTrigger } from './profile-trigger';
import { SiteHeader } from './site-header';
import { SiteLogo } from './site-logo';

/// Адаптив 360/390 px: jsdom не считает вёрстку, поэтому проверяем, что
/// responsive-классы (сжатие шапки, цели касания ≥ 40 px) на месте. Реальная
/// геометрия проверяется визуальной проверкой на стенде.

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
  installFetchMock().mockImplementation(async () => new Response(null, { status: 404 }));
  useAuthStore.setState({ status: 'anonymous', user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('шапка на узких экранах', () => {
  it('счётчик онлайна скрыт до 440 px, действия справа не сжимаются', () => {
    render(<SiteHeader />, { wrapper: Providers });
    const wrapper = screen.getByTestId('online-counter').parentElement!;
    expect(wrapper.className).toContain('max-[439px]:hidden');
    expect(wrapper.className).toContain('lg:hidden');
    expect(wrapper.parentElement!.className).toContain('shrink-0');
    expect(screen.getByTestId('site-header-surface').className).toContain('gap-2');
  });

  it('chevron кнопки профиля скрыт на 360 px, ник остаётся скрытым до md', () => {
    render(<ProfileTrigger username="stand_player2" />);
    const trigger = screen.getByTestId('profile-trigger');
    expect(trigger.querySelector('svg')!.getAttribute('class')).toContain('max-[379px]:hidden');
    expect(screen.getByText('stand_player2').className).toContain('hidden');
  });

  it('логотип и счётчик онлайна — цель касания не ниже 40 px на мобильных', () => {
    render(<SiteLogo />, { wrapper: Providers });
    expect(screen.getByRole('link', { name: 'twomc.su — на главную' }).className).toContain(
      'max-md:min-h-10',
    );
    render(<SiteHeader />, { wrapper: Providers });
    expect(screen.getByTestId('online-counter').className).toContain('min-h-10');
  });
});

describe('цели касания на мобильных', () => {
  it('хлебные крошки: ссылка с вертикальным отступом до 40 px', () => {
    render(<Breadcrumbs items={[{ label: 'Магазин', href: '/shop' }, { label: 'Полемизм' }]} />);
    expect(screen.getByRole('link', { name: 'Магазин' }).className).toContain('max-md:py-2.5');
  });

  it('SegmentedControl: фильтры не ниже 40 px на мобильных обоих размеров', () => {
    const options = [
      { value: 'a', label: 'Все' },
      { value: 'b', label: 'Баны' },
    ];
    const { rerender } = render(<SegmentedControl options={options} size="sm" />);
    expect(screen.getByRole('radio', { name: 'Все' }).className).toContain('max-md:h-10');
    rerender(<SegmentedControl options={options} size="md" />);
    expect(screen.getByRole('radio', { name: 'Все' }).className).toContain('max-md:h-10');
  });

  it('поля и select (inputClassName) — min-h-10 на мобильных', () => {
    expect(inputClassName).toContain('max-md:min-h-10');
  });
});
