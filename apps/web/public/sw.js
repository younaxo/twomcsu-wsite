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
 *
 * Push (ADR-0097): системное уведомление (Windows — через браузер/PWA в
 * центре уведомлений). Payload готовит сервер (без лишних данных; превью
 * выключено — без имени и текста). `tag` беседы заменяет прежнее уведомление
 * этого диалога — дублей нет. Клик — фокус уже открытой вкладки сайта и
 * переход по внутреннему пути; новое окно — только если вкладки нет.
 * Свой звук в фоне не обещаем: звук системного уведомления — у браузера/ОС.
 *
 * `?mode=push` (dev): только push — без кэширования, чтобы не подменять HMR.
 */
const VERSION = 'v3';
const PUSH_ONLY = new URL(self.location.href).searchParams.get('mode') === 'push';
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
  if (PUSH_ONLY) {
    event.waitUntil(self.skipWaiting());
    return;
  }
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
            .filter((key) => key.startsWith('twomc-') && (PUSH_ONLY || key !== CACHE))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (PUSH_ONLY) return;
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

/// Только внутренний путь сайта (как на сервере); иначе — Центр уведомлений.
function safePath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return '/notifications';
  }
  if (value.includes('\\')) return '/notifications';
  return value;
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'TwoMC';
  const tag = typeof data.tag === 'string' && data.tag ? data.tag : undefined;
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : undefined,
      tag,
      // Новое сообщение той же беседы — заменяет прежнее и снова оповещает.
      renotify: Boolean(tag),
      icon: '/icon.png',
      badge: '/icon.png',
      lang: 'ru',
      data: { url: safePath(data.url), id: typeof data.id === 'string' ? data.id : null },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safePath(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const own = windows.filter((client) => new URL(client.url).origin === self.location.origin);
      const target = own.find((client) => client.focused) || own[0];
      if (target) {
        await target.focus();
        // Переход внутри уже открытой вкладки (без новой вкладки на каждый клик).
        target.postMessage({ type: 'twomc:navigate', url });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
