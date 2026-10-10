import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/lib/theme/theme-provider';
import { installFetchMock } from '@/test/http';
import { AuthPanel } from './auth-layout';

/// Auth Showcase (D3): одна и та же витрина реальных скриншотов на входе и
/// регистрации — вся правая половина = кадр (desktop) и компактный mobile.

vi.mock('next/navigation', () => ({
  usePathname: () => '/login',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ThemeProvider>
        <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

describe('Auth Showcase', () => {
  for (const mode of ['login', 'register'] as const) {
    it(`${mode}: справа — только скриншот на всю половину и компакт на mobile`, () => {
      installFetchMock();
      render(
        <AuthPanel mode={mode}>
          <p>форма</p>
        </AuthPanel>,
        { wrapper: Providers },
      );
      const carousels = screen.getAllByTestId('screenshot-carousel');
      expect(carousels.map((c) => c.getAttribute('data-variant')).sort()).toEqual([
        'compact',
        'fill',
      ]);
      // Правая половина = только кадр: без логотипа, заголовков и подписей.
      const showcase = screen.getByTestId('auth-showcase');
      expect(showcase.querySelector('img[data-logo]')).toBeNull();
      expect(showcase.querySelector('h2, h3, p:not(.sr-only)')).toBeNull();
      expect(showcase).not.toHaveTextContent(/twomc\.su · Minecraft/i);
      expect(showcase.querySelector('[data-active]')).toHaveAttribute('data-slide', 'spawn-day');
    });
  }
});
