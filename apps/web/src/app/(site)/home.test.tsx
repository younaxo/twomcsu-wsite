import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { installFetchMock, jsonResponse, requestInfo, type FetchMock } from '@/test/http';
import { splitEvents } from './_components/home-hooks';
import { formatCountdown } from './_components/events-section';
import { collectVersions } from './_components/hero';
import HomePage from './page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

function route(fetchMock: FetchMock, handlers: Record<string, unknown>) {
  fetchMock.mockImplementation(async (...args) => {
    const { path } = requestInfo(args);
    const key = Object.keys(handlers)
      .sort((a, b) => b.length - a.length)
      .find((prefix) => path.startsWith(prefix));
    return key === undefined ? new Response(null, { status: 404 }) : jsonResponse(handlers[key]);
  });
}

const server = {
  id: 's1',
  slug: 'anarchy',
  name: 'Anarchy',
  online: true,
  playerCount: 128,
  maxPlayers: 500,
  version: '1.21.1',
  configuredVersion: null,
  motd: null,
  type: 'anarchy',
  description: 'Без приватов и правил на выживание.',
  iconUrl: null,
  address: 'play.twomc.su',
};

let fetchMock: FetchMock;

beforeEach(() => {
  fetchMock = installFetchMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HomePage', () => {
  it('порядок секций: hero → возможности → сервера → события → магазин → новости → старт → сообщество → CTA', async () => {
    route(fetchMock, {
      '/servers/overview': {
        totalServers: 1,
        onlineServers: 1,
        totalPlayers: 128,
        servers: [server],
      },
      '/events/featured': [],
      '/events': { items: [], total: 0, page: 1, limit: 6 },
      '/store/products': { items: [], total: 0, page: 1, limit: 12 },
      '/news/latest': [],
      '/store/recent-purchases': [
        {
          productName: 'TITAN',
          image: null,
          quantity: 1,
          nickname: 'yo***o_',
          avatar: null,
          purchasedAt: null,
        },
      ],
      '/site/settings': {
        siteName: 'twomc.su',
        siteDescription: null,
        siteLogo: null,
        contactEmail: null,
        socials: { discord: null, vk: null, telegram: 'https://t.me/x', youtube: null },
        registrationEnabled: true,
        modules: {
          chat: true,
          friends: true,
          store: true,
          comments: true,
          news: true,
          reports: true,
        },
        meta: { title: null, description: null, keywords: [] },
        updatedAt: '2026-10-09T00:00:00.000Z',
      },
    });
    render(<HomePage />, { wrapper: Providers });
    const ids = [...document.querySelectorAll('section[id]')].map((el) => el.id);
    expect(ids).toEqual([
      'hero',
      'showcase',
      'servers',
      'shop',
      'events',
      'news',
      'quick-start',
      'community',
      'cta',
    ]);
    // Версии владельца — один раз, в hero.
    expect(screen.getAllByText('1.21.4 — 1.21.11')).toHaveLength(1);
    // Промокод START с кнопкой копирования.
    expect(screen.getByTestId('promo-code')).toHaveTextContent('START');
    expect(screen.getByRole('button', { name: 'Скопировать промокод START' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('twomc.su');
    expect(screen.queryByText(/New-Era Anarchy/)).toBeNull();
    expect(screen.getAllByText('play.twomc.su').length).toBeGreaterThan(0);

    // Живые данные: онлайн, один сервер — одна большая карточка, версия из ping.
    await waitFor(() => expect(screen.getByTestId('hero-online')).toHaveTextContent('128'));
    const cards = await screen.findAllByTestId('home-server-card');
    expect(cards).toHaveLength(1);
    expect(within(cards[0]).getByText('Anarchy')).toBeInTheDocument();
    expect(screen.getAllByText('1.21.1').length).toBeGreaterThanOrEqual(1); // карточка сервера (hero — версии владельца)

    // Недавние покупки — над магазином, ник замаскирован backend-ом.
    const purchases = await screen.findByTestId('recent-purchases');
    expect(within(purchases).getAllByText('yo***o_')[0]).toBeInTheDocument();
    expect(within(purchases).getAllByText('TITAN')[0]).toBeInTheDocument();
    expect(
      purchases.compareDocumentPosition(screen.getByTestId('home-shop-grid')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Честные empty state вместо выдуманных событий/товаров/новостей.
    expect(await screen.findByText('Пока ничего не запланировано')).toBeInTheDocument();
    expect(await screen.findByText('Каталог наполняется')).toBeInTheDocument();
    expect(await screen.findByText('Публикаций пока нет')).toBeInTheDocument();
    expect(screen.queryByTestId('home-product-card')).toBeNull();
    expect(screen.queryByTestId('event-next')).toBeNull();

    // Showcase: 1 крупная + 3 дополнительных, не 8 одинаковых.
    expect(screen.getByTestId('feature-casino').className).toMatch(/md:col-span-2/);
    expect(document.querySelectorAll('[data-testid^="feature-"]')).toHaveLength(4);

    // Сообщество — из единого socialLinks.
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Telegram/ })).toHaveAttribute(
        'href',
        'https://t.me/x',
      ),
    );
  });

  it('события: активное и следующее с временем до начала; версии без дублей', () => {
    const now = new Date('2026-10-09T12:00:00Z');
    const events = [
      {
        id: 'e1',
        slug: 'live',
        title: 'Live',
        description: '',
        coverImage: null,
        category: 'PVP',
        status: 'PUBLISHED' as const,
        startsAt: '2026-10-09T11:00:00Z',
        endsAt: '2026-10-09T13:00:00Z',
        isAllDay: false,
        location: null,
        server: null,
        isFeatured: true,
      },
      {
        id: 'e2',
        slug: 'next',
        title: 'Next',
        description: '',
        coverImage: null,
        category: 'PVP',
        status: 'PUBLISHED' as const,
        startsAt: '2026-10-10T14:30:00Z',
        endsAt: null,
        isAllDay: false,
        location: null,
        server: null,
        isFeatured: false,
      },
    ];
    const split = splitEvents(events, now);
    expect(split.active?.id).toBe('e1');
    expect(split.next?.id).toBe('e2');
    expect(formatCountdown('2026-10-10T14:30:00Z', now)).toBe('через 1 день 2 ч');
    expect(formatCountdown('2026-10-09T12:45:00Z', now)).toBe('через 45 минут');
    expect(formatCountdown('2026-10-09T11:00:00Z', now)).toBe('уже началось');
    expect(
      collectVersions([
        { version: '1.21.1' },
        { version: '1.21.1', configuredVersion: null },
        { configuredVersion: '1.20.4', version: 'Paper 1.20.4' },
      ]),
    ).toEqual(['1.21.1', '1.20.4']);
  });
});
