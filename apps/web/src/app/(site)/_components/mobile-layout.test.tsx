import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFetchMock, jsonResponse } from '@/test/http';
import { TooltipProvider } from '@/components/ui/tooltip';
import { HomeHero } from './hero';
import { HomeQuickStart } from './quick-start';
import { HomeShop } from './shop-section';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  installFetchMock().mockImplementation(async () => jsonResponse([]));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('главная: мобильная раскладка 360–390px', () => {
  it('hero: одна колонка до lg, адрес обрезается, ряд кнопок переносится с целью касания 40px', () => {
    const { container } = render(<HomeHero />, { wrapper: Providers });
    expect(container.querySelector('section')).toHaveClass('grid-cols-1');
    expect(screen.getByTestId('hero-address')).toHaveClass('truncate');
    expect(screen.getByTestId('hero-versions')).toHaveClass('break-words');
    const row = screen.getByRole('link', { name: /Начать играть/ }).parentElement;
    expect(row).toHaveClass('flex-wrap');
    expect(row?.className).toContain('min-h-10');
  });

  it('магазин: сетка карточек — одна колонка до sm', () => {
    render(<HomeShop />, { wrapper: Providers });
    expect(screen.getByTestId('home-shop-grid')).toHaveClass('grid-cols-1');
  });

  it('как играть: шаги в одну колонку, кнопки не меньше 40px на мобильном', () => {
    const { container } = render(<HomeQuickStart />, { wrapper: Providers });
    expect(container.querySelector('ol')).toHaveClass('grid-cols-1');
    expect(
      screen.getByRole('button', { name: /Скопировать промокод/ }).parentElement?.className,
    ).toContain('min-h-10');
  });
});
