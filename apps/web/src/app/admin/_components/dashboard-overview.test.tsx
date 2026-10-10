import type { AdminSystemOverview, PublicSiteSettings } from '@twomc/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_NAV } from '@/lib/admin/navigation';
import { QuickActions } from './quick-actions';
import { StatusOverview } from './status-overview';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  granted: new Set<string>(),
}));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get },
}));
vi.mock('@/lib/auth/use-permissions', () => ({
  usePermissions: () => ({
    can: (requirement: string | string[]) =>
      (Array.isArray(requirement) ? requirement : [requirement]).some((key) =>
        mocks.granted.has(key),
      ),
  }),
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

const overview = (patch: Partial<AdminSystemOverview>): AdminSystemOverview => ({
  maintenance: null,
  disabledModules: [],
  activeAnnouncements: 0,
  health: { database: 'ok', redis: 'ok' },
  serverTime: '2026-10-20T12:00:00.000Z',
  ...patch,
});

function serve(data: AdminSystemOverview, settings: Partial<PublicSiteSettings> = {}) {
  mocks.get.mockImplementation(async (path: string) =>
    path === '/admin/system/overview' ? data : settings,
  );
}

beforeEach(() => {
  mocks.granted.clear();
  mocks.get.mockReset();
});

describe('StatusOverview', () => {
  it('всё спокойно: без сезона, работ нет, модули работают, объявлений нет, здоровье в порядке', async () => {
    serve(overview({}));
    render(<StatusOverview />, { wrapper: Providers });
    expect(await screen.findByTestId('overview-maintenance')).toHaveTextContent('Не идут');
    expect(screen.getByTestId('overview-modules')).toHaveTextContent('Все работают');
    expect(screen.getByTestId('overview-announcements')).toHaveTextContent('Нет активных');
    expect(screen.getByTestId('overview-health')).toHaveTextContent('Всё в порядке');
    // Ссылки — только при праве на раздел.
    expect(screen.getByTestId('overview-modules').tagName).toBe('DIV');
  });

  it('реальные значения: сезон по времени сервера, полные работы, выключенные модули, проблемы', async () => {
    mocks.granted.add('system.modules.view');
    serve(
      overview({
        maintenance: {
          active: true,
          scope: 'full',
          modules: [],
          title: 'Работы',
          message: 'Скоро',
          startsAt: null,
          estimatedEnd: null,
        },
        disabledModules: ['chat', 'store'],
        activeAnnouncements: 3,
        health: { database: 'ok', redis: 'error' },
      }),
      {
        seasonal: {
          enabled: true,
          mode: 'auto',
          forcedCampaignId: null,
          showWordmarkO: true,
          showDecoration: true,
          showEffects: true,
          showBanners: true,
          effectIntensity: 2,
          fallingMode: 'season',
          fallingEffect: null,
          effectSpeed: 2,
          campaigns: {},
          serverTime: '2026-10-20T12:00:00.000Z',
        },
      },
    );
    render(<StatusOverview />, { wrapper: Providers });
    expect(await screen.findByTestId('overview-seasonal')).toHaveTextContent('Хэллоуин');
    expect(screen.getByTestId('overview-maintenance')).toHaveTextContent('Идут: весь сайт');
    expect(screen.getByTestId('overview-modules')).toHaveTextContent('Выключено: 2');
    expect(screen.getByTestId('overview-modules')).toHaveAttribute(
      'href',
      '/admin/system?tab=modules',
    );
    expect(screen.getByTestId('overview-announcements')).toHaveTextContent('3 активных');
    expect(screen.getByTestId('overview-health')).toHaveTextContent('Есть проблемы');
    expect(screen.getByTestId('overview-health')).toHaveTextContent('Redis: ошибка');
  });
});

describe('QuickActions', () => {
  it('только действия, на которые есть право', () => {
    const { unmount } = render(<QuickActions />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    unmount();
    mocks.granted.add('announcements.manage');
    mocks.granted.add('system.maintenance.manage');
    render(<QuickActions />);
    expect(screen.getByRole('link', { name: 'Создать объявление' })).toHaveAttribute(
      'href',
      '/admin/announcements?new=1',
    );
    expect(screen.getByRole('link', { name: 'Включить техработы' })).toHaveAttribute(
      'href',
      '/admin/system?tab=maintenance',
    );
    expect(screen.queryByRole('link', { name: 'Отправить системное сообщение' })).toBeNull();
  });
});

describe('навигация админки', () => {
  it('группы по ТЗ: логичный порядок, без длинного списка', () => {
    expect(ADMIN_NAV.map((group) => group.title)).toEqual([
      'Обзор',
      'Люди и доступ',
      'Контент',
      'Финансы',
      'Коммуникации',
      'Оформление',
      'Система',
      'Безопасность',
      'Аудит',
      'Инструменты',
    ]);
    const items = ADMIN_NAV.flatMap((group) => group.items);
    expect(items.length).toBeLessThanOrEqual(20);
    expect(new Set(items.map((item) => item.href)).size).toBe(items.length);
  });
});
