import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { faviconUrl, knownSiteIcon } from '@/lib/site/site-icon';
import { ExternalLinkGuard } from './external-link-guard';

/// Иконка сайта в подтверждении внешнего перехода (ADR-0102).

describe('knownSiteIcon — известные сервисы без сети', () => {
  it('домен и поддомены — brand-иконка, похожие домены — нет', () => {
    expect(knownSiteIcon('discord.com')).toBe('discord');
    expect(knownSiteIcon('discord.gg')).toBe('discord');
    expect(knownSiteIcon('www.youtube.com')).toBe('youtube');
    expect(knownSiteIcon('youtu.be')).toBe('youtube');
    expect(knownSiteIcon('t.me')).toBe('telegram');
    expect(knownSiteIcon('steamcommunity.com')).toBe('steam');
    expect(knownSiteIcon('gist.github.com')).toBe('github');
    expect(knownSiteIcon('twitch.tv')).toBe('twitch');
    expect(knownSiteIcon('vm.tiktok.com')).toBe('tiktok');
    expect(knownSiteIcon('VK.COM')).toBe('vk');
    expect(knownSiteIcon('notdiscord.com')).toBeNull();
    expect(knownSiteIcon('discord.com.evil.ru')).toBeNull();
    expect(knownSiteIcon('reallyworld.ru')).toBeNull();
  });

  it('в резолвер уходит только origin — без пути и параметров', () => {
    const url = faviconUrl('https://reallyworld.ru/news/secret?token=abc#x')!;
    expect(url).toMatch(/\/link-preview\/favicon\?url=/);
    expect(decodeURIComponent(url.split('url=')[1]!)).toBe('https://reallyworld.ru');
    expect(url).not.toContain('secret');
    expect(url).not.toContain('token');
    expect(faviconUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('Подтверждение внешнего перехода — иконка', () => {
  async function openFor(href: string, name: string) {
    const user = userEvent.setup();
    render(
      <ExternalLinkGuard>
        <a href={href}>{name}</a>
      </ExternalLinkGuard>,
    );
    await user.click(screen.getByRole('link', { name }));
    return screen.findByTestId('external-link-dialog');
  }

  it('произвольный сайт — фавиконка через резолвер; не загрузилась — Globe', async () => {
    const dialog = await openFor('https://reallyworld.ru/news/1', 'ReallyWorld');
    expect(within(dialog).getByTestId('external-link-host')).toHaveTextContent('reallyworld.ru');
    const icon = within(dialog).getByTestId('site-icon');
    expect(icon).toHaveAttribute('data-kind', 'favicon');
    const image = icon.querySelector('img')!;
    expect(decodeURIComponent(image.getAttribute('src')!.split('url=')[1]!)).toBe(
      'https://reallyworld.ru',
    );
    expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
    fireEvent.error(image);
    expect(within(dialog).getByTestId('site-icon')).toHaveAttribute('data-kind', 'globe');
    expect(within(dialog).getByTestId('site-icon').querySelector('img')).toBeNull();
  });

  it('известный сервис (GitHub) — brand-иконка без запроса к резолверу', async () => {
    const dialog = await openFor('https://github.com/younaxo', 'GitHub');
    const icon = within(dialog).getByTestId('site-icon');
    expect(icon).toHaveAttribute('data-kind', 'brand');
    expect(icon.querySelector('img')).toBeNull();
    expect(icon.querySelector('svg')).not.toBeNull();
  });
});
