import type { PublicSiteSettings } from '@twomc/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { resolveSocialLinks, resolveSocialSlots } from '@/lib/site/config';
import { GlobalAlertBar, SiteAlertView } from './global-alert-bar';

const state: { data: Partial<PublicSiteSettings> | undefined } = { data: undefined };

vi.mock('@/lib/site/hooks', () => ({
  usePublicSiteSettings: () => ({ data: state.data }),
}));

describe('GlobalAlertBar', () => {
  it('выключена (alert: null) — ничего не рендерит', () => {
    state.data = { alert: null };
    const { container } = render(<GlobalAlertBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it('включена — красная плашка с иконкой и текстом, без кнопки закрытия', () => {
    state.data = {
      alert: {
        variant: 'danger',
        icon: 'wrench',
        title: 'Технические работы',
        message: 'Магазин недоступен до 18:00.',
        linkUrl: '/status',
        linkLabel: 'Статус',
      },
    };
    render(<GlobalAlertBar />);
    const bar = screen.getByRole('region', { name: 'Объявление сайта' });
    expect(bar).toHaveAttribute('data-variant', 'danger');
    expect(bar.className).toMatch(/bg-destructive/);
    expect(bar.className).not.toMatch(/backdrop/);
    expect(bar).toHaveTextContent('Технические работы. Магазин недоступен до 18:00.');
    expect(bar.querySelector('svg.lucide-wrench')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('link', { name: 'Статус' })).toHaveAttribute('href', '/status');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('варианты — семантические токены', () => {
    const base = {
      icon: 'info' as const,
      title: null,
      message: 'x',
      linkUrl: null,
      linkLabel: null,
    };
    const { rerender } = render(<SiteAlertView alert={{ ...base, variant: 'info' }} />);
    expect(screen.getByTestId('site-alert').className).toMatch(/bg-info/);
    rerender(<SiteAlertView alert={{ ...base, variant: 'success' }} />);
    expect(screen.getByTestId('site-alert').className).toMatch(/bg-success/);
  });
});

describe('Соцсети проекта', () => {
  const settings = {
    socialLinks: [
      { id: 'a', platform: 'tiktok', title: null, url: 'https://tiktok.com/@twomc' },
      { id: 'b', platform: 'twitch', title: 'Стримы', url: 'https://twitch.tv/twomc' },
      { id: 'c', platform: 'vk', title: null, url: 'http://vk.com/insecure' },
    ],
  } as PublicSiteSettings;

  it('порядок из админки, подпись или название платформы, только https', () => {
    expect(resolveSocialLinks(settings).map((l) => [l.platform, l.label])).toEqual([
      ['tiktok', 'TikTok'],
      ['twitch', 'Стримы'],
    ]);
  });

  it('в футере — подключённые + «скоро» для основных платформ без ссылки', () => {
    const slots = resolveSocialSlots(settings);
    expect(slots.map((s) => s.platform)).toEqual([
      'tiktok',
      'twitch',
      'telegram',
      'discord',
      'youtube',
      'vk',
    ]);
    expect(slots.filter((s) => s.url === null).map((s) => s.platform)).toEqual([
      'telegram',
      'discord',
      'youtube',
      'vk',
    ]);
  });
});
