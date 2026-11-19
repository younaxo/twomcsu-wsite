import {
  GiveawayApiError,
  type GiveawayApi,
  type GiveawayCodeStatus,
  type GiveawayIssuedCode,
  type GiveawayPublicInfo,
} from './types';

/// Базовый путь API. Сайт и API розыгрыша живут на одном домене (ADR-G002 п. 1.4),
/// поэтому по умолчанию — относительный путь и `credentials: same-origin`.
export const GIVEAWAY_API_BASE =
  (process.env.NEXT_PUBLIC_GIVEAWAY_API_BASE ?? '').replace(/\/+$/, '') + '/api/giveaway/v1';

type Fetcher = typeof fetch;

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : null;
}

async function request<T>(
  fetcher: Fetcher,
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(url, {
      ...init,
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new GiveawayApiError('network');
  }
  if (response.status === 429) {
    throw new GiveawayApiError(
      'rate_limited',
      parseRetryAfter(response.headers.get('Retry-After')),
    );
  }
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    throw new GiveawayApiError('unavailable');
  }
  if (!response.ok) throw new GiveawayApiError('unknown');
  try {
    return (await response.json()) as T;
  } catch {
    throw new GiveawayApiError('unknown');
  }
}

/// HTTP-клиент реального API. Единственный клиент в production-пути.
export function createHttpGiveawayApi(
  fetcher: Fetcher = (...args) => fetch(...args),
  base: string = GIVEAWAY_API_BASE,
): GiveawayApi {
  return {
    getPublic: (signal) =>
      request<GiveawayPublicInfo>(fetcher, `${base}/public`, { method: 'GET' }, signal),
    issueCode: (signal) =>
      request<GiveawayIssuedCode>(
        fetcher,
        `${base}/codes`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
        signal,
      ),
    getStatus: (signal) =>
      request<GiveawayCodeStatus>(fetcher, `${base}/codes/status`, { method: 'GET' }, signal),
  };
}
