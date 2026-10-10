import type { MeResponse, PublicProfileSummary } from '@twomc/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuthStore } from '@/lib/auth/store';
import { installFetchMock, jsonResponse, requestInfo, type FetchMock } from '@/test/http';
import { ProfileMenu } from './profile-menu';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const AVATAR = 'http://localhost:4000/uploads/users/u1/avatar/a.avif';
const BANNER = 'http://localhost:4000/uploads/users/u1/banner/b.avif';

function me(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    id: 'u1',
    shortId: 42,
    tag: 'steve',
    email: 's@example.com',
    username: 'Steve_With_A_Very_Long_Nick',
    avatar: AVATAR,
    banner: BANNER,
    accountType: 'DEFAULT',
    accessLevel: 0,
    mustChangePassword: false,
    roles: [],
    permissions: { superuser: false, permissions: [], maxPriority: null },
    ...overrides,
  };
}

const summary: PublicProfileSummary = {
  username: 'Steve_With_A_Very_Long_Nick',
  hidden: false,
  statusText: 'Делаю twomc.su',
  shortId: 42,
  tag: 'steve',
  avatar: AVATAR,
  banner: BANNER,
  decoration: { slug: 'aurora', name: 'Аврора', imageUrl: null },
  badges: ['VERIFIED', 'PROJECT_TEAM'],
  mediaBadges: ['YOUTUBE'],
  createdAt: '2025-01-01T00:00:00.000Z',
  system: false,
  banned: false,
  position: null,
  roles: [],
  online: true,
  currentServer: 'Выживание',
  lastActivityAt: null,
  statistics: { playTimeMinutes: 125, kills: 3, deaths: 1, killDeathRatio: 3 },
  statisticsHidden: false,
  friendsCount: 12,
  achievementsCompleted: 5,
};

const WALLET = {
  balances: [
    { currency: 'RUB', amountMinor: '125050', scale: 2 },
    { currency: 'RUBY', amountMinor: '1500', scale: 0 },
  ],
};

