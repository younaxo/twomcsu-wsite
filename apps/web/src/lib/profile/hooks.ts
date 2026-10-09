'use client';

import type { PublicProfileSummary } from '@twomc/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

export const profileKeys = {
  summary: (username: string) => ['profile', 'summary', username.toLowerCase()] as const,
};

/// Карточка превью профиля — запрашивается только когда превью открыто.
export function useProfileSummary(username: string, enabled: boolean) {
  return useQuery({
    queryKey: profileKeys.summary(username),
    queryFn: () =>
      api.get<PublicProfileSummary>(`/users/${encodeURIComponent(username)}/summary`, {
        retryOn401: false,
      }),
    enabled,
    staleTime: 60_000,
  });
}
