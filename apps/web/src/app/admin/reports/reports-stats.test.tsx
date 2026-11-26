import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import AdminReportsPage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  granted: new Set<string>(),
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get },
}));
vi.mock('@/lib/auth/use-permissions', () => ({
  usePermissions: () => ({
    can: (requirement: string | string[]) =>
      (Array.isArray(requirement) ? requirement : [requirement]).some((key) =>
        mocks.granted.has(key),
      ),
  }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/reports',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

const STATS = {
  total: 12,
  byStatus: { PENDING: 5, IN_REVIEW: 2, RESOLVED: 5 },
  byType: { PLAYER_COMPLAINT: 9, PUNISHMENT_APPEAL: 3 },
};

beforeEach(() => {
  mocks.granted.clear();
  mocks.granted.add('reports.view');
  mocks.get.mockReset();
  mocks.get.mockImplementation((path: string) =>
    Promise.resolve(
      path === '/admin/reports/stats' ? STATS : { items: [], total: 0, page: 1, limit: 30 },
    ),
  );
});

describe('Статистика обращений в админке', () => {
  it('без права reports.stats вкладки и запроса нет', async () => {
    render(<AdminReportsPage />, { wrapper: Providers });
    expect(await screen.findByText('Обращений нет')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Статистика' })).toBeNull();
    expect(mocks.get.mock.calls.map((c) => c[0])).not.toContain('/admin/reports/stats');
  });

  it('вкладка «Статистика»: итоги, статусы и типы текстом', async () => {
    const user = userEvent.setup();
    mocks.granted.add('reports.stats');
    render(<AdminReportsPage />, { wrapper: Providers });
    expect(screen.queryByRole('tab', { name: 'Архив' })).toBeNull();
    await user.click(await screen.findByRole('tab', { name: 'Статистика' }));
    const panel = await screen.findByTestId('reports-stats');
    expect(await within(panel).findByText('Всего обращений')).toBeInTheDocument();
    const statuses = within(panel).getByLabelText('Обращения по статусам');
    expect(statuses).toHaveTextContent('Ожидает5');
    expect(statuses).toHaveTextContent('Решено5');
    expect(statuses).not.toHaveTextContent('Закрыто');
    const types = within(panel).getByLabelText('Обращения по типам');
    expect(types).toHaveTextContent('Жалоба на игрока9');
    expect(types).toHaveTextContent('Обжалование наказания3');
  });

  it('ошибка загрузки — безопасное сообщение', async () => {
    const user = userEvent.setup();
    mocks.granted.add('reports.stats');
    mocks.get.mockImplementation((path: string) =>
      path === '/admin/reports/stats'
        ? Promise.reject(new Error('prisma: connection string postgres://x'))
        : Promise.resolve({ items: [], total: 0, page: 1, limit: 30 }),
    );
    render(<AdminReportsPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('tab', { name: 'Статистика' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/postgres:/)).toBeNull();
  });
});
