import { afterEach, describe, expect, it, vi } from 'vitest';

const fetchPublic = vi.hoisted(() => vi.fn(async () => null));

vi.mock('@/lib/seo', () => ({
  DEFAULT_DESCRIPTION: 'default',
  fetchPublic,
}));
vi.mock('@/app/fonts', () => ({}));
vi.mock('@/app/globals.css', () => ({}));
vi.mock('@/app/providers', () => ({ Providers: () => null }));

describe('layout: generateMetadata и GIVEAWAY_ONLY', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('с GIVEAWAY_ONLY=true не запрашивает /site/settings', async () => {
    vi.stubEnv('GIVEAWAY_ONLY', 'true');
    const { generateMetadata } = await import('@/app/layout');
    const meta = await generateMetadata();
    expect(fetchPublic).not.toHaveBeenCalled();
    expect(meta.title).toEqual({ default: 'twomc.su', template: 'twomc.su' });
  });

  it('без флага поведение прежнее: запрос настроек сайта', async () => {
    vi.stubEnv('GIVEAWAY_ONLY', '');
    const { generateMetadata } = await import('@/app/layout');
    await generateMetadata();
    expect(fetchPublic).toHaveBeenCalledWith('/site/settings', 300);
  });
});
