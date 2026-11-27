/// Хосты для `next/image` (`images.remotePatterns`). Домены берутся из публичных
/// переменных окружения (CDN, API, сайт), а не зашиты под стенд; произвольные
/// хосты не открываются, а для API и сайта разрешён только префикс загрузок.

/** @typedef {{ protocol: 'http' | 'https'; hostname: string; port?: string; pathname?: string }} RemotePattern */

/** Постоянные внешние хосты (аватары Minecraft, CDN twomc.su). */
export const STATIC_REMOTE_PATTERNS = [
  { protocol: 'https', hostname: 'cdn-files.twomc.su' },
  { protocol: 'https', hostname: 'mc-heads.net' },
  { protocol: 'https', hostname: 'minotar.net' },
];

/**
 * @param {string | undefined} raw  абсолютный URL из env
 * @param {string[]} suffixes       пути (относительно пути из URL), которые разрешаем
 * @returns {RemotePattern[]}
 */
function patternsFor(raw, suffixes) {
  if (!raw) return [];
  let url;
  try {
    url = new URL(raw);
  } catch {
    return [];
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return [];
  const base = url.pathname.replace(/\/+$/, '');
  return suffixes.map((suffix) => ({
    protocol: /** @type {'http' | 'https'} */ (url.protocol.slice(0, -1)),
    hostname: url.hostname,
    port: url.port,
    pathname: `${base}${suffix}/**`,
  }));
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {RemotePattern[]}
 */
export function buildRemotePatterns(env) {
  const cdn = patternsFor(env.NEXT_PUBLIC_CDN_BASE_URL || env.CDN_BASE_URL, ['']);
  // API отдаёт файлы по `<API>/uploads/**`; с сайтом тот же хост — `/api/uploads`
  // (reverse proxy) и `/uploads` (прямой маршрут).
  const api = patternsFor(env.NEXT_PUBLIC_API_URL, ['/uploads']);
  const site = patternsFor(env.NEXT_PUBLIC_SITE_URL, ['/api/uploads', '/uploads']);
  const seen = new Set();
  /** @type {RemotePattern[]} */
  const result = [];
  for (const pattern of [...STATIC_REMOTE_PATTERNS, ...cdn, ...api, ...site]) {
    const key = JSON.stringify([
      pattern.protocol,
      pattern.hostname,
      pattern.port ?? '',
      pattern.pathname ?? '',
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(pattern);
  }
  return result;
}
