'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Стрим-каналы в админке (`/admin/streams`, права `streams.*`). Поля статуса
/// (isLive, viewerCount, title…) обновляет только опрос платформ — вручную их
/// менять нельзя (см. UpdateStreamChannelDto на API).

export type StreamPlatform = 'TWITCH' | 'YOUTUBE';

export const STREAM_PLATFORM_LABEL: Record<StreamPlatform, string> = {
  TWITCH: 'Twitch',
  YOUTUBE: 'YouTube',
};

export interface StreamChannelRow {
  id: string;
  platform: StreamPlatform;
  channelKey: string;
  channelUrl: string;
  displayName: string;
  avatarUrl: string | null;
  userId: string | null;
  isPartner: boolean;
  isActive: boolean;
  isLive: boolean;
  viewerCount: number;
  lastCheckedAt: string | null;
}

export interface StreamChannelInput {
  platform: StreamPlatform;
  channelKey: string;
  channelUrl: string;
  displayName: string;
  avatarUrl?: string;
  userId?: string;
  isPartner?: boolean;
}

export interface StreamChannelPatch {
  displayName?: string;
  avatarUrl?: string;
  userId?: string;
  isPartner?: boolean;
  isActive?: boolean;
}

export interface StreamRefreshResult {
  refreshed: boolean;
  reason?: string;
}

const BASE = '/admin/streams';
export const adminStreamKeys = { all: ['admin', 'streams'] as const };

export function describeRefreshResult(result: StreamRefreshResult): string {
  if (result.refreshed) {
    return 'Статусы обновлены';
  }
  switch (result.reason) {
    case 'no_platform_credentials_configured':
      return 'Ключи Twitch и YouTube не настроены — опрос платформ не выполнен';
    case 'not_implemented':
      return 'Опрос платформ пока не реализован — статусы не изменены';
    default:
      return 'Статусы не обновлены';
  }
}

export function useAdminStreams() {
  return useQuery({
    queryKey: adminStreamKeys.all,
    queryFn: () => api.get<StreamChannelRow[]>(BASE),
  });
}

export function useStreamActions() {
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: adminStreamKeys.all });
  const create = useMutation({
    mutationFn: (body: StreamChannelInput) => api.post<StreamChannelRow>(BASE, body),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: StreamChannelPatch }) =>
      api.patch<StreamChannelRow>(`${BASE}/${encodeURIComponent(id)}`, body),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`${BASE}/${encodeURIComponent(id)}`),
    onSuccess,
  });
  const refresh = useMutation({
    mutationFn: () => api.post<StreamRefreshResult>(`${BASE}/refresh`),
    onSuccess,
  });
  return { create, update, remove, refresh };
}
