import type { MeResponse } from '@twomc/shared';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/lib/auth/store';
import { SITE_LOGO_URL } from '@/lib/site/config';
import { formatAdminBaseTitle, formatDocumentTitle } from '@/lib/site/document-badge';
import { resolveSeasonalCampaign, SEASONAL_CAMPAIGNS } from '@/lib/site/seasonal';
import { BrandWordmark } from './brand-wordmark';
import { DocumentBadge } from './document-badge';
import { SiteLogo } from './site-logo';

const unread = { count: 0 };

vi.mock('next/navigation', () => ({ usePathname: () => '/admin' }));
// Реальное время (WS) в этих тестах не нужно — только title/favicon.
vi.mock('@/lib/notifications/hooks', () => ({ useNotificationsRealtime: () => undefined }));
vi.mock('@/lib/site/hooks', () => ({
  useUnreadCount: () => ({ data: { count: unread.count } }),
  // Без серверных настроек сезонов — fallback на реестр по дате (ADR-0079).
  usePublicSiteSettings: () => ({ isPending: false, data: undefined }),
}));

function staff(accessLevel: number, priority: number): MeResponse {
  return {
    id: 'u2',
    shortId: 2,
    tag: 'younaxo_#0002',
    email: 'younaxo@icloud.com',
    username: 'younaxo_',
    accessLevel,
    accountType: 'DEFAULT',
    mustChangePassword: false,
    roles: [
      {
        id: 'r',
        name: 'Chief Curator',
        slug: 'chief-curator',
        displayName: 'Chief Curator',
        color: null,
        priority,
        isSuperuser: true,
      },
    ],
    permissions: { superuser: true, permissions: [], maxPriority: priority },
  };
}

describe('Title вкладки', () => {
  it('сайт: twomc.su / (3) twomc.su / (99+) twomc.su', () => {
    expect(formatDocumentTitle(0)).toBe('twomc.su');
    expect(formatDocumentTitle(3)).toBe('(3) twomc.su');
    expect(formatDocumentTitle(250)).toBe('(99+) twomc.su');
  });

  it('админка: twomc.su | A [4], с unread и максимумом 99+', () => {
    const base = formatAdminBaseTitle(4);
    expect(formatDocumentTitle(0, base)).toBe('twomc.su | A [4]');
    expect(formatDocumentTitle(3, base)).toBe('(3) twomc.su | A [4]');
    expect(formatDocumentTitle(1000, base)).toBe('(99+) twomc.su | A [4]');
    expect(formatAdminBaseTitle(undefined)).toBe('twomc.su');
  });

  describe('DocumentBadge', () => {
    beforeEach(() => {
      unread.count = 0;
    });
    afterEach(() => {
      act(() => useAuthStore.setState({ user: null }));
    });

    it('уровень доступа берётся из accessLevel, а не из priority роли (250 ≠ 4)', () => {
      act(() => useAuthStore.setState({ user: staff(4, 250) }));
      render(<DocumentBadge variant="admin" />);
      expect(document.title).toBe('twomc.su | A [4]');
      expect(document.title).not.toContain('250');
    });

    it('админка + unread: (3) twomc.su | A [4]; сайт без суффикса', () => {
      unread.count = 3;
      act(() => useAuthStore.setState({ user: staff(4, 250) }));
      const { unmount } = render(<DocumentBadge variant="admin" />);
      expect(document.title).toBe('(3) twomc.su | A [4]');
      unmount();
      render(<DocumentBadge />);
      expect(document.title).toBe('(3) twomc.su');
    });
  });
});

describe('BrandWordmark', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('accessible name — «twomc.su»; графика aria-hidden; базовая «o» вне сезона', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));
    render(<BrandWordmark />);
    const wordmark = screen.getByTestId('brand-wordmark');
    expect(screen.getByText('twomc.su')).toHaveClass('sr-only');
    const visual = wordmark.querySelector('[aria-hidden]');
    expect(visual?.textContent).toBe('twmc.su');
    expect(wordmark.querySelector('[data-wordmark-o="default"]')).not.toBeNull();
    expect(wordmark.querySelector('img')).toBeNull();
  });

  it('Halloween → своя «o»; ошибка загрузки → базовая «o» (без битой картинки)', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T12:00:00'));
    render(<BrandWordmark />);
    const img = screen.getByTestId('brand-wordmark').querySelector('img');
    expect(img).toHaveAttribute('data-wordmark-o', 'halloween');
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('draggable', 'false');
    fireEvent.error(img as HTMLImageElement);
    expect(screen.getByTestId('brand-wordmark').querySelector('img')).toBeNull();
    expect(
      screen.getByTestId('brand-wordmark').querySelector('[data-wordmark-o="default"]'),
    ).not.toBeNull();
  });

  it('явная «o» для preview и явное «без сезона»', () => {
    const { rerender } = render(<BrandWordmark seasonalO={null} />);
    expect(document.querySelector('[data-wordmark-o="default"]')).not.toBeNull();
    rerender(<BrandWordmark seasonalO={{ id: 'new-year', src: '/x.svg' }} />);
    expect(document.querySelector('img[data-wordmark-o="new-year"]')).not.toBeNull();
  });
});

describe('Сезонная система', () => {
  it('OFF → нет кампании; окно и истечение; приоритет при пересечении', () => {
    const halloween = new Date('2026-10-31T12:00:00');
    expect(resolveSeasonalCampaign(halloween, 'off')).toBeNull();
    expect(resolveSeasonalCampaign(halloween, '')?.id).toBe('halloween');
    expect(resolveSeasonalCampaign(new Date('2026-11-08T12:00:00'), '')).toBeNull();
    expect(resolveSeasonalCampaign(new Date('2027-01-05T12:00:00'), '')?.id).toBe('new-year');
    // 27.11.2026 — Чёрная пятница (последняя пятница ноября).
    expect(resolveSeasonalCampaign(new Date('2026-11-27T12:00:00'), '')?.id).toBe('black-friday');
    expect(resolveSeasonalCampaign(new Date('2026-06-01T12:00:00'), 'valentine')?.id).toBe(
      'valentine',
    );
  });

  it('у кампаний нет поля логотипа: основной логотип сезонами не меняется', () => {
    for (const campaign of SEASONAL_CAMPAIGNS) {
      expect(campaign).not.toHaveProperty('logo');
    }
  });

  it.each([
    ['Halloween', '2026-10-31T12:00:00'],
    ['Новый год', '2026-12-31T12:00:00'],
    ['вне сезонов', '2026-06-01T12:00:00'],
  ])('SiteLogo в период «%s» — всегда основной logo.png', (_label, date) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(date));
    render(<SiteLogo />);
    const logo = document.querySelector('img[data-logo]');
    expect(logo).toHaveAttribute('data-logo', 'main');
    expect(decodeURIComponent(logo?.getAttribute('src') ?? '')).toContain(SITE_LOGO_URL);
    vi.useRealTimers();
  });
});
