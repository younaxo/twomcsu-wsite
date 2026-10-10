'use client';

import type { BlockedUserDto, FriendDto, FriendRelationDto, FriendRequestDto } from '@twomc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';
import { getErrorMessage } from '@/lib/api/errors';

/// Друзья и блокировки (срез 2.1, ADR-0108). Все списки — под общим префиксом
/// `['friends']`: любое действие и WS-событие уведомлений (`notification:changed`)
/// сбрасывают его целиком — счётчик входящих в меню обновляется сразу.
export const friendKeys = {
  all: ['friends'] as const,
  list: ['friends', 'list'] as const,
  incoming: ['friends', 'incoming'] as const,
  outgoing: ['friends', 'outgoing'] as const,
  blocked: ['friends', 'blocked'] as const,
  incomingCount: ['friends', 'incoming-count'] as const,
  relation: (username: string) => ['friends', 'relation', username.toLowerCase()] as const,
};

export function useFriends(enabled = true) {
  return useQuery({
    queryKey: friendKeys.list,
    queryFn: () => api.get<FriendDto[]>('/friends'),
    enabled,
  });
}

export function useIncomingRequests(enabled = true) {
  return useQuery({
    queryKey: friendKeys.incoming,
    queryFn: () => api.get<FriendRequestDto[]>('/friends/requests/incoming'),
    enabled,
  });
}

export function useOutgoingRequests(enabled = true) {
  return useQuery({
    queryKey: friendKeys.outgoing,
    queryFn: () => api.get<FriendRequestDto[]>('/friends/requests/outgoing'),
    enabled,
  });
}

export function useBlockedUsers(enabled = true) {
  return useQuery({
    queryKey: friendKeys.blocked,
    queryFn: () => api.get<BlockedUserDto[]>('/friends/blocked'),
    enabled,
  });
}

/// Число входящих заявок — для меню профиля и вкладки «Входящие».
export function useIncomingRequestsCount(enabled = true) {
  return useQuery({
    queryKey: friendKeys.incomingCount,
    queryFn: () => api.get<{ count: number }>('/friends/requests/incoming/count'),
    enabled,
    staleTime: 30_000,
  });
}

/// Отношение к игроку — для кнопки на профиле.
export function useFriendRelation(username: string, enabled = true) {
  return useQuery({
    queryKey: friendKeys.relation(username),
    queryFn: () =>
      api.get<FriendRelationDto>(`/friends/relation/${encodeURIComponent(username)}`, {
        retryOn401: false,
      }),
    enabled,
  });
}

export type FriendAction =
  | { kind: 'send'; username: string }
  | { kind: 'accept'; requestId: string }
  | { kind: 'decline'; requestId: string }
  | { kind: 'cancel'; requestId: string }
  | { kind: 'remove'; userId: string }
  | { kind: 'block'; userId: string }
  | { kind: 'unblock'; userId: string };

const SUCCESS: Record<FriendAction['kind'], string> = {
  send: 'Заявка отправлена',
  accept: 'Теперь вы друзья',
  decline: 'Заявка отклонена',
  cancel: 'Заявка отменена',
  remove: 'Игрок удалён из друзей',
  block: 'Игрок заблокирован',
  unblock: 'Игрок разблокирован',
};

function request(action: FriendAction): Promise<unknown> {
  switch (action.kind) {
    case 'send':
      return api.post(`/friends/requests/${encodeURIComponent(action.username)}`);
    case 'accept':
      return api.post(`/friends/requests/${encodeURIComponent(action.requestId)}/accept`);
    case 'decline':
    case 'cancel':
      return api.delete(`/friends/requests/${encodeURIComponent(action.requestId)}`);
    case 'remove':
      return api.delete(`/friends/${encodeURIComponent(action.userId)}`);
    case 'block':
      return api.post(`/friends/block/${encodeURIComponent(action.userId)}`);
    case 'unblock':
      return api.delete(`/friends/block/${encodeURIComponent(action.userId)}`);
  }
}

/// Все действия с друзьями — одна мутация: тост об успехе, понятная ошибка
/// сервера (политика заявок, «уже друзья» и т.п.) и сброс кэша друзей и
/// карточек профиля (число друзей в превью).
export function useFriendAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (_data, action) => {
      toast.success(SUCCESS[action.kind]);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: friendKeys.all });
      void client.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
