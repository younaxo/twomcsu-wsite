import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateMetadata } from './layout';
import robots from './robots';
import sitemap from './sitemap';

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SEO (срез 8.4)', () => {
  it('robots: служебные и личные разделы закрыты, есть sitemap', () => {
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rule?.disallow).toEqual(expect.arrayContaining(['/admin', '/settings', '/messages']));
    expect(result.sitemap).toBe('https://twomc.su/sitemap.xml');
  });

  it('sitemap: постоянные страницы и опубликованное из API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/news'))
          return json({ items: [{ slug: 'patch-1', updatedAt: '2026-10-01T00:00:00.000Z' }] });
        if (url.includes('/events')) return json({ items: [{ slug: 'cup' }] });
        if (url.includes('category=RULES')) return json([{ slug: 'chat' }]);
        return json([]);
      }),
    );
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toEqual(
      expect.arrayContaining([
        'https://twomc.su',
        'https://twomc.su/news',
        'https://twomc.su/news/patch-1',
        'https://twomc.su/events/cup',
        'https://twomc.su/rules/chat',
      ]),
    );
    expect(urls).not.toContain('https://twomc.su/support');
  });

  it('sitemap и метаданные: API недоступен — значения по умолчанию', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    );
    expect((await sitemap()).length).toBeGreaterThan(5);
    const meta = await generateMetadata();
    expect(meta.description).toMatch(/Minecraft-проект/);
    expect(meta.keywords).toBeUndefined();
  });

  it('метаданные из настроек сайта; вкладка — всегда «twomc.su»', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        json({
          meta: { title: 'twomc.su — сервер', description: 'Описание', keywords: ['minecraft'] },
        }),
      ),
    );
    const meta = await generateMetadata();
    expect(meta.title).toEqual({ default: 'twomc.su', template: 'twomc.su' });
    expect(meta.description).toBe('Описание');
    expect(meta.keywords).toEqual(['minecraft']);
    expect(meta.openGraph?.title).toBe('twomc.su — сервер');
  });
});
