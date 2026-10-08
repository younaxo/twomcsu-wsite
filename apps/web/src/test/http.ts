import { vi } from 'vitest';

/// Мини-хелперы для мока глобального `fetch` в unit-тестах API-клиента и
/// auth-store (без MSW — лишняя зависимость для этого объёма тестов).
export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json; charset=utf-8');
  }
  return new Response(JSON.stringify(body), { status: 200, ...init, headers });
}

export function emptyResponse(status = 204): Response {
  return new Response(null, { status });
}

export type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

export function installFetchMock(): FetchMock {
  const mock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', mock);
  return mock;
}

/// Путь и метод запроса из вызова мока — чтобы ассерты не зависели от базового URL.
export function requestInfo(call: Parameters<typeof fetch>): {
  path: string;
  method: string;
  headers: Headers;
  body: string | undefined;
} {
  const [input, init] = call;
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
  );
  return {
    path: `${url.pathname}${url.search}`,
    method: init?.method ?? 'GET',
    headers: new Headers(init?.headers),
    body: typeof init?.body === 'string' ? init.body : undefined,
  };
}
