import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api/errors';
import AdminStoreCategoriesPage from './page';

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
  usePathname: () => '/admin/store/categories',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const CATEGORY = {
  id: 'c1',
  name: 'Привилегии',
  slug: 'privileges',
  description: 'Донат',
  icon: null,
  image: null,
  order: 2,
  isActive: true,
  parentId: null,
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
  for (const fn of Object.values(mocks.toast)) fn.mockReset();
  mocks.post.mockResolvedValue(CATEGORY);
  mocks.patch.mockResolvedValue(CATEGORY);
  mocks.delete.mockResolvedValue({ success: true });
  mocks.get.mockImplementation(async (path: string) =>
    path === '/admin/store/categories' ? [CATEGORY] : [],
  );
});

describe('Админка магазина: категории (0.3)', () => {
  it('без права — экран 403', () => {
    render(<AdminStoreCategoriesPage />, { wrapper: Providers });
    expect(screen.queryByTestId('admin-categories')).toBeNull();
    expect(screen.getByText(/store\.categories\.view/)).toBeInTheDocument();
  });

  it('только просмотр: список без кнопок управления', async () => {
    mocks.granted.add('store.categories.view');
    render(<AdminStoreCategoriesPage />, { wrapper: Providers });
    const list = await screen.findByTestId('admin-categories');
    expect(list).toHaveTextContent('privileges');
    expect(list).toHaveTextContent('порядок 2');
    expect(screen.queryByRole('button', { name: 'Новая категория' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Изменить' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Удалить' })).toBeNull();
  });

  it('создание: slug проверяется, POST с порядком и активностью', async () => {
    const user = userEvent.setup();
    for (const key of ['store.categories.view', 'store.categories.create']) mocks.granted.add(key);
    render(<AdminStoreCategoriesPage />, { wrapper: Providers });
    await screen.findByTestId('admin-categories');
    await user.click(screen.getByRole('button', { name: 'Новая категория' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Название/), 'Ключи');
    await user.type(within(dialog).getByLabelText(/Slug/), 'Bad Slug');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect(
      within(dialog).getByText('Только строчные латинские буквы, цифры и дефис'),
    ).toBeVisible();
    expect(mocks.post).not.toHaveBeenCalled();

    const slug = within(dialog).getByLabelText(/Slug/);
    await user.clear(slug);
    await user.type(slug, 'keys');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post).toHaveBeenCalledWith('/admin/store/categories', {
      name: 'Ключи',
      slug: 'keys',
      order: 0,
      isActive: true,
    });
  });

  it('создание: 409 по slug — ошибка у поля', async () => {
    const user = userEvent.setup();
    for (const key of ['store.categories.view', 'store.categories.create']) mocks.granted.add(key);
    mocks.post.mockRejectedValueOnce(new ApiError(409, ['Категория с таким slug уже существует']));
    render(<AdminStoreCategoriesPage />, { wrapper: Providers });
    await screen.findByTestId('admin-categories');
    await user.click(screen.getByRole('button', { name: 'Новая категория' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Название/), 'Ключи');
    await user.type(within(dialog).getByLabelText(/Slug/), 'keys');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect(await within(dialog).findByText('Категория с таким slug уже существует')).toBeVisible();
    expect(within(dialog).getByLabelText(/Slug/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('правка: slug заблокирован, PATCH с порядком; скрытие одним кликом', async () => {
    const user = userEvent.setup();
    for (const key of ['store.categories.view', 'store.categories.edit']) mocks.granted.add(key);
    render(<AdminStoreCategoriesPage />, { wrapper: Providers });
    await screen.findByTestId('admin-categories');
    await user.click(screen.getByRole('button', { name: 'Скрыть' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/admin/store/categories/c1', { isActive: false }),
    );

    await user.click(screen.getByRole('button', { name: 'Изменить' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/Slug/)).toBeDisabled();
    const order = within(dialog).getByLabelText('Порядок');
    await user.clear(order);
    await user.type(order, '7');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(2));
    expect(mocks.patch.mock.calls[1]![1]).toMatchObject({ order: 7, name: 'Привилегии' });
  });

  it('удаление: 400 «есть товары» — сообщение API в toast', async () => {
    const user = userEvent.setup();
    for (const key of ['store.categories.view', 'store.categories.delete']) mocks.granted.add(key);
    mocks.delete.mockRejectedValueOnce(new ApiError(400, ['Нельзя удалить категорию с товарами']));
    render(<AdminStoreCategoriesPage />, { wrapper: Providers });
    await screen.findByTestId('admin-categories');
    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Удалить' }));
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith('Нельзя удалить категорию с товарами'),
    );
  });
});
