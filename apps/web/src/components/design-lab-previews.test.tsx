import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForgotPasswordForm } from '@/app/(auth)/forgot-password/forgot-form';
import { RegistrationSpotlight } from '@/components/auth/auth-layout';
import { ProfileHero } from '@/components/profile/profile-hero';
import { ConnectedAccountsSection, SocialLinksSection } from '@/components/profile/profile-links';
import { SeasonalPreviewFrame } from '@/components/seasonal/seasonal-preview-frame';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SEASONAL_CAMPAIGNS, resolveSeasonalView } from '@/lib/site/seasonal';
import { ThemeProvider } from '@/lib/theme/theme-provider';
import { installFetchMock, type FetchMock } from '@/test/http';

/// Компоненты, вынесенные из страниц для design-lab (общие с сайтом):
/// spotlight регистрации, «Забыли пароль?» в режиме превью, шапка профиля,
/// привязанные аккаунты и соцсети, рамка превью сезона.

vi.mock('next/navigation', () => ({
  usePathname: () => '/design-lab',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

let fetchMock: FetchMock;
beforeEach(() => {
  fetchMock = installFetchMock();
});

describe('RegistrationSpotlight', () => {
  it('неактивный — только кнопка, без затемнения и подсказки', () => {
    render(<RegistrationSpotlight active={false} onTutorial={vi.fn()} onDismiss={vi.fn()} />, {
      wrapper: Providers,
    });
    expect(screen.getByRole('button', { name: /как зарегистрироваться/i })).toBeInTheDocument();
    expect(screen.queryByTestId('auth-spotlight-dim')).toBeNull();
    expect(screen.queryByTestId('registration-spotlight')).toBeNull();
  });

  it('активный — затемнение и coachmark; «Мне понятно» и клик по фону закрывают', async () => {
    const onDismiss = vi.fn();
    const onTutorial = vi.fn();
    render(<RegistrationSpotlight active onTutorial={onTutorial} onDismiss={onDismiss} />, {
      wrapper: Providers,
    });
    const coach = await screen.findByTestId('registration-spotlight');
    await userEvent.click(within(coach).getByRole('button', { name: 'Мне понятно' }));
    expect(onDismiss).toHaveBeenCalled();
    onDismiss.mockClear();
    // Клик по фону — и затемнение, и «клик снаружи» Popover: закрытие идемпотентно.
    await userEvent.click(screen.getByTestId('auth-spotlight-dim'));
    expect(onDismiss).toHaveBeenCalled();
    await userEvent.click(within(coach).getByRole('button', { name: 'Как зарегистрироваться' }));
    expect(onTutorial).toHaveBeenCalledTimes(1);
  });
});

describe('ForgotPasswordForm preview', () => {
  it('«аккаунт найден»: маска от сервера, провайдеры недоступны, запросов нет', async () => {
    render(
      <ForgotPasswordForm
        preview={{
          mode: 'username',
          username: 'younaxo',
          lookup: { maskedEmail: 'y***o@i*****.com', providers: ['discord'] },
        }}
      />,
      { wrapper: Providers },
    );
    expect(screen.getByTestId('masked-email')).toHaveTextContent('y***o@i*****.com');
    const tile = screen.getByRole('button', { name: /сброс через discord/i });
    expect(tile).toHaveAttribute('aria-disabled');
    expect(tile).toHaveTextContent('Скоро');
    await userEvent.type(screen.getByRole('textbox', { name: /e-mail/i }), 'you@example.com');
    await userEvent.click(screen.getByRole('button', { name: /отправить ссылку/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('forgot-sent')).toBeNull();
  });
});

describe('ProfileHero', () => {
  it('свой профиль — круглая «Редактировать», оценки заблокированы', () => {
    render(
      <ProfileHero
        handle="younaxo"
        username="younaxo"
        avatar={null}
        banner={null}
        stats={{ views: 3, likes: 1, dislikes: 0, myReaction: null }}
        own
        signedIn
      />,
      { wrapper: Providers },
    );
    expect(screen.getByRole('link', { name: 'Редактировать профиль' })).toHaveAttribute(
      'href',
      '/settings',
    );
    expect(screen.getByRole('heading', { level: 1, name: 'younaxo' })).toBeInTheDocument();
  });

  it('чужой профиль без входа — без «Редактировать», просмотр не отправляется', () => {
    render(
      <ProfileHero
        titleAs="h3"
        handle="player"
        username="player"
        avatar={null}
        banner={null}
        stats={{ views: 3, likes: 1, dislikes: 0, myReaction: null }}
        own={false}
        signedIn={false}
      />,
      { wrapper: Providers },
    );
    expect(screen.queryByRole('link', { name: 'Редактировать профиль' })).toBeNull();
    expect(screen.getByRole('heading', { level: 3, name: 'player' })).toBeInTheDocument();
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(0);
  });
});

describe('Connected Accounts и Social Links', () => {
  it('пустые списки — секции не рисуются', () => {
    const { container } = render(
      <>
        <ConnectedAccountsSection accounts={[]} />
        <SocialLinksSection links={[{ platform: 'VK', value: '' }]} />
      </>,
      { wrapper: Providers },
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('https — внешняя ссылка с noopener; не-https — просто текст', () => {
    render(
      <SocialLinksSection
        links={[
          { platform: 'GITHUB', value: 'https://github.com/twomc' },
          { platform: 'VK', value: 'twomc_vk' },
        ]}
      />,
      { wrapper: Providers },
    );
    const link = screen.getByRole('link', { name: /github\.com\/twomc/ });
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.getByText('twomc_vk').closest('a')).toBeNull();
  });

  it('привязка без имени — «привязан», без внешних ID', () => {
    render(<ConnectedAccountsSection accounts={[{ provider: 'telegram', name: null }]} />, {
      wrapper: Providers,
    });
    expect(screen.getByRole('region', { name: 'Привязанные аккаунты' })).toHaveTextContent(
      'Telegram:привязан',
    );
  });
});

describe('SeasonalPreviewFrame', () => {
  const victory = SEASONAL_CAMPAIGNS.find((item) => item.id === 'victory-day')!;
  const base = {
    enabled: true,
    mode: 'forced' as const,
    forcedCampaignId: victory.id,
    showWordmarkO: true,
    showDecoration: true,
    showEffects: true,
    showBanners: true,
    effectIntensity: 2,
    fallingEffect: 'snow' as const,
    effectSpeed: 2,
    campaigns: {},
    serverTime: new Date().toISOString(),
  };

  it('сезон без эффекта и эффект без сезона — независимо', () => {
    const now = new Date();
    const { rerender } = render(
      <SeasonalPreviewFrame
        view={resolveSeasonalView({ ...base, fallingMode: 'off' }, now, { campaign: victory })}
      />,
      { wrapper: Providers },
    );
    expect(screen.getByTestId('seasonal-preview-effects')).toHaveTextContent(
      'Падающий эффект: нет.',
    );
    rerender(
      <SeasonalPreviewFrame
        view={resolveSeasonalView({ ...base, fallingMode: 'always' }, now, {
          campaign: victory,
          season: false,
        })}
      />,
    );
    expect(screen.getByTestId('seasonal-preview-decoration')).toHaveTextContent(
      'Оформление сезона: нет.',
    );
    expect(screen.getByTestId('seasonal-preview-effects')).toHaveTextContent('Снег');
  });

  it('День Победы по сезону — красные звёзды', () => {
    render(
      <SeasonalPreviewFrame
        view={resolveSeasonalView({ ...base, fallingMode: 'season' }, new Date(), {
          campaign: victory,
        })}
      />,
      { wrapper: Providers },
    );
    expect(screen.getByTestId('seasonal-preview-effects')).toHaveTextContent('Красные звёзды');
  });
});
