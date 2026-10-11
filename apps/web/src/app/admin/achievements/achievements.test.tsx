import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import AdminAchievementsPage from './page';

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
  usePathname: () => '/admin/achievements',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const ACHIEVEMENT = {
  id: 'a1',
  slug: 'friendly',
  name: 'Дружелюбный',
  description: 'Добавьте 5 друзей',
  iconUrl: 'https://cdn-files.twomc.su/assets/achievements/friendly.png',
  category: 'SOCIAL',
  rarity: 'RARE',
  isSecret: false,
  isActive: true,
  order: 0,
  conditionType: 'FRIENDS_COUNT',
  conditionValue: 5,
  rewardBadgeType: 'VERIFIED',
  rewardTitle: 'Душа компании',
  rewardMessage: null,
  unlockedCount: 3,
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
  mocks.post.mockResolvedValue(ACHIEVEMENT);
  mocks.patch.mockResolvedValue(ACHIEVEMENT);
  mocks.delete.mockResolvedValue(undefined);
  mocks.get.mockImplementation(async (path: string) =>
    path === '/admin/achievements' ? [ACHIEVEMENT] : [],
  );
});

describe('Достижения в админке (срез 7.6)', () => {
  it('только просмотр: каталог с условием, без кнопок изменения', async () => {
    mocks.granted.add('achievements.view');
    render(<AdminAchievementsPage />, { wrapper: Providers });
    const list = await screen.findByTestId('admin-achievements');
    expect(within(list).getByText('Дружелюбный')).toBeInTheDocument();
    expect(list).toHaveTextContent('Друзей ≥ 5 · получили: 3');
    expect(screen.queryByRole('button', { name: 'Добавить достижение' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Пересчитать прогресс' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Изменить' })).toBeNull();
  });

  it('создание: проверка slug и значения условия, POST без пустых наград', async () => {
    const user = userEvent.setup();
    mocks.granted.add('achievements.view');
    mocks.granted.add('achievements.create');
    render(<AdminAchievementsPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Добавить достижение' }));
    await user.type(screen.getByLabelText(/Название/), 'Ветеран');
    await user.type(screen.getByLabelText(/Slug/), 'Veteran 1');
    await user.type(screen.getByLabelText(/Описание/), 'Год на проекте');
    await user.type(screen.getByLabelText(/Иконка/), 'https://cdn-files.twomc.su/v.png');
    await user.selectOptions(screen.getByLabelText(/Условие/), 'ACCOUNT_AGE_DAYS');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(screen.getByText('Только строчные латинские буквы, цифры и дефис')).toBeInTheDocument();
    expect(screen.getByText('Число от 1')).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/Slug/));
    await user.type(screen.getByLabelText(/Slug/), 'veteran');
    await user.type(screen.getByLabelText(/Значение/), '365');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/admin/achievements', {
        name: 'Ветеран',
        slug: 'veteran',
        description: 'Год на проекте',
        iconUrl: 'https://cdn-files.twomc.su/v.png',
        category: 'GAME',
        rarity: 'COMMON',
        isSecret: false,
        isActive: true,
        order: 0,
        conditionType: 'ACCOUNT_AGE_DAYS',
        conditionValue: 365,
      }),
    );
  });

  it('условие, которое API не считает, помечено в форме и не требует значения', async () => {
    const user = userEvent.setup();
    mocks.granted.add('achievements.view');
    mocks.granted.add('achievements.create');
    render(<AdminAchievementsPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Добавить достижение' }));
    await user.selectOptions(screen.getByLabelText(/Условие/), 'DAYS_STREAK');
    expect(screen.getByText(/пока не считается автоматически/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Значение/)).toBeNull();
  });

  it('правка: тип условия заблокирован, очищенная награда уходит как null', async () => {
    const user = userEvent.setup();
    mocks.granted.add('achievements.view');
    mocks.granted.add('achievements.edit');
    render(<AdminAchievementsPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Изменить' }));
    expect(screen.getByLabelText(/Условие/)).toBeDisabled();
    expect(screen.queryByLabelText(/Slug/)).toBeNull();
    await user.selectOptions(screen.getByLabelText(/Значок в награду/), '');
    await user.clear(screen.getByLabelText(/Титул в награду/));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith(
        '/admin/achievements/a1',
        expect.objectContaining({
          conditionValue: 5,
          rewardBadgeType: null,
          rewardTitle: null,
          rewardMessage: null,
        }),
      ),
    );
    const body = mocks.patch.mock.calls[0]![1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('slug');
    expect(body).not.toHaveProperty('conditionType');
  });

  it('пересчёт с подтверждением и итогом; удаление с подтверждением', async () => {
    const user = userEvent.setup();
    for (const key of [
      'achievements.view',
      'achievements.delete',
      'achievements.check_all_users.create',
    ]) {
      mocks.granted.add(key);
    }
    mocks.post.mockResolvedValue({ usersChecked: 42, unlocksGranted: 7 });
    render(<AdminAchievementsPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Пересчитать прогресс' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Пересчитать' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/admin/achievements/check-all-users'),
    );
    expect(mocks.toast.success).toHaveBeenCalledWith('Проверено игроков: 42, выдано достижений: 7');

    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/admin/achievements/a1'));
  });
});
