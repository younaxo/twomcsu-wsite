import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SITE_NAVIGATION } from '@/lib/site/config';
import { resolveSeasonalDecoration } from '@/lib/site/seasonal';
import { MOBILE_NAV_ITEMS, MobileNav } from './mobile-nav';
import { SeasonalHeaderDecoration } from './seasonal-header-decoration';

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

  it('декоративен: aria-hidden, не перехватывает клики, абсолютный (без layout shift)', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-31T12:00:00'));
    render(<SeasonalHeaderDecoration />);
    const decoration = screen.getByTestId('seasonal-decoration');
    expect(decoration).toHaveAttribute('aria-hidden', 'true');
    expect(decoration.className).toMatch(/pointer-events-none/);
    expect(decoration.className).toMatch(/absolute/);
    expect(decoration.style.backgroundImage).toContain('h_header.webp');
    vi.useRealTimers();
  });
});
