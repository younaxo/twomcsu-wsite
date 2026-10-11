'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Медиа-заявки в админке (срез 7.6, ADR-0141): очередь ожидающих заявок
/// на значок YouTube / Twitch / TikTok, одобрение или отказ с комментарием.

export type MediaGroup = 'YOUTUBE' | 'TWITCH' | 'TIKTOK';

export const MEDIA_GROUP_LABEL: Record<MediaGroup, string> = {
  YOUTUBE: 'YouTube',
  TWITCH: 'Twitch',
  TIKTOK: 'TikTok',
};

export interface AdminMediaRequest {
  id: string;
  userId: string;
  mediaGroup: MediaGroup;
  channelUrl: string;
  description: string | null;
  createdAt: string;
  user: { id: string; username: string; tag: string; avatar: string | null };
}

export type MediaDecision = 'APPROVED' | 'REJECTED';

export const adminMediaRequestKeys = {
  all: ['admin', 'media-requests'] as const,
};

/// Открывать из админки можно только http(s)-ссылку (API пишет https://
/// к ссылке без протокола, но старые заявки могли быть сохранены как есть).
export function safeChannelUrl(raw: string): string | null {
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

export function useAdminMediaRequests() {
  return useQuery({
    queryKey: adminMediaRequestKeys.all,
    queryFn: () => api.get<AdminMediaRequest[]>('/admin/media-requests'),
  });
}

export function useReviewMediaRequest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      reviewNote,
    }: {
      id: string;
      status: MediaDecision;
      reviewNote?: string;
    }) =>
      api.patch(`/admin/media-requests/${encodeURIComponent(id)}`, {
        status,
        ...(reviewNote ? { reviewNote } : {}),
      }),
    // И при ошибке: 409 «уже рассмотрена» значит, что очередь устарела.
    onSettled: () => client.invalidateQueries({ queryKey: adminMediaRequestKeys.all }),
  });
}
