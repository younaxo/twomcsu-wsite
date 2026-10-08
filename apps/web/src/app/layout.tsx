import type { Metadata, Viewport } from 'next';
import { DEFAULT_THEME, THEME_INIT_SCRIPT } from '@/lib/theme/theme';
import { appFontVariables } from './fonts';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: {
    default: 'TwoMC',
    template: '%s — TwoMC',
  },
  description: 'twomc.su — сайт Minecraft-проекта TwoMC',
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
    <html
      lang="ru"
      data-theme={DEFAULT_THEME}
      className={appFontVariables}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
