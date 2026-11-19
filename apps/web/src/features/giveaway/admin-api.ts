import { GIVEAWAY_API_BASE } from './api';
import {
  AdminApiError,
  type AdminApi,
  type AdminDraw,
  type AdminMode,
  type AdminSession,
} from './admin-types';

type Fetcher = typeof fetch;

export const CSRF_HEADER = 'X-Giveaway-Csrf';

export interface HttpAdminApiOptions {
  fetcher?: Fetcher;
  base?: string;
  /// Вызывается при любом 401: сессия закончилась, нужен экран входа.
  onUnauthorized?: () => void;
}

/// Адрес входа: обычная навигация браузера (редирект на Discord), не fetch.
export function adminLoginUrl(base: string = GIVEAWAY_API_BASE): string {
  return `${base}/admin/auth/login`;
}

/// HTTP-клиент админ-API. CSRF-токен берётся из `session()` и добавляется
/// ко всем запросам, кроме GET/HEAD; cookie - same-origin (Strict, host-only).
export function createHttpAdminApi(options: HttpAdminApiOptions = {}): AdminApi {
  const fetcher: Fetcher = options.fetcher ?? ((...args) => fetch(...args));
  const base = options.base ?? GIVEAWAY_API_BASE;
  let csrf: string | null = null;

  async function call<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    const init: RequestInit = {
      method,
      cache: 'no-store',
      credentials: 'same-origin',
      headers,
    };
    if (method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      if (csrf) headers[CSRF_HEADER] = csrf;
      init.body = JSON.stringify(body ?? {});
    }
    let response: Response;
    try {
      response = await fetcher(`${base}${path}`, init);
    } catch {
      throw new AdminApiError(0, 'network');
    }
    if (!response.ok) {
      let code = 'unknown';
      try {
        const data = (await response.json()) as { error?: unknown };
        if (typeof data.error === 'string') code = data.error;
      } catch {
        /* тело не JSON */
      }
      if (response.status === 401) {
        csrf = null;
        options.onUnauthorized?.();
      }
      if (response.status === 429) code = 'rate_limited';
      throw new AdminApiError(response.status, code);
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new AdminApiError(response.status, 'unknown');
    }
  }

  const qs = (params: Record<string, string | number>) =>
    new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  const modeQs = (mode: AdminMode) => `?mode=${mode}`;

  return {
    async session() {
      const session = await call<AdminSession>('GET', '/admin/session');
      csrf = session.csrfToken;
      return session;
    },
    async logout() {
      await call('POST', '/admin/auth/logout');
      csrf = null;
    },
    tickets: ({ mode, q, page, pageSize }) =>
      call('GET', `/admin/tickets?${qs({ mode, q, page, pageSize })}`),
    player: (uuid, mode) =>
      call('GET', `/admin/players/${encodeURIComponent(uuid)}${modeQs(mode)}`),
    settings: () => call('GET', '/admin/settings'),
    patchSettings: (body) => call('PATCH', '/admin/settings', body),
    prizes: () => call('GET', '/admin/prizes'),
    draw: (mode) => call<AdminDraw>('GET', `/admin/draw${modeQs(mode)}`),
    freeze: (mode) => call<AdminDraw>('POST', `/admin/draw/freeze${modeQs(mode)}`, {}),
    calculate: (mode, snapshotHash, confirm) =>
      call<AdminDraw>('POST', `/admin/draw/calculate${modeQs(mode)}`, { snapshotHash, confirm }),
    broadcast: (mode) => call<AdminDraw>('POST', `/admin/draw/broadcast${modeQs(mode)}`, {}),
    disqualify: (mode, winnerId, reason) =>
      call('POST', `/admin/draw/winners/${encodeURIComponent(winnerId)}/disqualify${modeQs(mode)}`, {
        reason,
      }),
    testTime: (body) => call('POST', '/admin/test/time', body),
    testTickets: (playerName) => call('POST', '/admin/test/tickets', { playerName }),
    testSeed: (count) => call('POST', '/admin/test/seed', { count }),
    testReset: () => call('POST', '/admin/test/reset', {}),
    audit: (page, pageSize) => call('GET', `/admin/audit?${qs({ page, pageSize })}`),
  };
}
