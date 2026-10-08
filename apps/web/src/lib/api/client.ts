import type { RefreshResponse } from '@twomc/shared';
import { API_URL } from '../env';
import { ApiError, NetworkError } from './errors';
import { tokenStore } from './token-store';

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue>;

export type ParseMode = 'json' | 'blob' | 'text' | 'none';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: QueryParams;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /// Подставлять `Authorization: Bearer` (по умолчанию да).
  auth?: boolean;
  /// При 401 один раз обновить access-token через refresh-cookie и повторить
  /// запрос (по умолчанию да; выключается для самого refresh и для login).
  retryOn401?: boolean;
  parse?: ParseMode;
}

type SessionExpiredHandler = () => void;
let sessionExpiredHandler: SessionExpiredHandler | null = null;

/// Вызывается, когда refresh после 401 не удался: сессии больше нет, auth-store
/// должен перевести приложение в anonymous (см. lib/auth/store.ts).
export function setSessionExpiredHandler(handler: SessionExpiredHandler | null): void {
  sessionExpiredHandler = handler;
}

export function buildQueryString(query: QueryParams | undefined): string {
  if (!query) {
    return '';
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

function buildUrl(path: string, query?: QueryParams): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_URL}${normalized}${buildQueryString(query)}`;
}

async function parseBody(response: Response, mode: ParseMode): Promise<unknown> {
  if (mode === 'none' || response.status === 204) {
    return undefined;
  }
  if (mode === 'blob') {
    return response.blob();
  }
  if (mode === 'text') {
    return response.text();
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  const text = await response.text();
  return text.length > 0 ? text : undefined;
}

async function parseErrorBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      return await response.json();
    }
    const text = await response.text();
    return text.length > 0 ? { statusCode: response.status, message: text } : undefined;
  } catch {
    return undefined;
  }
}

let refreshPromise: Promise<string | null> | null = null;

/// `POST /auth/refresh` — single-flight: параллельные 401 (и повторный вызов
/// эффекта в React StrictMode) делят один запрос. Это критично: refresh-token
/// ротируется, а повторное использование уже отозванного cookie backend
/// считает кражей и отзывает ВСЕ сессии пользователя (reuse detection,
/// docs/technical/09-AUTHENTICATION.md).
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await fetch(buildUrl('/auth/refresh'), {
          method: 'POST',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          tokenStore.clear();
          return null;
        }
        const data = (await response.json()) as RefreshResponse;
        tokenStore.set(data.accessToken);
        return data.accessToken;
      } catch {
        // Сеть недоступна — токен не трогаем: текущий access-token может быть
        // ещё валиден, а сессия — живой.
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

async function doFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    throw new NetworkError(error);
  }
}

/// Низкоуровневый запрос: возвращает сырой `Response` (для CSV-экспорта и
/// прочих не-JSON ответов). Ошибки ≥ 400 превращаются в ApiError, 401 —
/// один раз пробует refresh.
export async function apiFetchRaw(path: string, options: RequestOptions = {}): Promise<Response> {
  const {
    method = 'GET',
    body,
    query,
    headers = {},
    signal,
    auth = true,
    retryOn401 = true,
  } = options;

  const requestHeaders: Record<string, string> = { Accept: 'application/json', ...headers };
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isFormData) {
    requestHeaders['Content-Type'] = 'application/json';
  }
  const token = auth ? tokenStore.get() : null;
  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  const init: RequestInit = {
    method,
    headers: requestHeaders,
    credentials: 'include',
    signal,
    body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
  };

  const url = buildUrl(path, query);
  let response = await doFetch(url, init);

  if (response.status === 401 && auth && retryOn401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await doFetch(url, {
        ...init,
        headers: { ...requestHeaders, Authorization: `Bearer ${refreshed}` },
      });
    } else if (token) {
      // Был токен, но ни он, ни refresh больше не работают — сессия истекла.
      sessionExpiredHandler?.();
    }
  }

  if (!response.ok) {
    throw ApiError.fromResponse(response.status, await parseErrorBody(response));
  }
  return response;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await apiFetchRaw(path, options);
  return (await parseBody(response, options.parse ?? 'json')) as T;
}

type BodyOptions = Omit<RequestOptions, 'method' | 'body'>;

export const api = {
  get: <T>(path: string, options?: BodyOptions) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: BodyOptions) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: BodyOptions) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: BodyOptions) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: BodyOptions) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};

/// Скачивание файла из ответа (CSV-экспорт): имя берётся из
/// `Content-Disposition`, иначе — `fallbackName`.
export async function downloadFromResponse(
  response: Response,
  fallbackName: string,
): Promise<void> {
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const fileName = match ? decodeURIComponent(match[1]) : fallbackName;
  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
