/* twomc.su — Service Worker (ADR-0086).
 *
 * Что делает: без сети навигация открывает /offline; хешированная статика
 * сборки (/_next/static) отдаётся из кэша; /assets и /fonts (имена файлов не
 * хешированы — файл могут заменить) — из кэша с обновлением в фоне
 * (stale-while-revalidate), чтобы замена появлялась при следующем открытии.
 *
 * Чего НЕ делает никогда: не кэширует API (другой origin), запросы с
 * Authorization, HTML страниц (в нём могут быть данные пользователя),
 * запросы с параметрами и всё, что не GET. Чувствительные данные в кэш не
 * попадают.
 */
const VERSION = 'v2';
const CACHE = `twomc-static-${VERSION}`;
const OFFLINE_URL = '/offline';
const PRECACHE = [OFFLINE_URL, '/icon.png'];

/// Статика сборки: в production-сборке пути `/_next/static` хешированы —
/// содержимое по адресу не меняется, безопасно cache-first.
function isBuildAsset(url) {
  return (
    url.origin === self.location.origin && !url.search && url.pathname.startsWith('/_next/static/')
  );
}

/// Публичные файлы без хеша в имени — stale-while-revalidate.
function isPublicAsset(url) {
  return (
    url.origin === self.location.origin &&
    !url.search &&
    (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/'))
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

  if (isBuildAsset(url)) {
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
    return;
  }

  if (isPublicAsset(url)) {
    const network = fetch(request).then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    });
    if (event.waitUntil) event.waitUntil(network.catch(() => undefined));
    event.respondWith(
      caches.open(CACHE).then(async (cache) => (await cache.match(request)) || network),
    );
  }
});
