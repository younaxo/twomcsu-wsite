/* twomc.su — Service Worker (ADR-0086).
 *
 * Что делает: без сети навигация открывает /offline; неизменяемая статика
 * (/_next/static, /assets, /fonts) отдаётся из кэша.
 *
 * Чего НЕ делает никогда: не кэширует API (другой origin), запросы с
 * Authorization, HTML страниц (в нём могут быть данные пользователя),
 * запросы с параметрами и всё, что не GET. Чувствительные данные в кэш не
 * попадают.
 */
const VERSION = 'v1';
const CACHE = `twomc-static-${VERSION}`;
const OFFLINE_URL = '/offline';
const PRECACHE = [OFFLINE_URL, '/icon.png'];

/// Статика с неизменяемыми (хешированными) путями — безопасна для кэша.
function isStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    !url.search &&
    (url.pathname.startsWith('/_next/static/') ||
      url.pathname.startsWith('/assets/') ||
      url.pathname.startsWith('/fonts/'))
  );
}

/// Ресурсы самой страницы /offline (CSS/JS/шрифты) — чтобы она открылась
/// полностью без сети.
async function precacheOffline(cache) {
  await cache.addAll(PRECACHE);
  const response = await cache.match(OFFLINE_URL);
  if (!response) return;
  const html = await response.text();
  const assets = new Set();
  for (const match of html.matchAll(/(?:href|src)="(\/_next\/static\/[^"?#]+)"/g)) {
    assets.add(match[1]);
  }
  await Promise.all([...assets].map((path) => cache.add(path).catch(() => undefined)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(precacheOffline)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('twomc-') && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (request.headers.has('authorization')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Страницы — всегда из сети; без сети — запасная /offline.
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((cached) => cached || Response.error()),
      ),
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        // Сюда доходят только адреса своего origin — непрозрачных ответов нет.
        if (response.ok) await cache.put(request, response.clone());
        return response;
      }),
    );
  }
});
