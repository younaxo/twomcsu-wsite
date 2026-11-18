import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import AdminSecurityPage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  granted: new Set<string>(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.delete },
}));
vi.mock('@/lib/auth/use-permissions', () => ({
  usePermissions: () => ({
    can: (requirement: string | string[]) =>
      (Array.isArray(requirement) ? requirement : [requirement]).some((key) =>
        mocks.granted.has(key),
      ),
  }),
}));
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/security',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const ROWS = [
  {
    ip: 'v6:2001:db8:1:2',
    lastIp: '2001:db8:1:2:aaaa:bbbb:cccc:dddd',
    failedAttempts: 7,
    isBlocked: true,
    blockedTtlSeconds: 600,
  },
  {
    ip: '203.0.113.9',
    lastIp: null,
    failedAttempts: 3,
    isBlocked: false,
    blockedTtlSeconds: null,
  },
];

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mocks.granted.clear();
  mocks.granted.add('security.suspicious.view');
  for (const fn of [mocks.get, mocks.post, mocks.patch, mocks.delete]) fn.mockReset();
  mocks.get.mockImplementation(async (path: string) => {
    if (path === '/admin/security/suspicious') return ROWS;
    throw new Error(`unexpected GET ${path}`);
  });
});

describe('AdminSecurityPage: вкладка «Подозрительные IP»', () => {
  it('показывает колонки «Ключ подсети» и «Последний IP» со значениями', async () => {
    render(<AdminSecurityPage />, { wrapper: Providers });

    expect(await screen.findByRole('columnheader', { name: 'Ключ подсети' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Последний IP' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'IP' })).not.toBeInTheDocument();

    expect(await screen.findByText('v6:2001:db8:1:2')).toBeInTheDocument();
    expect(screen.getByText('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBeInTheDocument();
  });

  it('при lastIp = null показывает «истёк» и не ломает строку', async () => {
    render(<AdminSecurityPage />, { wrapper: Providers });

    const keyCell = await screen.findByText('203.0.113.9');
    const row = keyCell.closest('tr');
    expect(row).not.toBeNull();
    const scoped = within(row as HTMLElement);
    expect(
      scoped.getByText('истёк', { exact: false, selector: '[aria-hidden="true"]' }),
    ).toBeInTheDocument();
    expect(scoped.getByText('Последний IP истёк')).toHaveClass('sr-only');
    expect(scoped.getByText('Под наблюдением')).toBeInTheDocument();
    expect(scoped.getByText('3')).toBeInTheDocument();
  });

  it('заголовки колонок имеют scope="col"', async () => {
    render(<AdminSecurityPage />, { wrapper: Providers });

    const header = await screen.findByRole('columnheader', { name: 'Последний IP' });
    expect(header).toHaveAttribute('scope', 'col');
    expect(screen.getByRole('columnheader', { name: 'Ключ подсети' })).toHaveAttribute(
      'scope',
      'col',
    );
  });
});
