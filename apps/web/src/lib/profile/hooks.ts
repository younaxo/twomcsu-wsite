'use client';

import type {
  ConnectedProvider,
  OwnProfileDto,
  ProfileShowcaseDto,
  PublicProfileSummary,
} from '@twomc/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { API_URL } from '@/lib/env';

/// Просмотры (уникальные зрители, без своих) и реакции профиля (B5).
export interface ProfileStatsDto {
  views: number;
  likes: number;
  dislikes: number;
  myReaction: 'LIKE' | 'DISLIKE' | null;
}

/// Публичная часть профиля: те же поля, что у своего, но скрытые сервер не отдаёт.
export type PublicProfileDto = Partial<OwnProfileDto> &
  Pick<OwnProfileDto, 'id' | 'username'> & {
    minecraftName?: string | null;
    /// День рождения по приватности (ADR-0100): нет поля — скрыт; year: null —
    /// показываются только день и месяц.
    birthday?: { day: number; month: number; year: number | null } | null;
    stats?: ProfileStatsDto;
    /// Привязанные Discord/Telegram: провайдер, имя и публичная ссылка (если
    /// у провайдера она есть), без внешних ID.
    connectedAccounts?: {
      provider: ConnectedProvider;
      name: string | null;
      avatarUrl?: string | null;
      url: string | null;
    }[];
  };

/// Ответ `GET /users/:username/public` (ADR-0106): видимый профиль или только
/// ник скрытого (приватность, блокировка). Несуществующий ник — 404.
export type PublicProfileResponse =
  (PublicProfileDto & { hidden?: false }) | { username: string; hidden: true };

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

/// Витрина «Награды и значки» (`GET /users/:username/showcase`, ADR-0100).
export function useProfileShowcase(username: string) {
  return useQuery({
    queryKey: ['profile', 'showcase', username.toLowerCase()] as const,
    queryFn: () =>
      api.get<ProfileShowcaseDto>(`/users/${encodeURIComponent(username)}/showcase`, {
        retryOn401: false,
      }),
    staleTime: 60_000,
  });
}

/// Публичный профиль (`GET /users/:username/public`): поля уже отфильтрованы
/// сервером по приватности; скрытый профиль — `{ username, hidden: true }`.
export function usePublicProfile(username: string) {
  return useQuery({
    queryKey: ['profile', 'public', username.toLowerCase()] as const,
    queryFn: () =>
      api.get<PublicProfileResponse>(`/users/${encodeURIComponent(username)}/public`, {
        retryOn401: false,
      }),
    staleTime: 60_000,
  });
}

/// `GET /users/:username/skin` — есть ли скин Minecraft (ADR-0089). Текстуры
/// сайт отдаёт сам (`skin.png` / `cape.png`), браузер не ходит к Mojang.
export interface SkinMetaDto {
  available: boolean;
  model: 'classic' | 'slim' | null;
  cape: boolean;
  version: string | null;
}

export function useSkinMeta(username: string) {
  return useQuery({
    queryKey: ['profile', 'skin', username.toLowerCase()] as const,
    queryFn: () =>
      api.get<SkinMetaDto>(`/users/${encodeURIComponent(username)}/skin`, {
        retryOn401: false,
      }),
    staleTime: 10 * 60_000,
  });
}

export function skinTextureUrl(username: string, kind: 'skin' | 'cape', version: string): string {
  return `${API_URL}/users/${encodeURIComponent(username)}/${kind}.png?v=${encodeURIComponent(version)}`;
}
