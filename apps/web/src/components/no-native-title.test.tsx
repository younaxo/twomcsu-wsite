import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PaymentMethodLogos } from '@/components/shell/payment-method-logos';
import { SiteFooter } from '@/components/shell/site-footer';
import { TooltipProvider } from '@/components/ui/tooltip';
import { UserIdentity } from '@/components/ui/user-identity';
import { ThemeProvider } from '@/lib/theme/theme-provider';
import { installFetchMock, jsonResponse } from '@/test/http';

/// Наш интерфейс не показывает серые системные подсказки браузера: вместо
/// `title=""` — production Tooltip (аудит нативных title, PR 7).

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ThemeProvider>
        <TooltipProvider>{children}</TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

describe('Нет нативных title в нашем UI', () => {
  it('логотипы оплаты, футер, identity', () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValue(jsonResponse({}));
    const { container } = render(
      <>
        <PaymentMethodLogos />
        <SiteFooter />
        <UserIdentity
          username="younaxo_"
          discriminator="0002"
          role={{ slug: 'chief-curator', displayName: 'Chief Curator', priority: 90 }}
        />
      </>,
      { wrapper: Providers },
    );
    const titled = Array.from(container.querySelectorAll('[title]')).filter(
      // <svg><title> — не атрибут; title внутри SVG-логотипов не трогаем.
      (element) => element.namespaceURI === 'http://www.w3.org/1999/xhtml',
    );
    expect(titled.map((element) => element.outerHTML.slice(0, 80))).toEqual([]);
  });
});
