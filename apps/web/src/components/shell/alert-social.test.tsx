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
        displayStyle: 'outline',
        icon: 'wrench',
        title: 'Технические работы',
        message: 'Магазин недоступен до 18:00.',
        linkUrl: '/status',
        linkLabel: 'Статус',
        customIcon: null,
      },
    };
    render(<GlobalAlertBar />);
    const bar = screen.getByRole('region', { name: 'Объявление сайта' });
    expect(bar).toHaveAttribute('data-variant', 'danger');
    // Outline: поверхность шапки + тонкая обводка цветом типа.
    expect(bar).toHaveAttribute('data-style', 'outline');
    expect(bar.className).toMatch(/bg-surface/);
    expect(bar.className).toMatch(/border-destructive\/60/);
    // Плотный фон: ни одного полупрозрачного bg-*/NN.
    expect(bar.className).not.toMatch(/bg-[a-z-]+\/\d+/);
    expect(bar.className).not.toMatch(/bg-destructive\s|bg-destructive$|backdrop/);
    expect(bar).toHaveTextContent('Технические работы. Магазин недоступен до 18:00.');
    expect(bar.querySelector('svg.lucide-wrench')).toHaveAttribute('aria-hidden', 'true');
    expect(bar.querySelector('svg.lucide-wrench')?.getAttribute('class')).toMatch(
      /text-destructive/,
    );
    expect(screen.getByRole('link', { name: 'Статус' })).toHaveAttribute('href', '/status');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('варианты — семантические токены', () => {
    const base = {
      displayStyle: 'outline' as const,
      icon: 'info' as const,
      title: null,
      message: 'x',
      linkUrl: null,
      linkLabel: null,
      customIcon: null,
    };
    const { rerender } = render(<SiteAlertView alert={{ ...base, variant: 'info' }} />);
    expect(screen.getByTestId('site-alert').className).toMatch(/border-primary\/55/);
    rerender(<SiteAlertView alert={{ ...base, variant: 'success' }} />);
    expect(screen.getByTestId('site-alert').className).toMatch(/border-success\/60/);
    // Filled: полная заливка цветом типа, контрастный текст, иконка наследует цвет.
    rerender(<SiteAlertView alert={{ ...base, variant: 'danger', displayStyle: 'filled' }} />);
    const filled = screen.getByTestId('site-alert');
    expect(filled.className).toMatch(/bg-destructive text-destructive-foreground/);
    expect(filled.querySelector('svg')?.getAttribute('class')).toMatch(/text-current/);
    rerender(<SiteAlertView alert={{ ...base, variant: 'info', displayStyle: 'filled' }} />);
    expect(screen.getByTestId('site-alert').className).toMatch(
      /bg-primary text-primary-foreground/,
    );
  });

  it('свой SVG — только как <img> из data URI (скрипты в нём не исполняются)', () => {
    render(
      <SiteAlertView
        alert={{
          variant: 'info',
          displayStyle: 'filled',
          icon: 'custom',
          customIcon: '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>',
          title: null,
          message: 'x',
          linkUrl: null,
          linkLabel: null,
        }}
      />,
    );
    const bar = screen.getByTestId('site-alert');
    expect(bar.querySelector('circle')).toBeNull();
    const img = bar.querySelector('img');
    expect(img?.getAttribute('src')).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(img).toHaveAttribute('alt', '');
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
