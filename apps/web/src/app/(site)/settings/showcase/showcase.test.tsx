import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuthStore } from '@/lib/auth/store';
import ShowcaseSettingsPage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post },
}));
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/settings/showcase',
}));

const item = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  achievement: { id, name, iconUrl: '', rarity: 'RARE' },
  isCompleted: true,
  isShowcased: false,
  showcaseOrder: 0,
  ...extra,
});

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
  mocks.get.mockReset();
  mocks.post.mockReset().mockResolvedValue({});
  useAuthStore.setState({ status: 'authenticated', user: { id: 'me' } as never });
  mocks.get.mockResolvedValue({
    items: [
      item('a1', 'Первый шаг', { isShowcased: true, showcaseOrder: 0 }),
      item('a2', 'Душа компании'),
      item('a3', 'Секрет', { isCompleted: false }),
    ],
  });
});

describe('Витрина достижений (срез 5.7, часть 2)', () => {
  it('текущая витрина, добавление и порядок; сохраняются только полученные', async () => {
    const user = userEvent.setup();
    render(<ShowcaseSettingsPage />, { wrapper: Providers });
    const order = await screen.findByTestId('showcase-order');
    expect(within(order).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByRole('checkbox', { name: /Секрет/ })).toBeNull();

    await user.click(screen.getByRole('checkbox', { name: /Душа компании/ }));
    await user.click(screen.getByRole('button', { name: 'Выше: Душа компании' }));
    await user.click(screen.getByRole('button', { name: 'Сохранить витрину' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/users/me/achievements/showcase', {
        achievementIds: ['a2', 'a1'],
      }),
    );
  });
});
