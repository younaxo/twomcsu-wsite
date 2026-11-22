import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchEntityTitle } from '@/lib/seo';
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

  it('метаданные из настроек сайта; шаблон вкладки «Раздел — twomc.su»', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        json({
          meta: { title: 'twomc.su — сервер', description: 'Описание', keywords: ['minecraft'] },
        }),
      ),
    );
    const meta = await generateMetadata();
    expect(meta.title).toEqual({ default: 'twomc.su', template: '%s — twomc.su' });
    expect(meta.description).toBe('Описание');
    expect(meta.keywords).toEqual(['minecraft']);
    expect(meta.openGraph?.title).toBe('twomc.su — сервер');
  });

  it('fetchEntityTitle: название из API, обрезка, fallback при 404 и сбое сети', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => json({ name: '  Набор Старт  ' })),
    );
    expect(await fetchEntityTitle('/store/products/start', 'Товар')).toBe('Набор Старт');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => json({ title: 'x'.repeat(300) })),
    );
    expect((await fetchEntityTitle('/news/a', 'Новость')).length).toBe(120);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 404 }))),
    );
    expect(await fetchEntityTitle('/news/a', 'Новость')).toBe('Новость');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    );
    expect(await fetchEntityTitle('/news/a', 'Новость')).toBe('Новость');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => json({})),
    );
    expect(await fetchEntityTitle('/news/a', 'Новость')).toBe('Новость');
  });

  it('fetchEntityTitle: небезопасный слаг — fallback без запроса к API', async () => {
    const fetchMock = vi.fn(() => json({ title: 'Секрет' }));
    vi.stubGlobal('fetch', fetchMock);
    const slugs = ['..', '%2e%2e', 'a%2Fb', 'a%5Cb', 'x'.repeat(101), ''];
    for (const slug of slugs) {
      expect(await fetchEntityTitle(`/news/${slug}`, 'Новость')).toBe('Новость');
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await fetchEntityTitle(`/news/${'x'.repeat(100)}`, 'Новость')).toBe('Секрет');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
