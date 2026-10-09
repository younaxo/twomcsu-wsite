import type { Metadata, Viewport } from 'next';
import { DEFAULT_THEME, THEME_INIT_SCRIPT } from '@/lib/theme/theme';
import './fonts';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: {
    default: 'twomc.su',
    // Во вкладке всегда только «twomc.su» (с unread — «(N) twomc.su», см. useDocumentBadge);
    // заголовки страниц в metadata не попадают в title вкладки.
    template: 'twomc.su',
  },
  description:
    'twomc.su — Minecraft-проект с собственными серверами, уникальными механиками, магазином и живым сообществом.',
  applicationName: 'twomc.su',
  manifest: '/manifest.webmanifest',
  openGraph: {
    siteName: 'twomc.su',
    title: 'twomc.su',
    description:
      'twomc.su — Minecraft-проект с собственными серверами, уникальными механиками, магазином и живым сообществом.',
    locale: 'ru_RU',
    type: 'website',
  },
  twitter: { card: 'summary', title: 'twomc.su' },
};

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
    <html lang="ru" data-theme={DEFAULT_THEME} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
