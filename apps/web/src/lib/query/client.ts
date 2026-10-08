import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/errors';

/// Один QueryClient на приложение (создаётся в Providers). 4xx не ретраим —
/// повтор 403/404 ничего не изменит; сеть/5xx — до двух повторов.
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
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
}
