import { API_URL } from '@/lib/env';

/// Адрес и путь Socket.IO для namespace (`/chat`, `/messages`, `/notifications`).
/// Если API лежит под префиксом (`https://host/api`, стенд с одним origin), префикс
/// нельзя отдавать клиенту в URL: он станет именем namespace (`/api/chat`), которого на
/// сервере нет. Поэтому origin идёт в URL, а префикс уходит в `path` (`/api/socket.io`);
/// nginx срезает `/api` и проксирует на `/socket.io/` API с заголовками Upgrade.
/// Для отдельного хоста API (`https://api.twomc.su`) путь остаётся стандартным.
export function realtimeTarget(namespace: string, apiUrl: string = API_URL) {
  let origin = apiUrl;
  let prefix = '';
  try {
    const parsed = new URL(apiUrl);
    origin = parsed.origin;
    prefix = parsed.pathname.replace(/\/+$/, '');
  } catch {
    // Неабсолютный адрес — оставляем как есть, как делал клиент раньше.
  }
  return { url: `${origin}${namespace}`, path: `${prefix}/socket.io` };
}
