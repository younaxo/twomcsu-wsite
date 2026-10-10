import type { MaintenanceSettingsDto, PublicSiteStatus, SiteModuleDto } from '@twomc/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SystemPage from '@/app/admin/system/page';
import { validateMaintenance } from '@/app/admin/system/_components/maintenance-panel';
import { ApiError } from '@/lib/api/errors';
import { isSiteUnavailable } from '@/lib/query/client';
import { moduleUnavailability } from '@/lib/site/status';
import { MaintenanceScreen, ModuleGate } from './site-availability';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  granted: new Set<string>(),
}));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, patch: mocks.patch, put: mocks.put },
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
  usePathname: () => '/admin/system',
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

const status = (patch: Partial<PublicSiteStatus>): PublicSiteStatus => ({
  maintenance: null,
  disabledModules: [],
  serverTime: '2026-10-10T00:00:00.000Z',
  ...patch,
});

const works = {
  active: true,
  scope: 'partial' as const,
  modules: ['store'],
  title: 'Технические работы',
  message: 'Обновляем магазин.',
  startsAt: null,
  estimatedEnd: '2026-10-10T05:00:00.000Z',
};

beforeEach(() => {
  mocks.granted.clear();
  for (const fn of [mocks.get, mocks.patch, mocks.put]) fn.mockReset();
});

describe('статус сайта', () => {
  it('moduleUnavailability: выключен, частичные и полные техработы, запланированные', () => {
    expect(moduleUnavailability(status({}), 'store')).toBeNull();
    expect(moduleUnavailability(status({ disabledModules: ['store'] }), 'store')).toBe(
      'MODULE_DISABLED',
    );
    expect(moduleUnavailability(status({ maintenance: works }), 'store')).toBe('MAINTENANCE');
    expect(moduleUnavailability(status({ maintenance: works }), 'chat')).toBeNull();
    expect(moduleUnavailability(status({ maintenance: { ...works, scope: 'full' } }), 'chat')).toBe(
      'MAINTENANCE',
    );
    expect(
      moduleUnavailability(status({ maintenance: { ...works, active: false } }), 'store'),
    ).toBeNull();
    expect(moduleUnavailability(undefined, 'store')).toBeNull();
  });

  it('isSiteUnavailable: только 503 с кодом недоступности', () => {
    expect(isSiteUnavailable(new ApiError(503, ['x'], { code: 'MAINTENANCE' }))).toBe(true);
    expect(isSiteUnavailable(new ApiError(503, ['x']))).toBe(false);
    expect(isSiteUnavailable(new ApiError(500, ['x'], { code: 'MAINTENANCE' }))).toBe(false);
  });
});

describe('ModuleGate', () => {
  it('выключенный модуль — «Раздел временно недоступен» вместо содержимого', async () => {
    mocks.get.mockResolvedValue(status({ disabledModules: ['store'] }));
    render(
      <ModuleGate module="store">
        <p>Каталог</p>
      </ModuleGate>,
      { wrapper: Providers },
    );
    const state = await screen.findByTestId('module-unavailable');
    expect(state).toHaveAttribute('data-reason', 'MODULE_DISABLED');
    expect(state).toHaveTextContent('Раздел временно недоступен');
    expect(screen.queryByText('Каталог')).toBeNull();
    expect(within(state).getByRole('link', { name: 'На главную' })).toHaveAttribute('href', '/');
  });

  it('техработы — сообщение и ожидаемое окончание; сотрудник видит раздел с плашкой', async () => {
    mocks.get.mockResolvedValue(status({ maintenance: works }));
    const { unmount } = render(
      <ModuleGate module="store">
        <p>Каталог</p>
      </ModuleGate>,
      { wrapper: Providers },
    );
    const state = await screen.findByTestId('module-unavailable');
    expect(state).toHaveTextContent('Идут технические работы');
    expect(state).toHaveTextContent('Обновляем магазин.');
    expect(state).toHaveTextContent('Ожидаемое окончание');
    unmount();

    mocks.granted.add('system.maintenance.bypass');
    render(
      <ModuleGate module="store">
        <p>Каталог</p>
      </ModuleGate>,
      { wrapper: Providers },
    );
    expect(await screen.findByTestId('staff-bypass-notice')).toHaveTextContent('как сотрудник');
    expect(screen.getByText('Каталог')).toBeInTheDocument();
  });

  it('экран полных техработ: заголовок, текст, вход для сотрудников', () => {
    render(<MaintenanceScreen maintenance={{ ...works, scope: 'full' }} />);
    const screenEl = screen.getByTestId('maintenance-screen');
    expect(screenEl).toHaveTextContent('Технические работы');
    expect(screenEl).toHaveTextContent('Обновляем магазин.');
    expect(within(screenEl).getByRole('link', { name: 'Вход для сотрудников' })).toHaveAttribute(
      'href',
      '/login',
    );
  });
});

