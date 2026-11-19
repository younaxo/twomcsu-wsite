import { GIVEAWAY_API_BASE } from './api';

/// Публичные данные страницы отслеживания (без UUID, IP и кода).
export interface TrackedTicket {
  ticket: string;
  playerName: string;
  played: { hours: number; minutes: number };
  status: 'running' | 'finished';
}

/// Тот же шаблон, что на сервере.
export const TRACKING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;

export type TrackResult =
  { kind: 'ok'; data: TrackedTicket } | { kind: 'not_found' } | { kind: 'error' };

export async function fetchTrackedTicket(
  token: string,
  fetcher: typeof fetch = (...args) => fetch(...args),
  base: string = GIVEAWAY_API_BASE,
  signal?: AbortSignal,
): Promise<TrackResult> {
  // Неверный формат: единый «не найден» без запроса.
  if (!TRACKING_TOKEN_PATTERN.test(token)) return { kind: 'not_found' };
  try {
    const response = await fetcher(`${base}/tickets/track/${encodeURIComponent(token)}`, {
      method: 'GET',
      credentials: 'omit',
      signal,
    });
    if (response.status === 404) return { kind: 'not_found' };
    if (!response.ok) return { kind: 'error' };
    return { kind: 'ok', data: (await response.json()) as TrackedTicket };
  } catch {
    return { kind: 'error' };
  }
}
