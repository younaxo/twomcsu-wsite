import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGiveawaySocialLinks } from './social-links';

afterEach(() => vi.unstubAllEnvs());

describe('social-links', () => {
  it('по умолчанию все адреса пусты', () => {
    const links = getGiveawaySocialLinks();
    expect(links.map((l) => l.platform)).toEqual([
      'telegram',
      'discord',
      'youtube',
      'tiktok',
      'vk',
    ]);
    expect(links.every((l) => l.url === null)).toBe(true);
  });

  it('читает env и отбрасывает не-http значения', () => {
    vi.stubEnv('NEXT_PUBLIC_GIVEAWAY_SOCIAL_TELEGRAM', ' https://t.me/x ');
    vi.stubEnv('NEXT_PUBLIC_GIVEAWAY_SOCIAL_VK', 'javascript:alert(1)');
    const links = getGiveawaySocialLinks();
    expect(links.find((l) => l.platform === 'telegram')?.url).toBe('https://t.me/x');
    expect(links.find((l) => l.platform === 'vk')?.url).toBeNull();
  });
});
