import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/env';

/// robots.txt (срез 8.4, ADR-0126): служебные и личные разделы не индексируются.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/design-lab',
          '/settings',
          '/messages',
          '/friends',
          '/notifications',
          '/feed',
          '/support',
          '/auth',
          '/site-connect',
          '/forms/invite',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
