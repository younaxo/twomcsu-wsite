import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ADMIN_NAV, findNavItem } from '@/lib/admin/navigation';
import AdminStreamsPage from './page';

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
  usePathname: () => '/admin/streams',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const CHANNEL = {
  id: 's1',
  platform: 'TWITCH',
  channelKey: 'twomc',
  channelUrl: 'https://twitch.tv/twomc',
  displayName: 'TwoMC Live',
  avatarUrl: null,
  userId: null,
  isPartner: true,
  isActive: false,
  isLive: true,
  viewerCount: 42,
  lastCheckedAt: null,
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

function grant(...keys: string[]) {
  for (const key of keys) mocks.granted.add(`streams.${key}`);
}

beforeEach(() => {
  mocks.granted.clear();
  for (const fn of [mocks.get, mocks.post, mocks.patch, mocks.delete]) fn.mockReset();
  for (const fn of Object.values(mocks.toast)) fn.mockReset();
  mocks.post.mockResolvedValue({});
  mocks.patch.mockResolvedValue({});
  mocks.delete.mockResolvedValue({ success: true });
  mocks.get.mockResolvedValue([CHANNEL]);
});

describe('Стримы в админке', () => {
  it('без права — 403 без запроса', () => {
    render(<AdminStreamsPage />, { wrapper: Providers });
    expect(screen.queryByTestId('admin-streams')).toBeNull();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('список: статусы показаны, кнопок действий без прав нет', async () => {
    grant('view');
    render(<AdminStreamsPage />, { wrapper: Providers });
    const grid = await screen.findByTestId('admin-streams');
    expect(await within(grid).findByText('TwoMC Live')).toBeInTheDocument();
    expect(grid).toHaveTextContent('В эфире · 42');
    expect(grid).toHaveTextContent('Партнёр');
    expect(grid).toHaveTextContent('Скрыт');
    expect(screen.queryByRole('button', { name: /Изменить/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Удалить/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Добавить канал' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Обновить статусы' })).toBeNull();
  });

  it('пусто и ошибка — честные состояния без сырого текста', async () => {
    grant('view');
    mocks.get.mockResolvedValueOnce([]);
    const first = render(<AdminStreamsPage />, { wrapper: Providers });
    expect(await screen.findByText('Каналов пока нет')).toBeInTheDocument();
    first.unmount();

    mocks.get.mockRejectedValueOnce(new Error('SELECT secret FROM stream_channels'));
    render(<AdminStreamsPage />, { wrapper: Providers });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/SELECT secret/)).toBeNull();
  });

  it('создание: валидация, затем POST без лишних полей', async () => {
    const user = userEvent.setup();
    grant('view', 'create');
    render(<AdminStreamsPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Добавить канал' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect(await within(dialog).findByText('Введите название')).toBeInTheDocument();
    expect(within(dialog).getByText('Введите ключ канала')).toBeInTheDocument();
    expect(within(dialog).getByText(/Полная ссылка/)).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText(/Ключ канала/), 'newchan');
    await user.type(within(dialog).getByLabelText(/Ссылка на канал/), 'https://twitch.tv/newchan');
    await user.type(within(dialog).getByLabelText(/Название/), 'New');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/admin/streams', {
        displayName: 'New',
        isPartner: false,
        platform: 'TWITCH',
        channelKey: 'newchan',
        channelUrl: 'https://twitch.tv/newchan',
      }),
    );
  });

  it('правка не отправляет platform/channelKey; удаление — с подтверждением', async () => {
    const user = userEvent.setup();
    grant('view', 'edit', 'delete');
    render(<AdminStreamsPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Изменить канал TwoMC Live' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/Ключ канала/)).toBeDisabled();
    await user.clear(within(dialog).getByLabelText(/Название/));
    await user.type(within(dialog).getByLabelText(/Название/), 'Renamed');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/admin/streams/s1', {
        displayName: 'Renamed',
        isPartner: true,
        isActive: false,
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'Удалить канал TwoMC Live' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(mocks.delete).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/admin/streams/s1'));
  });

  it('«Обновить статусы» честно сообщает, что опрос не выполнен', async () => {
    const user = userEvent.setup();
    grant('view', 'refresh');
    mocks.post.mockResolvedValue({
      refreshed: false,
      reason: 'no_platform_credentials_configured',
    });
    render(<AdminStreamsPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Обновить статусы' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/admin/streams/refresh'));
    await waitFor(() =>
      expect(mocks.toast.info).toHaveBeenCalledWith(expect.stringContaining('не настроены')),
    );
  });

  it('пункт навигации «Стримы» в группе «Контент» по праву streams.view', () => {
    const content = ADMIN_NAV.find((g) => g.id === 'content')!.items.find(
      (i) => i.label === 'Контент',
    )!;
    expect(content.sections?.some((s) => s.href === '/admin/streams')).toBe(true);
    expect(content.requirement).toContain('streams.view');
    expect(findNavItem('/admin/streams')?.label).toBe('Контент');
  });
});
