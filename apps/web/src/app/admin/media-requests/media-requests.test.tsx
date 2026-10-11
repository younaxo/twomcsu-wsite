import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { safeChannelUrl } from '@/lib/admin/media-requests';
import AdminMediaRequestsPage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  granted: new Set<string>(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, patch: mocks.patch },
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
  usePathname: () => '/admin/media-requests',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const REQUEST = {
  id: 'm1',
  userId: 'u1',
  mediaGroup: 'YOUTUBE',
  channelUrl: 'https://youtube.com/@builder',
  description: 'Снимаю постройки',
  createdAt: '2026-10-11T10:00:00.000Z',
  user: { id: 'u1', username: 'builder', tag: 'builder#0042', avatar: null },
};

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
  mocks.get.mockReset();
  mocks.patch.mockReset();
  mocks.patch.mockResolvedValue({ ...REQUEST, status: 'APPROVED' });
  mocks.get.mockImplementation(async (path: string) =>
    path === '/admin/media-requests' ? [REQUEST] : [],
  );
});

describe('Медиа-заявки в админке (срез 7.6)', () => {
  it('только просмотр: заявка с автором и ссылкой на канал, без кнопок решения', async () => {
    mocks.granted.add('media_requests.view');
    render(<AdminMediaRequestsPage />, { wrapper: Providers });
    const list = await screen.findByTestId('media-requests');
    expect(within(list).getByRole('link', { name: 'builder#0042' })).toHaveAttribute(
      'href',
      '/admin/users/u1',
    );
    const channel = within(list).getByRole('link', { name: 'https://youtube.com/@builder' });
    expect(channel).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    expect(screen.queryByRole('button', { name: 'Одобрить' })).toBeNull();
  });

  it('одобрение — с подтверждением', async () => {
    const user = userEvent.setup();
    mocks.granted.add('media_requests.view');
    mocks.granted.add('media_requests.edit');
    render(<AdminMediaRequestsPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Одобрить' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('builder#0042 получит значок YouTube');
    await user.click(within(dialog).getByRole('button', { name: 'Одобрить' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/admin/media-requests/m1', {
        status: 'APPROVED',
      }),
    );
  });

  it('отказ — с причиной', async () => {
    const user = userEvent.setup();
    mocks.granted.add('media_requests.view');
    mocks.granted.add('media_requests.edit');
    render(<AdminMediaRequestsPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Отклонить' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Причина/), 'Мало роликов');
    await user.click(within(dialog).getByRole('button', { name: 'Отклонить' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/admin/media-requests/m1', {
        status: 'REJECTED',
        reviewNote: 'Мало роликов',
      }),
    );
  });

  it('ссылка на канал: только http(s), без протокола — https', () => {
    expect(safeChannelUrl('youtube.com/@a')).toBe('https://youtube.com/@a');
    expect(safeChannelUrl('http://twitch.tv/b')).toBe('http://twitch.tv/b');
    expect(safeChannelUrl('javascript:alert(1)')).toBeNull();
  });
});
