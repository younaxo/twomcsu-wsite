import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import AdminServersPage from './page';

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
  usePathname: () => '/admin/servers',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const SERVER = {
  id: 's1',
  name: 'Выживание',
  slug: 'survival',
  address: 'play.twomc.su',
  port: 25565,
  type: 'survival',
  description: null,
  iconUrl: null,
  maxPlayers: 100,
  version: null,
  isActive: true,
  order: 0,
  categoryId: null,
  category: null,
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
  for (const fn of [mocks.get, mocks.post, mocks.patch, mocks.delete]) fn.mockReset();
  mocks.post.mockResolvedValue(SERVER);
  mocks.patch.mockResolvedValue(SERVER);
  mocks.delete.mockResolvedValue(undefined);
  mocks.get.mockImplementation(async (path: string) => {
    if (path === '/admin/servers') return [SERVER];
    if (path === '/admin/servers/s1/logs') {
      return {
        items: [
          {
            id: 'l1',
            online: true,
            playerCount: 7,
            maxPlayers: 100,
            version: '1.21',
            ping: 12,
            timestamp: '2026-10-10T10:00:00.000Z',
          },
        ],
        total: 1,
      };
    }
    return [];
  });
});

describe('Серверы в админке (срез 7.5)', () => {
  it('только просмотр: список без кнопок изменения', async () => {
    mocks.granted.add('servers.view');
    render(<AdminServersPage />, { wrapper: Providers });
    const list = await screen.findByTestId('admin-servers');
    expect(within(list).getByText('play.twomc.su:25565')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Добавить сервер' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Изменить' })).toBeNull();
  });

  it('создание: проверка slug и порта, POST с телом формы', async () => {
    const user = userEvent.setup();
    mocks.granted.add('servers.view');
    mocks.granted.add('servers.create');
    render(<AdminServersPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Добавить сервер' }));
    await user.type(screen.getByLabelText(/Название/), 'Анархия');
    await user.type(screen.getByLabelText(/Slug/), 'Anarchy 1');
    await user.type(screen.getByLabelText(/Адрес/), 'anarchy.twomc.su');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(screen.getByText('Только строчные латинские буквы, цифры и дефис')).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/Slug/));
    await user.type(screen.getByLabelText(/Slug/), 'anarchy');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/admin/servers', {
        name: 'Анархия',
        slug: 'anarchy',
        address: 'anarchy.twomc.su',
        port: 25565,
        type: 'survival',
        maxPlayers: 100,
        order: 0,
        isActive: true,
      }),
    );
  });

  it('журнал статусов и удаление с подтверждением', async () => {
    const user = userEvent.setup();
    for (const key of ['servers.view', 'servers.logs', 'servers.delete']) mocks.granted.add(key);
    render(<AdminServersPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Журнал' }));
    expect(await screen.findByTestId('server-logs')).toHaveTextContent('онлайн 7/100');
    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/admin/servers/s1'));
  });
});
