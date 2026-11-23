import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import InviteFormPage from './page';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get },
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ code: 'abc123' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/forms/invite/abc123',
}));
vi.mock('@/lib/site/status', () => ({
  useModuleAvailability: () => ({ reason: null, bypass: false, maintenance: null }),
}));

const RAW = 'QueryFailedError: relation "form_invites" does not exist';

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
});

describe('форма по приглашению: ошибки без деталей API', () => {
  it.each([404, 403])(
    '%i: статичный текст, сырое сообщение API не показывается',
    async (status) => {
      mocks.get.mockRejectedValue(new ApiError(status, [RAW]));
      render(<InviteFormPage />, { wrapper: Providers });
      expect(await screen.findByText('Приглашение недействительно')).toBeInTheDocument();
      expect(document.body).not.toHaveTextContent('QueryFailedError');
      expect(document.body).not.toHaveTextContent('form_invites');
    },
  );

  it('500: ErrorState с повтором и без сырого сообщения', async () => {
    mocks.get.mockRejectedValue(new ApiError(500, [RAW]));
    render(<InviteFormPage />, { wrapper: Providers });
    const alert = await screen.findByRole('alert');
    expect(alert).not.toHaveTextContent('QueryFailedError');
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });
});
