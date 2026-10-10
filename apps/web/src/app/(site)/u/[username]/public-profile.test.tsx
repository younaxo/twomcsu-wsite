import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import PublicProfilePage from './page';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), username: 'Steve' }));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post, put: mocks.put },
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ username: mocks.username }),
  usePathname: () => `/u/${mocks.username}`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const STATS = { views: 3, likes: 2, dislikes: 1, myReaction: null };

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset().mockResolvedValue(STATS);
  mocks.put.mockReset();
  mocks.username = 'Steve';
  useAuthStore.setState({ status: 'anonymous', user: null });
});

describe('Публичный профиль /u/[username]', () => {
  it('«О себе» — только bio (Markdown), метаданные — в «Информации», дата регистрации один раз', async () => {
    mocks.get.mockImplementation(async (path: string) => {
      if (path.endsWith('/public')) {
        return {
          id: 'u1',
          username: 'Steve',
          bio: '**Строю** спавн\n\n- редстоун\n- *фермы*\n\n<script>alert(1)</script>',
          city: 'Москва',
          country: 'Россия',
          gender: 'MALE',
          birthday: { day: 20, month: 5, year: null },
          createdAt: '2026-10-09T10:00:00.000Z',
        };
      }
      if (path.endsWith('/showcase'))
        return { awards: [], achievements: [], achievementsCompleted: 0 };
      return { username: 'Steve', hidden: false, roles: [], createdAt: '2026-10-09T10:00:00.000Z' };
    });
    render(<PublicProfilePage />, { wrapper: Providers });
    const about = await screen.findByTestId('profile-about');
    expect(within(about).getByText('Строю').tagName).toBe('STRONG');
    expect(about.querySelectorAll('li')).toHaveLength(2);
    expect(about.querySelector('script')).toBeNull();
    expect(about).not.toHaveTextContent('Москва');
    expect(about).not.toHaveTextContent('На twomc.su с');

    const info = screen.getByTestId('profile-info');
    expect(info).toHaveTextContent('Москва, Россия');
    expect(info).toHaveTextContent('20 мая');
    expect(info).not.toHaveTextContent('2001');
    expect(info).toHaveTextContent('Мужской');
    // Пол — SVG-иконка lucide, не emoji.
    expect(info.querySelector('svg.lucide-mars')).not.toBeNull();
    expect(screen.getAllByText(/На twomc\.su с|На сайте с/)).toHaveLength(1);
  });

  it('день рождения скрыт владельцем — в «Информации» его нет', async () => {
    mocks.get.mockImplementation(async (path: string) =>
      path.endsWith('/public')
        ? { id: 'u1', username: 'Steve', createdAt: '2026-10-09T10:00:00.000Z' }
        : path.endsWith('/showcase')
          ? { awards: [], achievements: [], achievementsCompleted: 0 }
          : { username: 'Steve', hidden: false, roles: [] },
    );
    render(<PublicProfilePage />, { wrapper: Providers });
    const info = await screen.findByTestId('profile-info');
    expect(info.querySelector('svg.lucide-cake')).toBeNull();
    expect(info).toHaveTextContent('На twomc.su с');
  });

  it('«Награды и значки»: нет наград — честный пустой блок; есть — плитки с подсказками', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    let showcase: unknown = { awards: [], achievements: [], achievementsCompleted: 0 };
    mocks.get.mockImplementation(async (path: string) =>
      path.endsWith('/public')
        ? { id: 'u1', username: 'Steve' }
        : path.endsWith('/showcase')
          ? showcase
          : { username: 'Steve', hidden: false, roles: [], badges: [], mediaBadges: [] },
    );
    const first = render(<PublicProfilePage />, { wrapper: Providers });
    expect(await screen.findByTestId('profile-showcase-empty')).toHaveTextContent(
      'Пока нет наград и значков',
    );
    first.unmount();

    showcase = {
      awards: [
        {
          slug: 'event-1',
          name: 'Первый ивент',
          description: 'Участник открытия',
          iconUrl: '/awards/first.png',
          color: null,
          rarity: 'rare',
          grantedAt: '2026-10-09T10:00:00.000Z',
        },
      ],
      achievements: [
        {
          slug: 'builder',
          name: 'Строитель',
          description: 'Построить дом',
          iconUrl: 'https://cdn.example/builder.png',
          category: 'GAME',
          rarity: 'EPIC',
          completedAt: '2026-10-09T10:00:00.000Z',
        },
      ],
      achievementsCompleted: 3,
    };
    render(<PublicProfilePage />, { wrapper: Providers });
    const section = await screen.findByTestId('profile-showcase');
    const award = await within(section).findByTestId('showcase-award');
    expect(award).toHaveAttribute('data-rarity', 'rare');
    expect(award).toHaveTextContent('Первый ивент');
    expect(within(section).getByTestId('showcase-achievement')).toHaveAttribute(
      'data-rarity',
      'epic',
    );
    await user.hover(award);
    expect((await screen.findAllByText('Участник открытия')).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('profile-showcase-empty')).toBeNull();
  });

  it('показывает только отданные сервером поля; ссылки соцсетей — только https', async () => {
    mocks.get.mockImplementation(async (path: string) =>
      path.endsWith('/public')
        ? {
            id: 'u1',
            username: 'Steve',
            statusText: 'Строю замок',
            bio: 'Люблю редстоун',
            city: 'Москва',
            createdAt: '2025-01-01T00:00:00.000Z',
            socialLinks: [
              { platform: 'YOUTUBE', value: 'https://youtube.com/@steve' },
              { platform: 'TELEGRAM', value: '@steve' },
            ],
          }
        : { username: 'Steve', hidden: false, roles: [] },
    );
    render(<PublicProfilePage />, { wrapper: Providers });
    const page = await screen.findByTestId('public-profile');
    expect(page).toHaveTextContent('Строю замок');
    expect(page).toHaveTextContent('Люблю редстоун');
    expect(page).toHaveTextContent('Москва');
    expect(screen.getByRole('link', { name: 'https://youtube.com/@steve' })).toHaveAttribute(
      'rel',
      'noopener noreferrer nofollow',
    );
    expect(screen.queryByRole('link', { name: '@steve' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Редактировать профиль' })).toBeNull();
  });

  it('несуществующий ник (404) — «Профиль не найден»', async () => {
    mocks.get.mockRejectedValue(new ApiError(404, ['Профиль не найден']));
    render(<PublicProfilePage />, { wrapper: Providers });
    expect(await screen.findByText('Профиль не найден')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-hidden')).toBeNull();
  });

  it('скрытый профиль (200 hidden) — отдельное состояние, без данных и действий', async () => {
    mocks.get.mockImplementation(async (path: string) =>
      path.endsWith('/public')
        ? { username: 'Steve', hidden: true }
        : path === '/site/settings'
          ? { modules: { reports: true } }
          : { username: 'Steve', hidden: true },
    );
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: 'viewer', username: 'alex' } as never,
    });
    render(<PublicProfilePage />, { wrapper: Providers });
    expect(await screen.findByTestId('profile-hidden')).toHaveTextContent('Профиль Steve скрыт');
    expect(screen.queryByTestId('public-profile')).toBeNull();
    expect(screen.queryByTestId('profile-report')).toBeNull();
  });

  it('«В друзья» (срез 2.1): вошедшему на чужом профиле при модуле «Друзья»; себе и гостю — нет', async () => {
    const answer = (friends: boolean) => async (path: string) =>
      path.endsWith('/public')
        ? { id: 'u1', username: 'Steve', hidden: false }
        : path === '/site/settings'
          ? { modules: { reports: false, friends } }
          : path.startsWith('/friends/relation/')
            ? { userId: 'u1', status: 'NONE', requestId: null }
            : path.endsWith('/showcase')
              ? { awards: [], achievements: [], achievementsCompleted: 0 }
              : { username: 'Steve', hidden: false, roles: [] };
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: 'viewer', username: 'alex' } as never,
    });
    mocks.get.mockImplementation(answer(true));
    const stranger = render(<PublicProfilePage />, { wrapper: Providers });
    const actions = await screen.findByTestId('profile-actions');
    expect(await within(actions).findByRole('button', { name: 'В друзья' })).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith('/friends/relation/Steve', expect.anything());
    stranger.unmount();

    mocks.get.mockImplementation(answer(false));
    const disabled = render(<PublicProfilePage />, { wrapper: Providers });
    await screen.findByTestId('public-profile');
    await waitFor(() =>
      expect(mocks.get).toHaveBeenCalledWith('/site/settings', expect.anything()),
    );
    // Модуль «Друзья» выключен — «Написать» остаётся (срез 2.4), «В друзья» нет.
    const withoutFriends = await screen.findByTestId('profile-actions');
    expect(within(withoutFriends).getByRole('button', { name: 'Написать' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'В друзья' })).toBeNull();
    disabled.unmount();

    useAuthStore.setState({ status: 'anonymous', user: null });
    mocks.get.mockImplementation(answer(true));
    render(<PublicProfilePage />, { wrapper: Providers });
    await screen.findByTestId('public-profile');
    expect(screen.queryByTestId('profile-actions')).toBeNull();
  });

  describe('«Пожаловаться» (срез 1.3)', () => {
    const answer = (reports: boolean) => async (path: string) =>
      path.endsWith('/public')
        ? { id: 'u1', username: 'Steve', hidden: false }
        : path === '/site/settings'
          ? { modules: { reports } }
          : path.endsWith('/showcase')
            ? { awards: [], achievements: [], achievementsCompleted: 0 }
            : { username: 'Steve', hidden: false, roles: [] };

    it('вошедшему на чужом профиле — окно с причиной; без причины не отправляется', async () => {
      const user = (await import('@testing-library/user-event')).default.setup();
      useAuthStore.setState({
        status: 'authenticated',
        user: { id: 'viewer', username: 'alex' } as never,
      });
      mocks.get.mockImplementation(answer(true));
      mocks.post.mockImplementation(async (path: string) =>
        path.endsWith('/report') ? { success: true } : STATS,
      );
      render(<PublicProfilePage />, { wrapper: Providers });
      const button = await screen.findByRole('button', { name: 'Пожаловаться' });
      expect(button.className).toMatch(/left-3/);
      expect(screen.queryByRole('link', { name: 'Редактировать профиль' })).toBeNull();
      await user.click(button);
      const dialog = await screen.findByTestId('profile-report-dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Отправить жалобу' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Выберите причину');
      expect(mocks.post).not.toHaveBeenCalledWith('/users/Steve/report', expect.anything());

      // «Другое» требует описания.
      await user.click(within(dialog).getByRole('radio', { name: /Другое/ }));
      await user.click(within(dialog).getByRole('button', { name: 'Отправить жалобу' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Опишите проблему');

      await user.click(within(dialog).getByRole('radio', { name: /Спам или реклама/ }));
      await user.type(within(dialog).getByRole('textbox'), '  реклама в статусе  ');
      await user.click(within(dialog).getByRole('button', { name: 'Отправить жалобу' }));
      await waitFor(() =>
        expect(mocks.post).toHaveBeenCalledWith('/users/Steve/report', {
          reason: 'SPAM',
          description: 'реклама в статусе',
        }),
      );
      await waitFor(() => expect(screen.queryByTestId('profile-report-dialog')).toBeNull());
    });

    it('гостю, владельцу и при выключенном модуле жалоб — кнопки нет', async () => {
      mocks.get.mockImplementation(answer(true));
      const guest = render(<PublicProfilePage />, { wrapper: Providers });
      await screen.findByTestId('public-profile');
      expect(screen.queryByTestId('profile-report')).toBeNull();
      guest.unmount();

      useAuthStore.setState({
        status: 'authenticated',
        user: { id: 'u1', username: 'steve' } as never,
      });
      const owner = render(<PublicProfilePage />, { wrapper: Providers });
      await screen.findByRole('link', { name: 'Редактировать профиль' });
      expect(screen.queryByTestId('profile-report')).toBeNull();
      owner.unmount();

      useAuthStore.setState({
        status: 'authenticated',
        user: { id: 'viewer', username: 'alex' } as never,
      });
      mocks.get.mockImplementation(answer(false));
      render(<PublicProfilePage />, { wrapper: Providers });
      await screen.findByTestId('public-profile');
      await waitFor(() =>
        expect(mocks.get).toHaveBeenCalledWith('/site/settings', expect.anything()),
      );
      expect(screen.queryByTestId('profile-report')).toBeNull();
    });
  });

  it('свой профиль — кнопка «Редактировать профиль»', async () => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: 'u1', username: 'steve' } as never,
    });
    mocks.get.mockImplementation(async (path: string) =>
      path.endsWith('/public') ? { id: 'u1', username: 'Steve' } : { username: 'Steve', roles: [] },
    );
    render(<PublicProfilePage />, { wrapper: Providers });
    expect(await screen.findByRole('link', { name: 'Редактировать профиль' })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('B5: просмотр — один раз и не владельцем; лайк; привязанные аккаунты без ID; 3D-голова при скине', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: 'viewer', username: 'alex' } as never,
    });
    mocks.username = 'younaxo';
    mocks.get.mockImplementation(async (path: string) => {
      if (path.endsWith('/public')) {
        return {
          id: 'u1',
          username: 'younaxo_',
          stats: STATS,
          connectedAccounts: [
            { provider: 'discord', name: 'steve_discord', url: null },
            { provider: 'telegram', name: 'steve_tg', url: 'https://t.me/steve_tg' },
          ],
          socialLinks: [{ platform: 'GITHUB', value: 'https://github.com/steve' }],
        };
      }
      if (path.endsWith('/skin')) {
        return { available: true, model: 'classic', cape: false, version: 'v1' };
      }
      return { username: 'younaxo_', hidden: false, roles: [] };
    });
    mocks.put.mockResolvedValue({ ...STATS, likes: 3, myReaction: 'LIKE' });
    render(<PublicProfilePage />, { wrapper: Providers });
    // Метрики — один контейнер в правом верхнем углу баннера.
    const metrics = await screen.findByTestId('profile-metrics');
    expect(metrics).toHaveAttribute('role', 'group');
    expect(metrics.className).toMatch(/right-3/);
    expect(metrics.className).toMatch(/top-3/);
    expect(within(metrics).getByLabelText('Просмотров: 3')).toBeInTheDocument();
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post).toHaveBeenCalledWith('/users/younaxo/view');
    await user.click(screen.getByRole('button', { name: 'Нравится: 2' }));
    expect(mocks.put).toHaveBeenCalledWith('/users/younaxo/reaction', { type: 'LIKE' });
    expect(await screen.findByRole('button', { name: 'Нравится: 3' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const connected = screen.getByRole('region', { name: 'Привязанные аккаунты' });
    expect(connected).toHaveTextContent('Discord:steve_discord');
    // Telegram — ссылка из привязки; Discord — без выдуманного URL, только «Скопировать».
    expect(within(connected).getByRole('link', { name: /steve_tg/ })).toHaveAttribute(
      'href',
      'https://t.me/steve_tg',
    );
    expect(within(connected).queryByRole('link', { name: /steve_discord/ })).toBeNull();
    expect(
      within(connected).getByRole('button', { name: 'Скопировать имя Discord' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /github\.com\/steve/ })).toBeInTheDocument();
    expect(await screen.findByTestId('minecraft-head')).toBeInTheDocument();
  });

  it('B5: свой профиль — круглая кнопка редактирования, просмотр не отправляется, оценить нельзя', async () => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: 'u1', username: 'steve' } as never,
    });
    mocks.get.mockImplementation(async (path: string) =>
      path.endsWith('/public')
        ? { id: 'u1', username: 'Steve', stats: STATS }
        : path.endsWith('/skin')
          ? { available: false, model: null, cape: false, version: null }
          : { username: 'Steve', roles: [] },
    );
    const user = (await import('@testing-library/user-event')).default.setup();
    render(<PublicProfilePage />, { wrapper: Providers });
    // Свой профиль: оценки недоступны — not-allowed и наш Tooltip, запрос не уходит.
    const metrics = await screen.findByTestId('profile-metrics');
    const like = within(metrics).getByRole('button', { name: 'Нравится: 2' });
    expect(like).toHaveAttribute('aria-disabled', 'true');
    expect(like.className).toMatch(/cursor-not-allowed/);
    expect(like).not.toHaveAttribute('title');
    await user.click(like);
    expect(mocks.put).not.toHaveBeenCalled();
    await user.hover(like);
    expect(
      (await screen.findAllByText('Нельзя оценить собственный профиль')).length,
    ).toBeGreaterThan(0);
    // «Редактировать» — круглая, в левом верхнем углу баннера.
    const edit = screen.getByRole('link', { name: 'Редактировать профиль' });
    expect(edit.className).toMatch(/rounded-full/);
    expect(edit.className).toMatch(/left-3/);
    expect(edit.className).not.toMatch(/right-3/);
    expect(mocks.post).not.toHaveBeenCalled();
    expect(screen.queryByTestId('minecraft-head')).toBeNull();
  });
});
