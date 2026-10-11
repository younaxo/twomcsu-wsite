import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import AdminAwardsPage from './page';

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
  usePathname: () => '/admin/awards',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const AWARD = {
  id: 'w1',
  name: 'Строитель года',
  slug: 'builder-2026',
  description: 'За лучшую постройку',
  iconUrl: 'https://cdn-files.twomc.su/assets/awards/builder.png',
  rarity: 'epic',
  isActive: true,
  holdersCount: 4,
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
  mocks.post.mockResolvedValue(AWARD);
  mocks.patch.mockResolvedValue(AWARD);
  mocks.delete.mockResolvedValue(undefined);
  mocks.get.mockImplementation(async (path: string) => (path === '/admin/awards' ? [AWARD] : []));
});

describe('Награды в админке (срез 7.6)', () => {
  it('только просмотр: каталог с редкостью и числом обладателей, без кнопок', async () => {
    mocks.granted.add('awards.view');
    render(<AdminAwardsPage />, { wrapper: Providers });
    const list = await screen.findByTestId('admin-awards');
    expect(within(list).getByText('Строитель года')).toBeInTheDocument();
    expect(within(list).getByText('Эпическая')).toBeInTheDocument();
    expect(list).toHaveTextContent('У игроков: 4');
    expect(screen.queryByRole('button', { name: 'Добавить награду' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Изменить' })).toBeNull();
  });

  it('создание: проверка slug, POST без пустых полей и без isActive', async () => {
    const user = userEvent.setup();
    mocks.granted.add('awards.view');
    mocks.granted.add('awards.create');
    render(<AdminAwardsPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Добавить награду' }));
    expect(screen.queryByLabelText(/Показывать на сайте/)).toBeNull();
    await user.type(screen.getByLabelText(/Название/), 'Ивентёр');
    await user.type(screen.getByLabelText(/Slug/), 'Event Master');
    await user.type(screen.getByLabelText(/Иконка/), 'https://cdn-files.twomc.su/e.png');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(screen.getByText('Только строчные латинские буквы, цифры и дефис')).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/Slug/));
    await user.type(screen.getByLabelText(/Slug/), 'event-master');
    await user.selectOptions(screen.getByLabelText(/Редкость/), 'rare');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/admin/awards', {
        name: 'Ивентёр',
        slug: 'event-master',
        iconUrl: 'https://cdn-files.twomc.su/e.png',
        rarity: 'rare',
      }),
    );
  });

  it('правка: очищенные описание и редкость уходят как null, скрытие', async () => {
    const user = userEvent.setup();
    mocks.granted.add('awards.view');
    mocks.granted.add('awards.edit');
    render(<AdminAwardsPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Изменить' }));
    expect(screen.queryByLabelText(/Slug/)).toBeNull();
    await user.clear(screen.getByLabelText(/Описание/));
    await user.selectOptions(screen.getByLabelText(/Редкость/), '');
    await user.click(screen.getByLabelText(/Показывать на сайте/));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/admin/awards/w1', {
        name: 'Строитель года',
        description: null,
        iconUrl: 'https://cdn-files.twomc.su/assets/awards/builder.png',
        rarity: null,
        isActive: false,
      }),
    );
  });

  it('удаление: подтверждение называет число обладателей', async () => {
    const user = userEvent.setup();
    mocks.granted.add('awards.view');
    mocks.granted.add('awards.delete');
    render(<AdminAwardsPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Удалить' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('пропадёт у всех обладателей (4)');
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/admin/awards/w1'));
  });
});
