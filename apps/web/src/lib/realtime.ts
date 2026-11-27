import { API_URL } from '@/lib/env';

/// Адрес и путь Socket.IO для namespace (`/chat`, `/messages`, `/notifications`).
/// Если API лежит под префиксом (`https://host/api`, стенд с одним origin), префикс
/// нельзя отдавать клиенту в URL: он станет именем namespace (`/api/chat`), которого на
/// сервере нет. Поэтому origin идёт в URL, а префикс уходит в `path` (`/api/socket.io`);
/// nginx срезает `/api` и проксирует на `/socket.io/` API с заголовками Upgrade.
/// Для отдельного хоста API (`https://api.twomc.su`) путь остаётся стандартным.
/// Относительный адрес (`/api`): origin берётся из `window.location`; без `window`
/// (SSR) — пустой origin, то есть namespace относительно текущего хоста.
/// Вызывать один раз на подключение и держать результат в переменной.
export function realtimeTarget(namespace: string, apiUrl: string = API_URL) {
  let origin = apiUrl;
  let prefix = '';
  if (apiUrl.startsWith('/') && !apiUrl.startsWith('//')) {
    origin = typeof window !== 'undefined' ? window.location.origin : '';
    prefix = apiUrl.replace(/\/+$/, '');
  } else {
    try {
      const parsed = new URL(apiUrl);
      origin = parsed.origin;
      prefix = parsed.pathname.replace(/\/+$/, '');
    } catch {
      // Неабсолютный адрес — оставляем как есть, как делал клиент раньше.
    }
  }
  return { url: `${origin}${namespace}`, path: `${prefix}/socket.io` };
}

/// Причина `disconnect`, при которой связи действительно нет. `io server disconnect` —
/// сервер сам закрыл сокет (выход, смена токена, бан): это не «нет связи», а решение
/// сервера; `io client disconnect` — наш собственный вызов `disconnect()`.
export function isOfflineReason(reason: string): boolean {
  return reason !== 'io server disconnect' && reason !== 'io client disconnect';
}
