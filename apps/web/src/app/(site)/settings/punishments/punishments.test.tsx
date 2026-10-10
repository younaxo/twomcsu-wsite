import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/lib/auth/store';
import PunishmentsPage from './page';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get },
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/punishments',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mocks.get.mockReset();
  useAuthStore.setState({ status: 'authenticated', user: { id: 'u1', username: 'p' } as never });
});

describe('Настройки → Наказания', () => {
  it('история: действующее и истёкшее различаются', async () => {
    mocks.get.mockResolvedValue([
      {
        id: 'a',
        punishmentType: 'MUTE',
        reason: 'Флуд в чате',
        duration: '1h',
        server: 'Survival',
        issuedAt: '2026-10-01T10:00:00.000Z',
        expiresAt: '2999-01-01T00:00:00.000Z',
        isActive: true,
      },
      {
        id: 'b',
        punishmentType: 'WARN',
        reason: 'Оскорбление',
        duration: null,
        server: null,
        issuedAt: '2026-09-01T10:00:00.000Z',
        expiresAt: '2026-09-02T10:00:00.000Z',
        isActive: true,
      },
    ]);
    render(<PunishmentsPage />, { wrapper: Providers });
    const list = await screen.findByTestId('punishments');
    const items = list.querySelectorAll('li');
    expect(items[0]).toHaveAttribute('data-active', 'true');
    expect(items[0]).toHaveTextContent('Мут');
    expect(items[0]).toHaveTextContent('Survival');
    expect(items[1]).toHaveAttribute('data-active', 'false');
    expect(items[1]).toHaveTextContent('Не действует');
  });

  it('пустая история — понятное состояние', async () => {
    mocks.get.mockResolvedValue([]);
    render(<PunishmentsPage />, { wrapper: Providers });
    expect(await screen.findByText('Наказаний нет')).toBeInTheDocument();
  });
});
