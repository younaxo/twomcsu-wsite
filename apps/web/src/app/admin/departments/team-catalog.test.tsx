import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import AdminCustomPositionsPage from '../custom-positions/page';
import AdminDepartmentsPage from './page';

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
  usePathname: () => '/admin/departments',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const DEPARTMENT = {
  id: 'd1',
  name: 'Модерация',
  slug: 'moderation',
  description: 'Порядок в чате',
  color: '#22c55e',
  isActive: true,
  order: 2,
  membersCount: 5,
};
const CUSTOM = {
  id: 'c1',
  name: 'Летописец',
  slug: 'chronicler',
  description: null,
  color: null,
  isActive: false,
  usersCount: 1,
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
  mocks.post.mockResolvedValue(DEPARTMENT);
  mocks.patch.mockResolvedValue(DEPARTMENT);
  mocks.delete.mockResolvedValue(undefined);
  mocks.get.mockImplementation(async (path: string) => {
    if (path === '/admin/departments') return [DEPARTMENT];
    if (path === '/admin/custom-positions') return [CUSTOM];
    return [];
  });
});

describe('Отделы и свои должности в админке (срез 7.6)', () => {
  it('отделы, только просмотр: список с числом участников, без кнопок', async () => {
    mocks.granted.add('departments.view');
    render(<AdminDepartmentsPage />, { wrapper: Providers });
    const list = await screen.findByTestId('team-catalog');
    expect(within(list).getByText('Модерация')).toBeInTheDocument();
    expect(list).toHaveTextContent('Участников: 5');
    expect(screen.queryByRole('button', { name: 'Добавить отдел' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Изменить' })).toBeNull();
  });

  it('отделы: создание с проверкой slug, POST без пустых полей', async () => {
    const user = userEvent.setup();
    mocks.granted.add('departments.view');
    mocks.granted.add('departments.create');
    render(<AdminDepartmentsPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Добавить отдел' }));
    await user.type(screen.getByLabelText(/Название/), 'Билдеры');
    await user.type(screen.getByLabelText(/Slug/), 'Build Team');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(screen.getByText('Только строчные латинские буквы, цифры и дефис')).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText(/Slug/));
    await user.type(screen.getByLabelText(/Slug/), 'builders');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/admin/departments', {
        name: 'Билдеры',
        slug: 'builders',
      }),
    );
  });

  it('отделы: правка с порядком, очищенное описание — null; удаление с числом участников', async () => {
    const user = userEvent.setup();
    for (const key of ['departments.view', 'departments.edit', 'departments.delete']) {
      mocks.granted.add(key);
    }
    render(<AdminDepartmentsPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Изменить' }));
    await user.clear(screen.getByLabelText(/Описание/));
    await user.clear(screen.getByLabelText(/Порядок/));
    await user.type(screen.getByLabelText(/Порядок/), '1');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/admin/departments/d1', {
        name: 'Модерация',
        description: null,
        color: '#22c55e',
        isActive: true,
        order: 1,
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('снимется со всех участников (5)');
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/admin/departments/d1'));
  });

  it('свои должности: свой адрес и права, у правки нет порядка', async () => {
    const user = userEvent.setup();
    mocks.granted.add('custom_positions.view');
    mocks.granted.add('custom_positions.edit');
    render(<AdminCustomPositionsPage />, { wrapper: Providers });
    const list = await screen.findByTestId('team-catalog');
    expect(list).toHaveTextContent('Летописец');
    expect(list).toHaveTextContent('У игроков: 1');
    expect(within(list).getByText('Не активен')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Изменить' }));
    expect(screen.queryByLabelText(/Порядок/)).toBeNull();
    await user.click(screen.getByLabelText(/Активен/));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/admin/custom-positions/c1', {
        name: 'Летописец',
        description: null,
        color: null,
        isActive: true,
      }),
    );
  });
});
