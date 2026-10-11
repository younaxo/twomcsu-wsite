import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import AdminVotingPage from './page';

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
  usePathname: () => '/admin/voting',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const SITE = {
  id: 'v1',
  slug: 'mc-list',
  name: 'MC Server List',
  description: null,
  url: 'https://example.com/vote',
  logoUrl: null,
  rewardCoins: 50,
  cooldownHours: 24,
  sortOrder: 0,
  isActive: true,
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
  mocks.patch.mockResolvedValue(SITE);
  mocks.delete.mockResolvedValue(undefined);
  mocks.get.mockImplementation(async (path: string) =>
    path === '/admin/voting/sites' ? [SITE] : [],
  );
});

describe('Сайты голосования в админке (срез 7.4)', () => {
  it('только просмотр: награда и интервал, без кнопок', async () => {
    mocks.granted.add('voting.sites.view');
    render(<AdminVotingPage />, { wrapper: Providers });
    const list = await screen.findByTestId('admin-vote-sites');
    expect(list).toHaveTextContent('MC Server List');
    expect(list).toHaveTextContent('+50 монет · раз в 24 ч');
    expect(screen.queryByRole('button', { name: 'Добавить сайт' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Новый секрет' })).toBeNull();
  });

  it('создание: проверка ссылки, затем секрет показывается один раз', async () => {
    const user = userEvent.setup();
    mocks.granted.add('voting.sites.view');
    mocks.granted.add('voting.sites.create');
    mocks.post.mockResolvedValue({ site: { ...SITE, id: 'v2' }, secret: 'a'.repeat(64) });
    render(<AdminVotingPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Добавить сайт' }));
    await user.type(screen.getByLabelText(/Название/), 'Top MC');
    await user.type(screen.getByLabelText(/Slug/), 'top-mc');
    await user.type(screen.getByLabelText(/Ссылка для голосования/), 'ftp://top.example/vote');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(screen.getByText('Ссылка вида https://…')).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/Ссылка для голосования/));
    await user.type(screen.getByLabelText(/Ссылка для голосования/), 'https://top.example/vote');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/admin/voting/sites', {
        name: 'Top MC',
        slug: 'top-mc',
        description: '',
        url: 'https://top.example/vote',
        rewardCoins: 0,
        cooldownHours: 24,
        sortOrder: 0,
      }),
    );
    expect(await screen.findByTestId('vote-secret')).toHaveTextContent('a'.repeat(64));
    await user.click(screen.getByRole('button', { name: 'Готово' }));
    expect(screen.queryByTestId('vote-secret')).toBeNull();
  });

  it('замена секрета — с подтверждением, новый показывается', async () => {
    const user = userEvent.setup();
    mocks.granted.add('voting.sites.view');
    mocks.granted.add('voting.sites.rotate_secret');
    mocks.post.mockResolvedValue({ secret: 'b'.repeat(64) });
    render(<AdminVotingPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Новый секрет' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Старый секрет сразу перестанет работать');
    await user.click(within(dialog).getByRole('button', { name: 'Заменить' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/admin/voting/sites/v1/rotate-secret'),
    );
    expect(await screen.findByTestId('vote-secret')).toHaveTextContent('b'.repeat(64));
  });

  it('правка: пустой логотип уходит как null, скрытие сайта', async () => {
    const user = userEvent.setup();
    mocks.granted.add('voting.sites.view');
    mocks.granted.add('voting.sites.edit');
    render(<AdminVotingPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Изменить' }));
    expect(screen.queryByLabelText(/Slug/)).toBeNull();
    await user.click(screen.getByLabelText(/Показывать на сайте/));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith(
        '/admin/voting/sites/v1',
        expect.objectContaining({ logoUrl: null, isActive: false, rewardCoins: 50 }),
      ),
    );
  });
});
