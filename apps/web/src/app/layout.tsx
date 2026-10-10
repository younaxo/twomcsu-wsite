import type { Metadata, Viewport } from 'next';
import { SITE_URL } from '@/lib/env';
import { DEFAULT_DESCRIPTION, fetchPublic, type PublicSiteMeta } from '@/lib/seo';
import { SSR_THEME, THEME_INIT_SCRIPT } from '@/lib/theme/theme';
import './fonts';
import './globals.css';
import { Providers } from './providers';

/// Метаданные (срез 8.4, ADR-0126): описание, ключевые слова и заголовок для
/// соцсетей — из настроек сайта (`/site/settings`, кэш 5 минут), без API — по
/// умолчанию. Во вкладке всегда только «twomc.su» (с unread — «(N) twomc.su»,
/// см. useDocumentBadge); заголовки страниц в title вкладки не попадают.
export async function generateMetadata(): Promise<Metadata> {
  const site = await fetchPublic<PublicSiteMeta>('/site/settings', 300);
  const shareTitle = site?.meta?.title?.trim() || 'twomc.su';
  const description = site?.meta?.description?.trim() || DEFAULT_DESCRIPTION;
  const keywords = (site?.meta?.keywords ?? []).filter(Boolean);
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: 'twomc.su', template: 'twomc.su' },
    description,
    ...(keywords.length > 0 ? { keywords } : {}),
    applicationName: 'twomc.su',
    manifest: '/manifest.webmanifest',
    openGraph: {
      siteName: 'twomc.su',
      title: shareTitle,
      description,
      locale: 'ru_RU',
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title: shareTitle, description },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Цвет шапки браузера под тёмную (основную) и светлую тему «Полдня».
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#171715' },
    { media: '(prefers-color-scheme: light)', color: '#f7f7f5' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // data-theme выставляется на сервере (default dark) и уточняется inline-
    // скриптом из сохранённого выбора ДО первой отрисовки — без theme flash.
    // suppressHydrationWarning — атрибут может отличаться от SSR-значения.
    <html lang="ru" data-theme={SSR_THEME} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
