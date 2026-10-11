import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdminUserFull } from '@twomc/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TeamTab } from './team-tab';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  granted: new Set<string>(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post, delete: mocks.delete },
}));
vi.mock('@/lib/auth/use-permissions', () => ({
  usePermissions: () => ({
    can: (requirement: string | readonly string[]) =>
      (Array.isArray(requirement) ? requirement : [requirement]).some((key) =>
        mocks.granted.has(key as string),
      ),
  }),
}));
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }));

const USER = {
  id: 'u1',
  username: 'builder',
  position: { id: 'p1', displayName: 'Игрок', color: '#9ca3af' },
  departments: [
    { departmentId: 'd1', department: { id: 'd1', name: 'Модерация', color: '#22c55e' } },
  ],
  customPosition: null,
  roles: [],
} as unknown as AdminUserFull;

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
  for (const fn of [mocks.get, mocks.post, mocks.delete]) fn.mockReset();
  mocks.post.mockResolvedValue({ success: true });
  mocks.delete.mockResolvedValue({ success: true });
  mocks.get.mockImplementation(async (path: string) => {
    if (path === '/positions/manage') {
      return [
        { id: 'p1', displayName: 'Игрок' },
        { id: 'p2', displayName: 'Модератор' },
      ];
    }
    if (path === '/admin/departments') {
      return [
        { id: 'd1', name: 'Модерация', isActive: true },
        { id: 'd2', name: 'Билдеры', isActive: true },
      ];
    }
    if (path === '/admin/awards') {
      return [
        { id: 'w1', name: 'Строитель года', isActive: true },
        { id: 'w2', name: 'Ивентёр', isActive: true },
        { id: 'w3', name: 'Скрытая', isActive: false },
      ];
    }
    if (path === '/admin/users/u1/awards') {
      return [
        {
          awardId: 'w1',
          grantedAt: '2026-10-01T10:00:00.000Z',
          award: { id: 'w1', name: 'Строитель года', iconUrl: '', rarity: 'epic' },
        },
      ];
    }
    return [];
  });
});

describe('«Команда и награды» в карточке пользователя (срез 7.6)', () => {
  it('только users.awards: блок наград — выдать доступную, снять с подтверждением', async () => {
    const user = userEvent.setup();
    mocks.granted.add('users.awards');
    mocks.granted.add('awards.view');
    render(<TeamTab user={USER} />, { wrapper: Providers });
    expect(screen.queryByText('Должность')).toBeNull();
    expect(await screen.findByTestId('user-awards')).toHaveTextContent('Строитель года');

    const picker = await screen.findByLabelText('Выдать награду');
    const labels = within(picker)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(labels).toEqual(['Выберите…', 'Ивентёр']);
    await user.selectOptions(picker, 'w2');
    await user.click(screen.getByRole('button', { name: 'Выдать' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/admin/users/u1/awards/w2'));

    await user.click(screen.getByRole('button', { name: 'Снять' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Снять' }));
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/admin/users/u1/awards/w1'));
  });

  it('должность: назначение другой из каталога', async () => {
    const user = userEvent.setup();
    mocks.granted.add('positions.assign');
    mocks.granted.add('positions.view');
    render(<TeamTab user={USER} />, { wrapper: Providers });
    await user.selectOptions(await screen.findByLabelText('Новая должность'), 'p2');
    await user.click(screen.getByRole('button', { name: 'Назначить' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/positions/p2/assign', { userId: 'u1' }),
    );
  });

  it('отделы без права на каталог: можно убрать, добавить — нет', async () => {
    const user = userEvent.setup();
    mocks.granted.add('departments.assign');
    render(<TeamTab user={USER} />, { wrapper: Providers });
    expect(screen.getByTestId('user-departments')).toHaveTextContent('Модерация');
    expect(screen.queryByLabelText('Добавить в отдел')).toBeNull();
    expect(mocks.get).not.toHaveBeenCalledWith('/admin/departments');
    await user.click(screen.getByRole('button', { name: 'Убрать из отдела Модерация' }));
    await waitFor(() =>
      expect(mocks.delete).toHaveBeenCalledWith('/admin/users/u1/departments/d1'),
    );
  });
});
