import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import AdminPositionsPage from './page';

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
  usePathname: () => '/admin/positions',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const base = {
  group: 'staff',
  description: null,
  isVisible: true,
  isDefault: false,
  usersCount: 0,
  productsCount: 0,
};
const MODERATOR = {
  ...base,
  id: 'p1',
  name: 'moderator',
  slug: 'moderator',
  displayName: 'Модератор',
  color: '#22c55e',
  priority: 50,
  usersCount: 3,
};
const BUILDER = {
  ...base,
  id: 'p2',
  name: 'builder',
  slug: 'builder',
  displayName: 'Строитель',
  color: '#f97316',
  priority: 10,
  description: 'Строит спавн',
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
  mocks.post.mockResolvedValue(BUILDER);
  mocks.patch.mockResolvedValue(BUILDER);
  mocks.delete.mockResolvedValue(undefined);
  mocks.get.mockImplementation(async (path: string) =>
    path === '/positions/manage' ? [MODERATOR, BUILDER] : [],
  );
});

describe('Должности в админке (срез 7.6)', () => {
  it('только просмотр: каталог с приоритетом и числом игроков, без кнопок', async () => {
    mocks.granted.add('positions.view');
    render(<AdminPositionsPage />, { wrapper: Providers });
    const list = await screen.findByTestId('admin-positions');
    expect(within(list).getByText('Модератор')).toBeInTheDocument();
    expect(list).toHaveTextContent('Приоритет 50 · игроков: 3');
    expect(screen.queryByRole('button', { name: 'Добавить должность' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Изменить' })).toBeNull();
  });

  it('создание: проверка полей, POST без пустого описания', async () => {
    const user = userEvent.setup();
    mocks.granted.add('positions.view');
    mocks.granted.add('positions.create');
    render(<AdminPositionsPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Добавить должность' }));
    await user.type(screen.getByLabelText(/Название/), 'helper');
    await user.type(screen.getByLabelText(/Slug/), 'Help Er');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(screen.getByText('Только строчные латинские буквы, цифры и дефис')).toBeInTheDocument();
    expect(screen.getByText('Укажите группу')).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/Slug/));
    await user.type(screen.getByLabelText(/Slug/), 'helper');
    await user.type(screen.getByLabelText(/Как показывать/), 'Хелпер');
    await user.type(screen.getByLabelText(/Группа/), 'staff');
    await user.type(screen.getByLabelText(/Приоритет/), '5');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/positions', {
        name: 'helper',
        slug: 'helper',
        displayName: 'Хелпер',
        group: 'staff',
        color: '#9ca3af',
        priority: 5,
        isVisible: true,
      }),
    );
  });

  it('правка: без названия и slug, очищенное описание уходит как null', async () => {
    const user = userEvent.setup();
    mocks.granted.add('positions.view');
    mocks.granted.add('positions.edit');
    render(<AdminPositionsPage />, { wrapper: Providers });
    const rows = within(await screen.findByTestId('admin-positions')).getAllByRole('listitem');
    await user.click(within(rows[1]!).getByRole('button', { name: 'Изменить' }));
    expect(screen.queryByLabelText(/Slug/)).toBeNull();
    await user.clear(screen.getByLabelText(/Описание/));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/positions/p2', {
        displayName: 'Строитель',
        group: 'staff',
        color: '#f97316',
        priority: 10,
        isVisible: true,
        description: null,
      }),
    );
  });

  it('удаление: недоступно у назначенной должности, у свободной — с подтверждением', async () => {
    const user = userEvent.setup();
    mocks.granted.add('positions.view');
    mocks.granted.add('positions.delete');
    render(<AdminPositionsPage />, { wrapper: Providers });
    const rows = within(await screen.findByTestId('admin-positions')).getAllByRole('listitem');
    expect(within(rows[0]!).getByRole('button', { name: 'Удалить' })).toBeDisabled();
    await user.click(within(rows[1]!).getByRole('button', { name: 'Удалить' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/positions/p2'));
  });
});
