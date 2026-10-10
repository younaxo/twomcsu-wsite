import type { BrandIconId } from '@/components/shell/brand-icon';
import { API_URL } from '@/lib/env';

/// Иконка сайта для подтверждения внешнего перехода (ADR-0102). Известные
/// сервисы — официальная brand-иконка из BrandIcon (без сетевых запросов);
/// остальные — фавиконка через наш защищённый резолвер на API (туда уходит
/// только origin, без пути и параметров). Нет иконки — Globe.

const KNOWN: ReadonlyArray<[string, BrandIconId]> = [
  ['discord.com', 'discord'],
  ['discord.gg', 'discord'],
  ['discordapp.com', 'discord'],
  ['t.me', 'telegram'],
  ['telegram.me', 'telegram'],
  ['telegram.org', 'telegram'],
  ['vk.com', 'vk'],
  ['vk.ru', 'vk'],
  ['steamcommunity.com', 'steam'],
  ['steampowered.com', 'steam'],
  ['twitch.tv', 'twitch'],
  ['youtube.com', 'youtube'],
  ['youtu.be', 'youtube'],
  ['tiktok.com', 'tiktok'],
  ['github.com', 'github'],
  ['instagram.com', 'instagram'],
  ['x.com', 'x'],
  ['twitter.com', 'x'],
  ['facebook.com', 'facebook'],
];

/// Brand-иконка для хоста (сам домен или его поддомен) или null.
export function knownSiteIcon(hostname: string): BrandIconId | null {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const match = KNOWN.find(([domain]) => host === domain || host.endsWith(`.${domain}`));
  return match ? match[1] : null;
}

/// Адрес фавиконки через API-резолвер; null — адрес не http(s).
export function faviconUrl(href: string): string | null {
  try {
    const url = new URL(href);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return `${API_URL}/link-preview/favicon?url=${encodeURIComponent(url.origin)}`;
  } catch {
    return null;
  }
}
