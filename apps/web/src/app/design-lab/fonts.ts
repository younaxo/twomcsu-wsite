import { Commissioner, Golos_Text, Martian_Mono, Unbounded } from 'next/font/google';

/// Шрифты АРХИВНЫХ кандидатов направления (ember / signal) — только для
/// /design-lab. Production-шрифты «Полдня» (Onest / Literata / JetBrains Mono)
/// подключены глобально в src/app/fonts.ts.

// A — EMBER: Unbounded (display) + Golos Text (UI)
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
  commissioner.variable,
  martianMono.variable,
].join(' ');
