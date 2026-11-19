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

/// Админка розыгрыша (ADR-G003, Q96): отдельный хост. Различение хоста действует
/// только при GIVEAWAY_ONLY; без флага основной сайт этой логики не видит.
export const ADMIN_PATH = '/giveaway/admin';
export const DEFAULT_ADMIN_HOST = 'admin.giveaway.twomc.su';

export function resolveAdminHost(
  value: string | undefined = process.env.GIVEAWAY_ADMIN_HOST,
): string {
  const host = (value ?? '').trim().toLowerCase();
  return host === '' ? DEFAULT_ADMIN_HOST : host;
}

/// Имя хоста без порта, в нижнем регистре.
export function hostName(host: string | null | undefined): string {
  return (host ?? '').trim().toLowerCase().replace(/:\d+$/, '');
}

export type HostRoute = { kind: 'rewrite' | 'redirect'; path: string } | null;

/// Маршрутизация по хосту при GIVEAWAY_ONLY.
/// Хост админки: `/` -> админка (rewrite), `/giveaway/**` проходит (тестовая страница),
/// остальное -> `/`. Другие хосты: `/giveaway/admin` -> `/giveaway` (редирект);
/// локально (`localhost`, не production) админка доступна и без отдельного хоста.
export function giveawayHostRoute(
  pathname: string,
  host: string | null | undefined,
  enabled: boolean,
  options: { adminHost?: string; production?: boolean } = {},
): HostRoute {
  if (!enabled) return null;
  const name = hostName(host);
  const adminHost = options.adminHost ?? resolveAdminHost();
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const isAdminHost = name === adminHost;
  const isAdminPath = pathname === ADMIN_PATH || pathname.startsWith(`${ADMIN_PATH}/`);
  if (isAdminHost) {
    if (pathname === '/') return { kind: 'rewrite', path: ADMIN_PATH };
    if (giveawayOnlyRedirect(pathname, true) !== null) return { kind: 'redirect', path: '/' };
    return null;
  }
  if (isAdminPath) {
    const local = !production && (name === 'localhost' || name === '127.0.0.1');
    return local ? null : { kind: 'redirect', path: GIVEAWAY_PATH };
  }
  return null;
}