const CHIEF_CURATOR = {
  id: 'r1',
  name: 'chief-curator',
  slug: 'chief-curator',
  displayName: 'Главный куратор',
  color: null,
  priority: 90,
  isSuperuser: false,
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

let fetchMock: FetchMock;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  fetchMock = installFetchMock();
  fetchMock.mockImplementation(async (...args) => {
    const { path } = requestInfo(args);
    if (path.includes('/summary')) return jsonResponse(summary);
    if (path.endsWith('/wallet')) return jsonResponse(WALLET);
    return new Response(null, { status: 404 });
  });
  useAuthStore.setState({ status: 'authenticated', user: me() });
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe('Mini profile в header (ADR-0088)', () => {
  it('кнопка — реальный аватар пользователя, а не инициалы (фото — без pixelated)', async () => {
    // jsdom не загружает картинки: Radix Avatar ждёт onload — имитируем.
    const OriginalImage = window.Image;
    class LoadedImage {
      onload: ((event: { currentTarget: unknown }) => void) | null = null;
      complete = true;
      naturalWidth = 512;
      addEventListener(type: string, handler: (event: { currentTarget: unknown }) => void) {
        if (type === 'load') setTimeout(() => handler({ currentTarget: this }), 0);
      }
      removeEventListener() {}
      set src(_value: string) {
        setTimeout(() => this.onload?.({ currentTarget: this }), 0);
      }
    }
    window.Image = LoadedImage as unknown as typeof Image;
    try {
      render(<ProfileMenu />, { wrapper: Providers });
      const trigger = screen.getByRole('button', { name: /^Профиль: / });
      await waitFor(() => expect(trigger.querySelector('img')).toHaveAttribute('src', AVATAR));
      expect(trigger.querySelector('img')!.className).not.toMatch(/pixelated/);
    } finally {
      window.Image = OriginalImage;
    }
  });

  it('шапка: баннер, ник, ID, бейджи, украшение, присутствие; затем статистика и меню', async () => {
    const user = userEvent.setup();
    render(<ProfileMenu />, { wrapper: Providers });
    await user.click(screen.getByRole('button', { name: /^Профиль: / }));
    const menu = await screen.findByRole('menu');
    const banner = within(menu).getByTestId('profile-banner');
    expect(banner).toHaveAttribute('data-state', 'image');
    expect(banner.querySelector('img')).toHaveAttribute('src', BANNER);
    expect(menu).toHaveTextContent('Steve_With_A_Very_Long_Nick');
    expect(menu).toHaveTextContent('ID 42');
    await waitFor(() => expect(within(menu).getByTestId('profile-badges')).toBeInTheDocument());
    const badges = within(menu).getByTestId('profile-badges');
    expect(within(badges).getByLabelText('Подтверждённый игрок')).toBeInTheDocument();
    expect(within(badges).getByLabelText('Создатель контента · YouTube')).toBeInTheDocument();
    expect(within(badges).getByLabelText('Украшение: Аврора')).toBeInTheDocument();
    expect(menu).toHaveTextContent('В игре · Выживание');
    // Статус — тот же, что в публичном профиле (summary), с полным текстом в title.
    expect(within(menu).getByTestId('profile-status')).toHaveAttribute('title', 'Делаю twomc.su');
    // Вместо «Друзья / Достижения» — реальный кошелёк из /wallet.
    const wallet = within(menu).getByLabelText('Кошелёк');
    await waitFor(() =>
      expect(within(wallet).getByTestId('wallet-rub')).toHaveTextContent(/1\s250,50\s₽/),
    );
    expect(within(wallet).getByTestId('wallet-ruby')).toHaveTextContent(/1\s500/);
    expect(menu).not.toHaveTextContent('Друзья12');
    expect(within(menu).queryByTestId('mini-profile-admin')).toBeNull();

    const items = within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.textContent);
    expect(items).toEqual([
      'Мой профиль',
      'Настройки',
      'Сообщенияскоро',
      'Друзьяскоро',
      'Избранноескоро',
      'Заказыскоро',
      'Выйти',
    ]);
    expect(within(menu).getByRole('menuitem', { name: 'Мой профиль' })).toHaveAttribute(
      'href',
      '/u/Steve_With_A_Very_Long_Nick',
    );
    expect(within(menu).getByRole('menuitem', { name: /Сообщения/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('админ-панель — отдельный блок только при effective permission, «Выйти» — последним', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({
      status: 'authenticated',
      user: me({ permissions: { superuser: true, permissions: [], maxPriority: 900 } }),
    });
    render(<ProfileMenu />, { wrapper: Providers });
    await user.click(screen.getByRole('button', { name: /^Профиль: / }));
    const menu = await screen.findByRole('menu');
    const block = within(menu).getByTestId('mini-profile-admin');
    const admin = within(block).getByRole('menuitem', { name: /Админ-панель/ });
    expect(admin).toHaveAttribute('href', '/admin');
    expect(admin).toHaveTextContent('Администрирование twomc.su');
    // Красный admin-акцент, но не стиль «опасного действия».
    expect(admin.className).not.toMatch(/destructive/);
    expect(block.querySelector('.text-admin')).not.toBeNull();
    const items = within(menu).getAllByRole('menuitem');
    expect(items.at(-1)).toHaveTextContent('Выйти');
    expect(items.at(-2)).toBe(admin);
    expect(items.slice(0, -2).some((item) => /Админ/.test(item.textContent ?? ''))).toBe(false);
  });

  it('префикс роли — маленький (×2 от исходника 7 px), без растяжения', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ status: 'authenticated', user: me({ roles: [CHIEF_CURATOR] }) });
    fetchMock.mockImplementation(async (...args) => {
      const { path } = requestInfo(args);
      if (path.endsWith('/wallet')) return jsonResponse(WALLET);
      return jsonResponse({ ...summary, roles: [CHIEF_CURATOR] });
    });
    render(<ProfileMenu />, { wrapper: Providers });
    await user.click(screen.getByRole('button', { name: /^Профиль: / }));
    const menu = await screen.findByRole('menu');
    const prefix = await waitFor(() => {
      const img = menu.querySelector('img[height="14"]');
      expect(img).not.toBeNull();
      return img!;
    });
    expect(prefix.getAttribute('style')).toMatch(/width: auto/);
    expect(menu.querySelector('img[height="21"]')).toBeNull();
  });

  it('кошелёк недоступен — «—», а не выдуманный ноль', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (...args) => {
      const { path } = requestInfo(args);
      if (path.includes('/summary')) return jsonResponse(summary);
      return new Response(null, { status: 503 });
    });
    render(<ProfileMenu />, { wrapper: Providers });
    await user.click(screen.getByRole('button', { name: /^Профиль: / }));
    const wallet = within(await screen.findByRole('menu')).getByLabelText('Кошелёк');
    await waitFor(() => expect(within(wallet).getByTestId('wallet-rub')).toHaveTextContent('—'));
    expect(within(wallet).getByTestId('wallet-ruby')).toHaveTextContent('—');
  });

  it('нет баннера — нейтральная поверхность, без выдуманной картинки', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ status: 'authenticated', user: me({ banner: null }) });
    fetchMock.mockImplementation(async () => jsonResponse({ ...summary, banner: null }));
    render(<ProfileMenu />, { wrapper: Providers });
    await user.click(screen.getByRole('button', { name: /^Профиль: / }));
    const banner = within(await screen.findByRole('menu')).getByTestId('profile-banner');
    expect(banner).toHaveAttribute('data-state', 'empty');
    expect(banner.querySelector('img')).toBeNull();
  });

  it('mobile — bottom sheet с тем же содержимым и тем же источником данных', async () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('max-width: 767px'),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    const user = userEvent.setup();
    render(<ProfileMenu />, { wrapper: Providers });
    await user.click(screen.getByRole('button', { name: /^Профиль: / }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByTestId('mini-profile')).toBeInTheDocument();
    const nav = within(sheet).getByRole('navigation', { name: 'Разделы аккаунта' });
    expect(within(nav).getByRole('link', { name: 'Мой профиль' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: /Друзья/ })).toBeDisabled();
    expect(within(sheet).getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
    // Те же данные, что в popover: кошелёк из /wallet, обычному игроку — без админ-блока.
    await waitFor(() =>
      expect(within(sheet).getByTestId('wallet-rub')).toHaveTextContent(/1\s250,50\s₽/),
    );
    expect(within(sheet).queryByTestId('mini-profile-admin')).toBeNull();
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]).includes('/summary')),
    ).toHaveLength(1);
  });
});
