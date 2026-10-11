import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/env';
import { fetchPublic } from '@/lib/seo';

/// sitemap.xml (срез 8.4, ADR-0126): публичные страницы, опубликованные
/// новости, события и темы правил и информации. Пересобирается раз в час;
/// API недоступен — только постоянные страницы.
export const revalidate = 3600;

const STATIC_PATHS = [
  '',
  '/shop',
  '/servers',
  '/rules',
  '/faq',
  '/news',
  '/events',
  '/vote',
  '/leaderboards',
  '/achievements',
  '/forms',
  '/legal/privacy',
  '/legal/terms',
  '/legal/cookies',
  '/legal/info',
  '/legal/refunds',
];

interface Sluggable {
  slug: string;
  updatedAt?: string | null;
}

const itemsOf = (data: unknown): Sluggable[] =>
  (Array.isArray(data) ? data : ((data as { items?: Sluggable[] } | null)?.items ?? [])).filter(
    (item): item is Sluggable => typeof item?.slug === 'string',
  );

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [news, events, rules, info] = await Promise.all([
    fetchPublic<unknown>('/news?limit=100', revalidate),
    fetchPublic<unknown>('/events?limit=100', revalidate),
    fetchPublic<unknown>('/topics?category=RULES', revalidate),
    fetchPublic<unknown>('/topics?category=INFORMATION', revalidate),
  ]);
  const entry = (path: string, updatedAt?: string | null) => ({
    url: `${SITE_URL}${path}`,
    ...(updatedAt ? { lastModified: new Date(updatedAt) } : {}),
  });
  return [
    ...STATIC_PATHS.map((path) => entry(path)),
    ...itemsOf(news).map((item) => entry(`/news/${encodeURIComponent(item.slug)}`, item.updatedAt)),
    ...itemsOf(events).map((item) =>
      entry(`/events/${encodeURIComponent(item.slug)}`, item.updatedAt),
    ),
    ...itemsOf(rules).map((item) =>
      entry(`/rules/${encodeURIComponent(item.slug)}`, item.updatedAt),
    ),
    ...itemsOf(info).map((item) => entry(`/info/${encodeURIComponent(item.slug)}`, item.updatedAt)),
  ];
}
