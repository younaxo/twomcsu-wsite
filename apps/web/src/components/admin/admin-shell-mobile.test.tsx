import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/lib/theme/theme-provider';
import { AdminShell } from './admin-shell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/lib/auth/use-permissions', () => ({
  usePermissions: () => ({
    effective: null,
    isSuperuser: true,
    has: () => true,
    can: () => true,
  }),
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

function renderShell() {
  return render(
    <AdminShell>
      <p>Контент</p>
    </AdminShell>,
    { wrapper: Providers },
  );
}

describe('admin shell mobile layout (рендер)', () => {
  it('поднимает высоту контролов до 40px на узких экранах', () => {
    const { container } = renderShell();
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('max-sm:[--control-h:40px]');
    expect(root.className).toContain('max-sm:[--control-h-sm:40px]');
    expect(root.className).toContain('[--input-min-h:0px]');
  });

  it('сайдбар — drawer ниже lg (desktop-панель скрыта), кнопка меню видна только ниже lg', () => {
    renderShell();
    const aside = document.querySelector('aside') as HTMLElement;
    expect(aside.className.split(' ')).toContain('hidden');
    expect(aside.className).toContain('lg:flex');
    const menu = screen.getByRole('button', { name: 'Открыть разделы' });
    expect(menu.className.split(' ')).toContain('lg:hidden');
  });

  it('основная область сжимаема (min-w-0), контент внутри <main>', () => {
    renderShell();
    const main = screen.getByRole('main');
    expect(main).toHaveTextContent('Контент');
    expect(main.parentElement?.className).toContain('min-w-0');
    expect(main.parentElement?.className).toContain('flex-1');
  });

  it('без blur и backdrop-эффектов ни в одном элементе', () => {
    const { container } = renderShell();
    const offenders = Array.from(container.querySelectorAll('*')).filter((el) =>
      /(^|\s|:)(backdrop-|blur-)/.test(el.getAttribute('class') ?? ''),
    );
    expect(offenders).toHaveLength(0);
  });
});