const modules: SiteModuleDto[] = [
  {
    key: 'auth',
    label: 'Вход и регистрация',
    description: '',
    tier: 'core',
    enabled: true,
    reason: null,
    disabledAt: null,
  },
  {
    key: 'store',
    label: 'Магазин',
    description: '',
    tier: 'protected',
    enabled: true,
    reason: null,
    disabledAt: null,
  },
  {
    key: 'friends',
    label: 'Друзья',
    description: '',
    tier: 'regular',
    enabled: true,
    reason: null,
    disabledAt: null,
  },
];
const maintenanceOff: MaintenanceSettingsDto = {
  enabled: false,
  scope: 'full',
  modules: [],
  title: 'Технические работы',
  message: 'Скоро вернёмся.',
  reason: null,
  startsAt: null,
  estimatedEnd: null,
  active: false,
  enabledAt: null,
  updatedAt: null,
};

describe('Система → Техработы и модули', () => {
  beforeEach(() => {
    mocks.get.mockImplementation(async (path: string) =>
      path === '/admin/system/modules' ? modules : maintenanceOff,
    );
  });

  it('модули: ядро нельзя, защищённый — без права заблокирован; выключение — с причиной', async () => {
    const user = userEvent.setup();
    mocks.granted.add('system.modules.view');
    mocks.granted.add('system.modules.manage');
    mocks.patch.mockResolvedValue({ ...modules[2], enabled: false, reason: 'Ремонт' });
    render(<SystemPage />, { wrapper: Providers });

    const row = (key: string) => document.querySelector(`[data-module="${key}"]`) as HTMLElement;
    await waitFor(() => expect(row('friends')).not.toBeNull());
    expect(within(row('auth')).getByRole('switch')).toBeDisabled();
    expect(within(row('store')).getByRole('switch')).toBeDisabled();

    await user.click(within(row('friends')).getByRole('switch'));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Выключить «Друзья»?');
    await user.type(within(dialog).getByRole('textbox', { name: /Причина/ }), 'Ремонт');
    await user.click(within(dialog).getByRole('button', { name: 'Выключить' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/admin/system/modules/friends', {
        enabled: false,
        reason: 'Ремонт',
      }),
    );
  });

  it('техработы: весь сайт — только после подтверждения «Закрыть сайт»', async () => {
    const user = userEvent.setup();
    mocks.granted.add('system.maintenance.view');
    mocks.granted.add('system.maintenance.manage');
    mocks.put.mockResolvedValue({ ...maintenanceOff, enabled: true, active: true });
    render(<SystemPage />, { wrapper: Providers });

    expect(await screen.findByTestId('maintenance-status')).toHaveTextContent('Выключены');
    await user.click(screen.getByRole('switch', { name: /Включены/ }));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Закрыть весь сайт для игроков?');
    expect(mocks.put).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Закрыть сайт' }));
    await waitFor(() =>
      expect(mocks.put).toHaveBeenCalledWith(
        '/admin/system/maintenance',
        expect.objectContaining({ enabled: true, scope: 'full', modules: [] }),
      ),
    );
  });

  it('validateMaintenance: частичные без модулей и неверный период', () => {
    const base = { ...maintenanceOff, enabled: true };
    expect(validateMaintenance(base)).toEqual({});
    expect(validateMaintenance({ ...base, scope: 'partial' }).modules).toBeDefined();
    expect(
      validateMaintenance({
        ...base,
        startsAt: '2030-01-02T00:00:00Z',
        estimatedEnd: '2030-01-01T00:00:00Z',
      }).period,
    ).toBeDefined();
    expect(validateMaintenance({ ...base, title: ' ' }).title).toBeDefined();
  });
});
