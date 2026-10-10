import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SITE_NAVIGATION } from '@/lib/site/config';
import { resolveSeasonalDecoration } from '@/lib/site/seasonal';
import { MOBILE_NAV_ITEMS, MobileNav } from './mobile-nav';
import { SeasonalHeaderDecoration } from './seasonal-header-decoration';
import { SEASONAL_CAMPAIGNS } from '@/lib/site/seasonal';

// Настройки сезонов с сервера отсутствуют — fallback на реестр по дате (ADR-0079).
vi.mock('@/lib/site/hooks', () => ({
  usePublicSiteSettings: () => ({ isPending: false, data: undefined }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/rules',
}));

describe('MobileNav', () => {
  it('плавающая скруглённая панель без рамки и glass; пункты из общего конфига; активный — оранжевый', () => {
    render(<MobileNav />);
    const nav = screen.getByRole('navigation', { name: 'Разделы сайта' });
    expect(nav.className).toMatch(/inset-x-3/);
    expect(nav.className).toMatch(/safe-area-inset-bottom/);
    expect(nav.className).toMatch(/lg:hidden/);
    const surface = screen.getByTestId('mobile-nav-surface');
    expect(surface.className).toMatch(/rounded-full/);
    expect(surface.className.split(' ')).not.toContain('border');
    expect(surface.className).not.toMatch(/backdrop/);

    const labels = within(nav)
      .getAllByRole('link')
      .map((link) => link.getAttribute('aria-label'));
    expect(labels).toEqual(['Главная', 'Магазин', 'Правила', 'Сервера', 'Бонусы']);
    // Единый источник: те же маршруты, что у desktop rail.
    expect(MOBILE_NAV_ITEMS.slice(0, SITE_NAVIGATION.length).map((item) => item.href)).toEqual(
      SITE_NAVIGATION.map((item) => item.href),
    );
    const active = within(nav).getByRole('link', { name: 'Правила' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(active.className).toMatch(/text-primary/);
    expect(active.className).toMatch(/min-h-12/);
  });
});

describe('SeasonalHeaderDecoration', () => {
  it('Halloween активен в октябре, выключен вне периода и через env off', () => {
    expect(resolveSeasonalDecoration(new Date('2026-10-09T12:00:00'), undefined)?.id).toBe(
      'halloween',
    );
    expect(resolveSeasonalDecoration(new Date('2026-11-07T12:00:00'), undefined)?.id).toBe(
      'halloween',
    );
    expect(resolveSeasonalDecoration(new Date('2026-06-01T12:00:00'), undefined)).toBeNull();
    expect(resolveSeasonalDecoration(new Date('2026-10-09T12:00:00'), 'off')).toBeNull();
    expect(resolveSeasonalDecoration(new Date('2026-06-01T12:00:00'), 'halloween')?.id).toBe(
      'halloween',
    );
  });

  // jsdom не загружает картинки — имитируем исход загрузки ассета.
  function stubImage(outcome: 'load' | 'error') {
    const Original = window.Image;
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        setTimeout(() => (outcome === 'load' ? this.onload?.() : this.onerror?.()), 0);
      }
    }
    window.Image = FakeImage as unknown as typeof Image;
    return () => {
      window.Image = Original;
    };
  }

  it('ассет загрузился — декоративная полоса: aria-hidden, без кликов, абсолютная', async () => {
    const restore = stubImage('load');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-31T12:00:00'));
    try {
      render(<SeasonalHeaderDecoration />);
      const decoration = screen.getByTestId('seasonal-decoration');
      await waitFor(() => expect(decoration).toHaveAttribute('data-state', 'loaded'));
      expect(decoration).toHaveAttribute('aria-hidden', 'true');
      expect(decoration.className).toMatch(/pointer-events-none/);
      expect(decoration.className).toMatch(/absolute/);
      // Тёмные силуэты — маской цвета темы, иначе не видны на тёмной шапке.
      expect(decoration).toHaveAttribute('data-tint', 'true');
      expect(decoration.style.backgroundColor).toContain('var(--foreground)');
    } finally {
      vi.useRealTimers();
      restore();
    }
  });

  it('ассет не загрузился: на сайте полосы нет (без «битой» пустоты), в превью — явная ошибка', async () => {
    const restore = stubImage('error');
    const halloween = SEASONAL_CAMPAIGNS.find((item) => item.id === 'halloween')!;
    try {
      const onStatus = vi.fn();
      const { unmount } = render(
        <SeasonalHeaderDecoration campaign={halloween} onStatus={onStatus} />,
      );
      await waitFor(() =>
        expect(onStatus).toHaveBeenLastCalledWith('error', expect.stringContaining('halloween')),
      );
      expect(screen.queryByTestId('seasonal-decoration')).toBeNull();
      unmount();
      render(<SeasonalHeaderDecoration campaign={halloween} preview />);
      expect(await screen.findByText('Ассет украшения не загрузился')).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('у кампании нет украшения или флаг выключен — ничего', () => {
    const victory = SEASONAL_CAMPAIGNS.find((item) => item.id === 'victory-day')!;
    const { rerender } = render(<SeasonalHeaderDecoration campaign={victory} />);
    expect(screen.queryByTestId('seasonal-decoration')).toBeNull();
    rerender(<SeasonalHeaderDecoration campaign={null} />);
    expect(screen.queryByTestId('seasonal-decoration')).toBeNull();
  });
});
