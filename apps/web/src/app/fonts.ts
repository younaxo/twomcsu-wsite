import { JetBrains_Mono, Literata, Onest } from 'next/font/google';

/// Production-шрифты направления «Полдень»: Onest — весь UI, Literata —
/// редакционный текст (новости, правила), JetBrains Mono — id/координаты/
/// таймстампы. Self-hosted через next/font, Cyrillic обязателен.
export const onest = Onest({
  subsets: ['cyrillic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-onest',
  display: 'swap',
});

export const literata = Literata({
  subsets: ['cyrillic', 'latin'],
  weight: ['400', '600'],
  style: ['normal', 'italic'],
  variable: '--font-literata',
  display: 'swap',
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['cyrillic', 'latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const appFontVariables = [onest.variable, literata.variable, jetbrainsMono.variable].join(
  ' ',
);
