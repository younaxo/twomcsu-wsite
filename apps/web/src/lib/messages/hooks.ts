'use client';

import type {
  ConversationDto,
  ConversationSummaryDto,
  DirectMessageDto,
  GroupInviteDto,
  MessageReactionKey,
  MessagesPage,
} from '@twomc/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import { api } from '@/lib/api/client';

/// Личные сообщения (срез 2.4, ADR-0112): беседы, история страницами (свежие
/// первыми), действия. Отправка, правка, удаление и реакции — через WS с ack,
/// чтобы собеседник получил событие сразу; без соединения — REST.

const PAGE_SIZE = 50;

export const messageKeys = {
  all: ['messages'] as const,
  conversations: ['messages', 'conversations'] as const,
  conversation: (id: string) => ['messages', 'conversation', id] as const,
  history: (id: string) => ['messages', 'history', id] as const,
  invite: (code: string) => ['messages', 'invite', code] as const,
};

export function useConversations(enabled = true) {
  return useQuery({
    queryKey: messageKeys.conversations,
    queryFn: () => api.get<ConversationSummaryDto[]>('/messages/conversations'),
    enabled,
  });
}

/// Непрочитанные во всех беседах — для меню профиля.
export function unreadTotal(conversations: ConversationSummaryDto[] | undefined): number {
  return conversations?.reduce((sum, item) => sum + (item.isMuted ? 0 : item.unreadCount), 0) ?? 0;
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: messageKeys.conversation(id),
    queryFn: () => api.get<ConversationDto>(`/messages/conversations/${encodeURIComponent(id)}`),
  });
}

/// История: страница 1 — самые свежие; «Загрузить раньше» — следующие.
export function useMessageHistory(id: string) {
  return useInfiniteQuery({
    queryKey: messageKeys.history(id),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<MessagesPage>(`/messages/conversations/${encodeURIComponent(id)}/messages`, {
        query: { page: pageParam, limit: PAGE_SIZE },
      }),
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
  });
}

/// Сообщения в хронологическом порядке из страниц (каждая — уже по возрастанию).
export function flattenHistory(pages: MessagesPage[] | undefined): DirectMessageDto[] {
  if (!pages) return [];
  return [...pages].reverse().flatMap((page) => page.items ?? []);
}

/// Ответ WS-шлюза на действие: `{ ok, message? }` или `{ ok: false, error }`.
type Ack = { ok: boolean; message?: unknown; error?: string };

async function viaSocket<T>(
  socket: Socket | null,
  event: string,
  payload: unknown,
  fallback: () => Promise<T>,
): Promise<T | unknown> {
  if (!socket?.connected) return fallback();
  const ack = (await socket.timeout(8000).emitWithAck(event, payload)) as Ack | undefined;
  if (!ack?.ok) {
    throw new Error(ack?.error ?? 'Не удалось выполнить действие');
  }
  return ack.message;
}

export function useMessageActions(conversationId: string, socket: Socket | null) {
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: messageKeys.history(conversationId) });
    void client.invalidateQueries({ queryKey: messageKeys.conversations });
  };
  const id = encodeURIComponent(conversationId);
  const send = useMutation({
    mutationFn: (content: string) =>
      viaSocket(socket, 'message:send', { conversationId, content }, () =>
        api.post<DirectMessageDto>(`/messages/conversations/${id}/messages`, { content }),
      ),
    onSuccess: refresh,
  });
  const edit = useMutation({
    mutationFn: ({ messageId, content }: { messageId: string; content: string }) =>
      viaSocket(socket, 'message:edit', { messageId, content }, () =>
        api.patch(`/messages/messages/${encodeURIComponent(messageId)}`, { content }),
      ),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (messageId: string) =>
      viaSocket(socket, 'message:delete', { messageId }, () =>
        api.delete(`/messages/messages/${encodeURIComponent(messageId)}`),
      ),
    onSuccess: refresh,
  });
  const react = useMutation({
    mutationFn: ({ messageId, key }: { messageId: string; key: MessageReactionKey }) =>
      viaSocket(socket, 'message:react', { messageId, emoji: key }, () =>
        api.post(`/messages/messages/${encodeURIComponent(messageId)}/reactions`, {
          emoji: key,
        }),
      ),
    onSuccess: refresh,
  });
  const markRead = useMutation({
    mutationFn: () => api.post(`/messages/conversations/${id}/read`),
    onSuccess: () => client.invalidateQueries({ queryKey: messageKeys.conversations }),
  });
  const leave = useMutation({
    mutationFn: () => api.delete(`/messages/conversations/${id}/leave`),
    onSuccess: () => client.invalidateQueries({ queryKey: messageKeys.all }),
  });
  const invite = useMutation({
    mutationFn: () =>
      api.post<GroupInviteDto>(`/messages/conversations/${id}/invites`, { maxUses: 10 }),
  });
  return { send, edit, remove, react, markRead, leave, invite };
}

export function useStartConversation() {
  const client = useQueryClient();
  const direct = useMutation({
    mutationFn: (username: string) =>
      api.post<ConversationDto>('/messages/conversations/direct', { username }),
    onSuccess: () => client.invalidateQueries({ queryKey: messageKeys.conversations }),
  });
  const group = useMutation({
    mutationFn: (body: { title: string; memberUsernames: string[] }) =>
      api.post<ConversationDto>('/messages/conversations/group', body),
    onSuccess: () => client.invalidateQueries({ queryKey: messageKeys.conversations }),
  });
  return { direct, group };
}

export function useInvite(code: string) {
  return useQuery({
    queryKey: messageKeys.invite(code),
    queryFn: () => api.get<GroupInviteDto>(`/messages/invites/${encodeURIComponent(code)}`),
    retry: false,
  });
}

export function useJoinInvite(code: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<ConversationDto>(`/messages/invites/${encodeURIComponent(code)}/join`),
    onSuccess: () => client.invalidateQueries({ queryKey: messageKeys.conversations }),
  });
}
