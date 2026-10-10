import type { PublicProfileSummary } from '@twomc/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { UserIdentity } from '@/components/ui/user-identity';
import { installFetchMock, jsonResponse, requestInfo, type FetchMock } from '@/test/http';
import { ProfilePreviewCard } from './profile-preview';

const summary: Extract<PublicProfileSummary, { hidden: false }> = {
  username: 'younaxo_',
  hidden: false,
  statusText: null,
  shortId: 1042,
  banner: null,
  decoration: null,
  badges: [],
  mediaBadges: [],
  tag: 'younaxo_#a1b2',
  discriminator: '0042',
  avatar: null,
  createdAt: '2025-03-01T10:00:00.000Z',
  system: false,
  banned: false,
  position: { displayName: 'Главный куратор проекта с очень длинным названием', color: '#f59e0b' },
  roles: [{ slug: 'chief-curator', displayName: 'Главный куратор', priority: 90, color: null }],
  online: true,
  currentServer: 'Выживание',
  lastActivityAt: null,
  statistics: { playTimeMinutes: 185, kills: 12, deaths: 4, killDeathRatio: 3 },
  statisticsHidden: false,
  friendsCount: 7,
  achievementsCompleted: 15,
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

const card = (props: Partial<Parameters<typeof ProfilePreviewCard>[0]>) =>
  render(
    <ProfilePreviewCard
      username="younaxo_"
      summary={summary}
      loading={false}
      error={false}
      {...props}
    />,
    { wrapper: Providers },
  );

let fetchMock: FetchMock;
beforeEach(() => {
  fetchMock = installFetchMock();
});

describe('ProfilePreviewCard', () => {
  it('реальные данные: ник, должность (обрезается), онлайн, статистика, счётчики', () => {
    card({});
    const root = screen.getByTestId('profile-preview');
    expect(within(root).getByTestId('user-identity')).toHaveTextContent(/^younaxo_#\d{4}$/);
    // Должность видна целиком (до двух строк), без нативного title.
    const position = within(root).getByTestId('profile-position');
    expect(position).toHaveTextContent(summary.position!.displayName);
    expect(position.className).toMatch(/line-clamp-2/);
    expect(root.querySelector('[title]')).toBeNull();
    expect(screen.getByText('В игре · Выживание')).toBeInTheDocument();
    expect(screen.getByText('3 ч 5 мин')).toBeInTheDocument();
    expect(screen.getByText('3.00')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('статистика скрыта или ещё нет — честная подпись, никаких нулей', () => {
    const { unmount } = card({ summary: { ...summary, statistics: null, statisticsHidden: true } });
    expect(screen.getByText('Игрок скрыл статистику.')).toBeInTheDocument();
    expect(screen.queryByText('K/D')).toBeNull();
    unmount();
    card({ summary: { ...summary, statistics: null, statisticsHidden: false } });
    expect(screen.getByText('Игровой статистики пока нет.')).toBeInTheDocument();
  });

  it('скрытый профиль, системный аккаунт, загрузка, ошибка', () => {
    const hidden = card({ summary: { username: 'secret', hidden: true } });
    expect(screen.getByTestId('profile-preview-hidden')).toHaveTextContent(
      'Профиль скрыт настройками приватности.',
    );
    hidden.unmount();
    const system = card({ summary: { ...summary, system: true } });
    expect(screen.getByText('Системный аккаунт twomc.su')).toBeInTheDocument();
    system.unmount();
    const loading = card({ summary: undefined, loading: true });
    expect(screen.getByTestId('profile-preview-loading')).toBeInTheDocument();
    loading.unmount();
    card({ summary: undefined, error: true });
    expect(screen.getByText(/Не удалось загрузить профиль/)).toBeInTheDocument();
  });
});

describe('UserIdentity', () => {
  it('префикс и ник — одна строка без переноса; длинный ник обрезается, без нативного title', () => {
    render(
      <UserIdentity
        username="very_long_name16"
        role={{ slug: 'chief-curator', displayName: 'Главный куратор', priority: 90 }}
      />,
      { wrapper: Providers },
    );
    const root = screen.getByTestId('user-identity');
    expect(root.className).toMatch(/flex-nowrap/);
    expect(within(root).getByText('very_long_name16').className).toMatch(/truncate/);
    expect(root.querySelector('[title]')).toBeNull();
  });

  it('previewable: ник — кнопка, превью загружает summary только при открытии', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (...args) => {
      const { path } = requestInfo(args);
      if (path.startsWith('/users/younaxo_/summary')) return jsonResponse(summary);
      return new Response(null, { status: 404 });
    });
    render(<UserIdentity username="younaxo_" previewable />, { wrapper: Providers });
    expect(fetchMock).not.toHaveBeenCalled();
    await user.hover(screen.getByRole('button', { name: 'Профиль younaxo_' }));
    expect(await screen.findByTestId('profile-preview')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes('/users/younaxo_/summary')),
    ).toBe(true);
  });
});
