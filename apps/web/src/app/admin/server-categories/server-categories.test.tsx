import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import AdminServerCategoriesPage from './page';

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
  usePathname: () => '/admin/server-categories',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const CATEGORY = {
  id: 'k1',
  name: 'Анархия',
  slug: 'anarchy',
  description: 'Без правил',
  color: '#F26A1B',
  order: 1,
  isActive: false,
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
  mocks.post.mockResolvedValue({});
  mocks.patch.mockResolvedValue({});
  mocks.delete.mockResolvedValue({ success: true });
  mocks.get.mockResolvedValue([CATEGORY]);
});

describe('Категории серверов в админке', () => {
  it('без права — 403 без запроса', () => {
    render(<AdminServerCategoriesPage />, { wrapper: Providers });
    expect(screen.queryByTestId('server-categories')).toBeNull();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('список: скрытая помечена, кнопки действий только по правам', async () => {
    mocks.granted.add('server_categories.view');
    render(<AdminServerCategoriesPage />, { wrapper: Providers });
    const row = within(await screen.findByTestId('server-categories')).getByRole('listitem');
    expect(row).toHaveTextContent('Анархия');
    expect(row).toHaveTextContent('Скрыта');
    expect(screen.queryByRole('button', { name: 'Изменить' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Удалить' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Добавить категорию' })).toBeNull();
  });

  it('пустой список — честное пустое состояние', async () => {
    mocks.granted.add('server_categories.view');
    mocks.get.mockResolvedValue([]);
    render(<AdminServerCategoriesPage />, { wrapper: Providers });
    expect(await screen.findByText('Категорий пока нет')).toBeInTheDocument();
  });

  it('создание: валидация slug и цвета, затем POST', async () => {
    const user = userEvent.setup();
    mocks.granted.add('server_categories.view');
    mocks.granted.add('server_categories.create');
    render(<AdminServerCategoriesPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Добавить категорию' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect(await within(dialog).findByText('Введите название')).toBeInTheDocument();
    expect(within(dialog).getByText(/Только строчные латинские/)).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText(/Название/), 'Выживание');
    await user.type(within(dialog).getByLabelText(/Slug/), 'survival');
    await user.type(within(dialog).getByLabelText('Цвет'), 'red');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect(await within(dialog).findByText('Цвет в формате #RRGGBB')).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText('Цвет'));
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/admin/server-categories', {
        name: 'Выживание',
        description: '',
        order: 0,
        isActive: true,
        slug: 'survival',
      }),
    );
  });

  it('правка не меняет slug; удаление — с подтверждением', async () => {
    const user = userEvent.setup();
    for (const key of ['view', 'edit', 'delete']) mocks.granted.add(`server_categories.${key}`);
    render(<AdminServerCategoriesPage />, { wrapper: Providers });
    const row = within(await screen.findByTestId('server-categories')).getByRole('listitem');
    await user.click(within(row).getByRole('button', { name: 'Изменить' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/Slug/)).toBeDisabled();
    await user.clear(within(dialog).getByLabelText(/Название/));
    await user.type(within(dialog).getByLabelText(/Название/), 'Анархия 2');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith(
        '/admin/server-categories/k1',
        expect.objectContaining({ name: 'Анархия 2', color: '#F26A1B' }),
      ),
    );
    expect(mocks.patch.mock.calls[0]![1]).not.toHaveProperty('slug');

    await user.click(within(row).getByRole('button', { name: 'Удалить' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(mocks.delete).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/admin/server-categories/k1'));
  });
});
