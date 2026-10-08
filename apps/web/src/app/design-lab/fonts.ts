import {
  Commissioner,
  Golos_Text,
  JetBrains_Mono,
  Literata,
  Martian_Mono,
  Onest,
  Unbounded,
} from 'next/font/google';

/// Шрифты трёх кандидатов направления. Загружаются только на /design-lab
/// (self-hosted через next/font — без запросов к Google в рантайме).
/// После выбора направления в production остаётся одна пара.

// A — EMBER: Unbounded (display) + Golos Text (UI) + JetBrains Mono
export const unbounded = Unbounded({
  subsets: ['cyrillic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-unbounded',
  display: 'swap',
});

export const golos = Golos_Text({
  subsets: ['cyrillic', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-golos',
  display: 'swap',
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['cyrillic', 'latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains',
  display: 'swap',
});

// B — DAYLIGHT: Onest (всё UI) + Literata (редакционный текст)
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

// C — SIGNAL: Commissioner (UI) + Martian Mono (данные)
export const commissioner = Commissioner({
  subsets: ['cyrillic', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-commissioner',
  display: 'swap',
});

export const martianMono = Martian_Mono({
  subsets: ['cyrillic', 'latin'],
  weight: ['400', '500'],
  variable: '--font-martian',
  display: 'swap',
});

export const labFontVariables = [
  unbounded.variable,
  golos.variable,
  jetbrainsMono.variable,
  onest.variable,
  literata.variable,
  commissioner.variable,
  martianMono.variable,
].join(' ');
