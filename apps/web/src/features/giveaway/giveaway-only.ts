/// Режим GIVEAWAY_ONLY для web: все маршруты, кроме /giveaway, статики и
/// служебных, ведут на /giveaway. Без флага поведение сайта не меняется.

export const GIVEAWAY_PATH = '/giveaway';

const PASS_PREFIXES = [
  '/giveaway',
  '/api/giveaway',
  '/_next',
  '/assets',
  '/icons',
  '/sounds',
  '/.well-known',
];
const PASS_EXACT = new Set([
  '/favicon.ico',
  '/icon.png',
  '/apple-icon.png',
  '/manifest.webmanifest',
  '/robots.txt',
  '/sw.js',
  '/opengraph-image',
]);

export function isGiveawayOnly(value: string | undefined = process.env.GIVEAWAY_ONLY): boolean {
  return value === 'true' || value === '1';
}

/// Путь для редиректа или null, если запрос пропускается как есть.
export function giveawayOnlyRedirect(pathname: string, enabled: boolean): string | null {
  if (!enabled) return null;
  if (PASS_EXACT.has(pathname)) return null;
  for (const prefix of PASS_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return null;
  }
  return GIVEAWAY_PATH;
}
