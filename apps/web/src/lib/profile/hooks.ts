'use client';

import type { OwnProfileDto, PublicProfileSummary } from '@twomc/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Публичная часть профиля: те же поля, что у своего, но скрытые сервер не отдаёт.
export type PublicProfileDto = Partial<OwnProfileDto> & Pick<OwnProfileDto, 'id' | 'username'>;

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

/// Публичный профиль (`GET /users/:username/public`): поля уже отфильтрованы
/// сервером по приватности; скрытый профиль — 404.
export function usePublicProfile(username: string) {
  return useQuery({
    queryKey: ['profile', 'public', username.toLowerCase()] as const,
    queryFn: () =>
      api.get<PublicProfileDto>(`/users/${encodeURIComponent(username)}/public`, {
        retryOn401: false,
      }),
    staleTime: 60_000,
  });
}
