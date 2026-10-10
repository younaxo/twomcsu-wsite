import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { SITE_UNAVAILABLE_CODES } from '@twomc/shared';
import { ApiError } from '../api/errors';
import { useConnectivity } from '../site/connectivity';

/// Ключ публичного статуса сайта (техработы, выключенные модули, ADR-0082).
export const SITE_STATUS_KEY = ['site', 'status'] as const;

/// 503 «модуль выключен / техработы» — не сбой сети: не повторяем, а
/// перечитываем статус, чтобы интерфейс сразу показал понятное состояние.
export function isSiteUnavailable(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 503 &&
    (SITE_UNAVAILABLE_CODES as readonly string[]).includes(error.code ?? '')
  );
}

/// Один QueryClient на приложение (создаётся в Providers). 4xx не ретраим —
/// повтор 403/404 ничего не изменит; сеть/5xx — до двух повторов.
export function createQueryClient(): QueryClient {
  const onError = (error: unknown) => {
    if (isSiteUnavailable(error)) void client.invalidateQueries({ queryKey: SITE_STATUS_KEY });
    // Сеть или 502/503/504 — проверить связь (плашка «нет связи», ADR-0086).
    useConnectivity.getState().reportFailure(error);
  };
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (isSiteUnavailable(error)) return false;
          if (error instanceof ApiError && error.status < 500) {
            return false;
          }
          return failureCount < 2;
        },
      },
      mutations: {
        retry: 0,
      },
    },
  });
  return client;
}
