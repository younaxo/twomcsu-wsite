'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Модерация чата в админке (срез 7.7, ADR-0134): муты, баны, поиск сообщений.

export interface ChatModUser {
  id: string;
  username: string;
  tag: string | null;
  avatar: string | null;
}

export const MUTE_REASON_LABEL: Record<string, string> = {
  SPAM: 'Спам',
  TOXIC: 'Токсичность',
  ADVERTISING: 'Реклама',
  CAPS: 'Капс',
  OTHER: 'Другое',
};

export interface ChatMuteDto {
  id: string;
  userId: string;
  reason: string;
  reasonNote: string | null;
  mutedUntil: string | null;
  isActive: boolean;
  createdAt: string;
  user: ChatModUser;
}

export interface ChatBanDto {
  id: string;
  userId: string;
  reason: string;
  bannedUntil: string | null;
  isActive: boolean;
  createdAt: string;
  user: ChatModUser;
}

export interface ChatSearchItem {
  id: string;
  content: string;
  isDeleted: boolean;
  createdAt: string;
  author: ChatModUser | null;
  channel: { id: string; name: string } | null;
}

export const adminChatKeys = {
  all: ['admin', 'chat'] as const,
  mutes: ['admin', 'chat', 'mutes'] as const,
  bans: ['admin', 'chat', 'bans'] as const,
  search: (q: string, page: number) => ['admin', 'chat', 'search', q, page] as const,
};

export function useChatMutes(enabled: boolean) {
  return useQuery({
    queryKey: adminChatKeys.mutes,
    queryFn: () => api.get<ChatMuteDto[]>('/admin/chat/mutes'),
    enabled,
  });
}

export function useChatBans(enabled: boolean) {
  return useQuery({
    queryKey: adminChatKeys.bans,
    queryFn: () => api.get<ChatBanDto[]>('/admin/chat/bans'),
    enabled,
  });
}

export function useChatSearch(q: string, page: number) {
  return useQuery({
    queryKey: adminChatKeys.search(q, page),
    queryFn: () =>
      api.get<{ items: ChatSearchItem[]; total: number; page: number; limit: number }>(
        '/admin/chat/messages/search',
        { query: { q, page, limit: 30 } },
      ),
    enabled: q.length > 0,
    placeholderData: keepPreviousData,
  });
}

export function useChatModerationActions() {
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: adminChatKeys.all });
  const unmute = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/chat/mutes/${encodeURIComponent(id)}`),
    onSuccess,
  });
  const unban = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/chat/bans/${encodeURIComponent(id)}`),
    onSuccess,
  });
  return { unmute, unban };
}
