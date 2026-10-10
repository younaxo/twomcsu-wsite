import type { StorageCategoryDto, StorageOverviewDto } from '@twomc/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatBytes } from '@/lib/format';
import StoragePage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  granted: new Set<string>(),
}));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch },
}));
vi.mock('@/lib/auth/use-permissions', () => ({
  usePermissions: () => ({
    can: (requirement: string | string[]) =>
      (Array.isArray(requirement) ? requirement : [requirement]).some((key) =>
        mocks.granted.has(key),
      ),
  }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/storage',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

const category = (patch: Partial<StorageCategoryDto>): StorageCategoryDto => ({
  key: 'technical',
  label: 'Технические записи',
  description: '',
  sensitive: false,
  retentionDays: 7,
  total: 120,
  due: 40,
  totalBytes: 65_536,
  dueBytes: 20_480,
  ...patch,
});

const overview: StorageOverviewDto = {
  autoCleanup: true,
  categories: [
    category({ key: 'audit', label: 'Журнал аудита', sensitive: true, retentionDays: 90 }),
    category({ key: 'technical' }),
    category({ key: 'serverStatus', label: 'Статусы серверов', retentionDays: 0, due: 0 }),
  ],
  lastRunAt: '2026-10-10T01:00:00.000Z',
  lastRunTrigger: 'auto',
  lastResult: { technical: 3 },
};

beforeEach(() => {
  mocks.granted.clear();
  for (const fn of [mocks.get, mocks.post, mocks.patch]) fn.mockReset();
  mocks.get.mockResolvedValue(overview);
});

describe('formatBytes', () => {
  it('русские единицы и округление', () => {
    expect(formatBytes(512)).toBe('512 Б');
    expect(formatBytes(1536)).toBe('1,5 КБ');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 МБ');
  });
});

describe('Система → Хранилище и журналы', () => {
  it('объём и срок по категориям; аудит без особого права заблокирован; «не удалять»', async () => {
    mocks.granted.add('system.storage.view');
    mocks.granted.add('system.storage.manage');
    render(<StoragePage />, { wrapper: Providers });
    const section = (key: string) =>
      document.querySelector(`[data-category="${key}"]`) as HTMLElement;
    await waitFor(() => expect(section('technical')).not.toBeNull());
    expect(section('technical')).toHaveTextContent('64 КБ');
    expect(screen.getByTestId('due-technical')).toHaveTextContent('40 (≈ 20 КБ)');
    expect(screen.getByTestId('due-serverStatus')).toHaveTextContent('Автоматически не удаляется');
    expect(within(section('audit')).getByRole('button', { name: /Очистить/ })).toBeDisabled();
    expect(within(section('technical')).getByRole('button', { name: /Очистить/ })).toBeEnabled();
    expect(screen.getByTestId('storage-last-run')).toHaveTextContent('автоматически');
  });

  it('очистка: период → предпросмотр с сервера → подтверждение с числом', async () => {
    const user = userEvent.setup();
    mocks.granted.add('system.storage.view');
    mocks.granted.add('system.storage.manage');
    mocks.post.mockImplementation(async (path: string) =>
      path.endsWith('/preview') ? { count: 12, bytes: 4096 } : { deleted: 12 },
    );
    render(<StoragePage />, { wrapper: Providers });
    await waitFor(() =>
      expect(document.querySelector('[data-category="technical"]')).not.toBeNull(),
    );
    const section = document.querySelector('[data-category="technical"]') as HTMLElement;
    await user.click(within(section).getByRole('button', { name: /Очистить/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(await within(dialog).findByTestId('cleanup-preview')).toHaveTextContent(
      'Будет удалено: 12 записей (≈ 4 КБ)',
    );
    expect(mocks.post).toHaveBeenCalledWith('/admin/system/storage/preview', {
      category: 'technical',
      olderThanDays: 365,
    });
    await user.click(within(dialog).getByRole('radio', { name: 'Все' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/admin/system/storage/preview', {
        category: 'technical',
        olderThanDays: null,
      }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Очистить' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/admin/system/storage/cleanup', {
        category: 'technical',
        olderThanDays: null,
        confirmCount: 12,
      }),
    );
  });

  it('смена срока хранения сохраняется', async () => {
    const user = userEvent.setup();
    mocks.granted.add('system.storage.view');
    mocks.granted.add('system.storage.manage');
    mocks.patch.mockResolvedValue(overview);
    render(<StoragePage />, { wrapper: Providers });
    const trigger = await screen.findByRole('combobox', {
      name: 'Технические записи: срок хранения',
    });
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: '30 дней' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/admin/system/storage', {
        retention: { technical: 30 },
      }),
    );
  });
});
