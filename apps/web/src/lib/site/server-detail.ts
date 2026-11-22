import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Страница сервера (`/servers/[slug]`): карточка, живой статус, игроки онлайн
/// и история онлайна. Формы — как отдаёт `servers.controller` (без правок API).

export interface ServerCardDto {
  id: string;
  name: string;
  slug: string;
  address: string;
  port: number;
  type: string;
  description: string | null;
  iconUrl: string | null;
  maxPlayers: number;
  version: string | null;
  category?: { id: string; name: string } | null;
}

export interface ServerLiveStatus {
  online: boolean;
  playerCount: number;
  maxPlayers: number;
  version: string | null;
  motd: string | null;
  ping: number | null;
}

export interface ServerHistoryPoint {
  id: string;
  online: boolean;
  playerCount: number;
  maxPlayers: number;
  timestamp: string;
}

export const serverDetailKeys = {
  card: (slug: string) => ['site', 'servers', slug] as const,
  status: (slug: string) => ['site', 'servers', slug, 'status'] as const,
  players: (slug: string) => ['site', 'servers', slug, 'players'] as const,
  history: (slug: string) => ['site', 'servers', slug, 'history'] as const,
};

const path = (slug: string, tail = '') => `/servers/${encodeURIComponent(slug)}${tail}`;

export function useServerCard(slug: string) {
  return useQuery({
    queryKey: serverDetailKeys.card(slug),
    queryFn: () => api.get<ServerCardDto>(path(slug), { auth: false }),
    retry: false,
  });
}

export function useServerStatus(slug: string, enabled = true) {
  return useQuery({
    queryKey: serverDetailKeys.status(slug),
    queryFn: () => api.get<ServerLiveStatus>(path(slug, '/status'), { auth: false }),
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled,
  });
}

export function useServerPlayers(slug: string, enabled = true) {
  return useQuery({
    queryKey: serverDetailKeys.players(slug),
    queryFn: () => api.get<string[]>(path(slug, '/players'), { auth: false }),
    refetchInterval: 60_000,
    enabled,
  });
}

export function useServerHistory(slug: string, enabled = true) {
  return useQuery({
    queryKey: serverDetailKeys.history(slug),
    queryFn: () => api.get<ServerHistoryPoint[]>(path(slug, '/history'), { auth: false }),
    enabled,
  });
}

/// API отдаёт историю от новых к старым; для графика нужен хронологический порядок.
export function chronological(points: ServerHistoryPoint[]): ServerHistoryPoint[] {
  return [...points].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

/// Адрес для подключения: порт 25565 по умолчанию не показываем.
export function connectAddress(server: Pick<ServerCardDto, 'address' | 'port'>): string {
  return server.port === 25565 ? server.address : `${server.address}:${server.port}`;
}
