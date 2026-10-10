import type { AdminAnnouncementDto, PublicAnnouncementDto } from '@twomc/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnnouncementsPage from '@/app/admin/announcements/page';
import { validateAnnouncement } from '@/app/admin/announcements/_components/announcement-editor';
import { useAuthStore } from '@/lib/auth/store';
import { AnnouncementBanners } from './announcement-banners';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  granted: new Set<string>(),
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
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
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

const publicItems: PublicAnnouncementDto[] = [
  {
    id: 'a1',
    title: 'Обновление 1.21',
    message: 'Сервер обновлён.',
    kind: 'update',
    link: '/news',
    isDismissible: true,
    showUntil: null,
  },
  {
    id: 'a2',
    title: 'Технические работы',
    message: 'Сегодня в 03:00.',
    kind: 'maintenance',
    link: null,
    isDismissible: false,
    showUntil: null,
  },
];

const adminItem = (patch: Partial<AdminAnnouncementDto>): AdminAnnouncementDto => ({
  id: 'x',
  title: 'Черновик',
  message: 'Текст',
  kind: 'info',
  link: null,
  isDismissible: true,
  showFrom: null,
  showUntil: null,
  audience: 'all',
  targetRole: null,
  placements: ['banner'],
  status: 'draft',
  publishedAt: null,
  notifiedAt: null,
  createdAt: '2026-10-10T00:00:00.000Z',
  updatedAt: '2026-10-10T00:00:00.000Z',
  ...patch,
});

beforeEach(() => {
  mocks.granted.clear();
  for (const fn of [mocks.get, mocks.post, mocks.patch, mocks.delete]) fn.mockReset();
  window.localStorage.clear();
  useAuthStore.setState({ status: 'anonymous', user: null });
});

describe('AnnouncementBanners', () => {
  it('гость видит объявления места; закрываемое скрывается и запоминается, обязательное — нет', async () => {
    const user = userEvent.setup();
    mocks.get.mockResolvedValue(publicItems);
    const { unmount } = render(<AnnouncementBanners />, { wrapper: Providers });
    const items = await screen.findAllByTestId('announcement');
    expect(items).toHaveLength(2);
    expect(mocks.get).toHaveBeenCalledWith('/site/announcements', {
      query: { placement: 'banner' },
      auth: false,
    });
    expect(items[0]).toHaveTextContent('Обновление');
    expect(within(items[0]!).getByRole('link', { name: 'Подробнее' })).toHaveAttribute(
      'href',
      '/news',
    );
    expect(within(items[1]!).queryByRole('button', { name: 'Скрыть объявление' })).toBeNull();

    await user.click(within(items[0]!).getByRole('button', { name: 'Скрыть объявление' }));
    expect(screen.getAllByTestId('announcement')).toHaveLength(1);
    unmount();

    render(<AnnouncementBanners />, { wrapper: Providers });
    await waitFor(() => expect(screen.getAllByTestId('announcement')).toHaveLength(1));
    expect(screen.getByTestId('announcement')).toHaveAttribute('data-kind', 'maintenance');
  });
});

describe('validateAnnouncement', () => {
  it('обязательные поля, ссылка, период и роль', () => {
    const base = {
      title: 'a',
      message: 'b',
      link: '',
      showFrom: null,
      showUntil: null,
      audience: 'all' as const,
      targetRole: null,
    };
    expect(validateAnnouncement(base)).toEqual({});
    expect(validateAnnouncement({ ...base, title: ' ', message: '' })).toMatchObject({
      title: expect.any(String),
      message: expect.any(String),
    });
    expect(validateAnnouncement({ ...base, link: '//evil.example' }).link).toBeDefined();
    expect(
      validateAnnouncement({
        ...base,
        showFrom: '2030-01-02T00:00:00Z',
        showUntil: '2030-01-01T00:00:00Z',
      }).period,
    ).toBeDefined();
    expect(validateAnnouncement({ ...base, audience: 'role' }).targetRole).toBeDefined();
  });
});

describe('Коммуникации → Объявления', () => {
  it('список со статусами; новый черновик; публикация через подтверждение', async () => {
    const user = userEvent.setup();
    mocks.granted.add('announcements.view');
    mocks.granted.add('announcements.manage');
    mocks.get.mockImplementation(async (path: string) =>
      path === '/admin/communications/announcements'
        ? {
            items: [
              adminItem({ id: 'd1', title: 'Черновик события', kind: 'event' }),
              adminItem({ id: 'p1', title: 'Обновление', status: 'active', kind: 'update' }),
            ],
            total: 2,
            page: 1,
            limit: 100,
          }
        : [],
    );
    mocks.post.mockResolvedValue(adminItem({ id: 'n1' }));
    render(<AnnouncementsPage />, { wrapper: Providers });

    const rows = await screen.findAllByTestId('announcement-row');
    expect(rows.map((row) => row.dataset.status)).toEqual(['draft', 'active']);
    expect(rows[0]).toHaveTextContent('Черновик');
    expect(rows[1]).toHaveTextContent('Показывается');
    // Активное нельзя удалить — только снять.
    expect(within(rows[1]!).queryByRole('button', { name: /Удалить/ })).toBeNull();
    expect(within(rows[1]!).getByRole('button', { name: /Снять/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Новое объявление' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: 'Технические работы' }));
    await user.type(within(dialog).getByRole('textbox', { name: /Заголовок/ }), 'Техработы');
    await user.type(within(dialog).getByRole('textbox', { name: /^Текст/ }), 'Сегодня ночью.');
    await user.click(within(dialog).getByRole('checkbox', { name: /В центре уведомлений/ }));
    expect(within(dialog).getByTestId('announcement-preview')).toHaveTextContent('Техработы');
    await user.click(within(dialog).getByRole('button', { name: 'Создать черновик' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith(
        '/admin/communications/announcements',
        expect.objectContaining({
          title: 'Техработы',
          kind: 'maintenance',
          placements: ['banner', 'notifications'],
          audience: 'all',
          link: null,
        }),
      ),
    );

    await user.click(within(rows[0]!).getByRole('button', { name: /Опубликовать/ }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Опубликовать «Черновик события»?');
    await user.click(within(confirm).getByRole('button', { name: 'Опубликовать' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/admin/communications/announcements/d1/publish'),
    );
  });

  it('только просмотр — без кнопок изменения', async () => {
    mocks.granted.add('announcements.view');
    mocks.get.mockResolvedValue({ items: [adminItem({})], total: 1, page: 1, limit: 100 });
    render(<AnnouncementsPage />, { wrapper: Providers });
    await screen.findAllByTestId('announcement-row');
    expect(screen.queryByRole('button', { name: 'Новое объявление' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Изменить/ })).toBeNull();
  });
});
