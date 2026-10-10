import { create } from 'zustand';
import { ApiError, NetworkError } from '../api/errors';
import { API_URL } from '../env';

/// Состояние связи (ADR-0086). Источник истины — проверка API (`/health`) с
/// таймаутом; `navigator.onLine` и события `online`/`offline` — только повод
/// перепроверить: браузер часто считает себя «онлайн» за captive-порталом или
/// при упавшем сервере.
///   online   — API отвечает;
///   offline  — нет сети вообще (не открывается и сам сайт);
///   api-down — сайт открывается, сервер twomc.su не отвечает.
export type ConnectivityStatus = 'online' | 'offline' | 'api-down';

/// Паузы между автоматическими повторами проверки, мс.
export const RETRY_DELAYS = [5_000, 10_000, 20_000, 40_000, 60_000] as const;
export const PROBE_TIMEOUT_MS = 5_000;

export function retryDelay(attempt: number): number {
  return RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)]!;
}

/// Сбой, после которого стоит проверить связь: сеть или 502/503/504 без
/// кода недоступности (503 техработ/модуля — штатный ответ, не сбой связи).
export function isConnectivityFailure(error: unknown): boolean {
  if (error instanceof NetworkError) return true;
  return (
    error instanceof ApiError &&
    [502, 503, 504].includes(error.status) &&
    !['MODULE_DISABLED', 'MAINTENANCE'].includes(error.code ?? '')
  );
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

async function reachable(url: string, fetcher: Fetcher, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    });
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/// Проверка: API → online; иначе сам сайт (уникальный URL — мимо кэша
/// Service Worker) → api-down; иначе offline.
export async function probeConnectivity(
  fetcher: Fetcher = (input, init) => fetch(input, init),
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<ConnectivityStatus> {
  if (await reachable(`${API_URL}/health`, fetcher, timeoutMs)) return 'online';
  const origin = `/icon.png?connectivity=${Date.now()}`;
  return (await reachable(origin, fetcher, timeoutMs)) ? 'api-down' : 'offline';
}

interface ConnectivityState {
  status: ConnectivityStatus;
  /// Номер неудачной попытки подряд — для паузы перед следующей.
  attempt: number;
  checking: boolean;
  /// Когда будет следующая автоматическая проверка (ms epoch) или null.
  nextCheckAt: number | null;
  /// Сколько раз связь восстановилась — повод перезапросить данные.
  recoveries: number;
  /// Сообщить о сбое запроса (из QueryCache) — запускает проверку.
  reportFailure: (error: unknown) => void;
  check: () => Promise<void>;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;

export const useConnectivity = create<ConnectivityState>((set, get) => ({
  status: 'online',
  attempt: 0,
  checking: false,
  nextCheckAt: null,
  recoveries: 0,
  reportFailure: (error) => {
    if (isConnectivityFailure(error) && !get().checking) void get().check();
  },
  check: () => {
    if (inflight) return inflight;
    if (timer) clearTimeout(timer);
    timer = null;
    set({ checking: true, nextCheckAt: null });
    inflight = probeConnectivity()
      .then((status) => {
        const previous = get().status;
        if (status === 'online') {
          set({
            status,
            attempt: 0,
            checking: false,
            recoveries: previous === 'online' ? get().recoveries : get().recoveries + 1,
          });
          return;
        }
        const attempt = get().attempt;
        const delay = retryDelay(attempt);
        set({ status, attempt: attempt + 1, checking: false, nextCheckAt: Date.now() + delay });
        timer = setTimeout(() => void get().check(), delay);
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  },
}));
