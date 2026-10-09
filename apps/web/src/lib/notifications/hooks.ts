'use client';

import type { NotificationDto, Paginated, UnreadCountResponse } from '@twomc/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { api } from '@/lib/api/client';
import { tokenStore } from '@/lib/api/token-store';
import { useAuthStore } from '@/lib/auth/store';
import { API_URL } from '@/lib/env';
import { siteKeys } from '@/lib/site/hooks';

/// Уведомления (ADR-0074). Единый источник числа непрочитанных —
/// `siteKeys.unread` (бейдж, превью, страница, title, favicon); все списки —
/// под общим префиксом `['site','notifications']`. Действия обновляют кэш
/// сразу (оптимистично) и затем сверяются с сервером; сокет сообщает об
/// изменениях из других вкладок и устройств.

export const NOTIFICATIONS_PREFIX = ['site', 'notifications'] as const;
export type NotificationFilter = 'all' | 'unread' | 'system';
const PAGE_SIZE = 20;

export const notificationKeys = {
  list: (filter: NotificationFilter) => [...NOTIFICATIONS_PREFIX, 'list', filter] as const,
};

export function useNotificationList(filter: NotificationFilter, enabled = true) {
  const authenticated = useAuthStore((state) => state.status === 'authenticated');
  return useInfiniteQuery({
    queryKey: notificationKeys.list(filter),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<Paginated<NotificationDto>>('/notifications', {
        query: {
          page: pageParam,
          limit: PAGE_SIZE,
          unreadOnly: filter === 'unread',
          type: filter === 'system' ? 'system' : undefined,
        },
      }),
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
    enabled: enabled && authenticated,
  });
}

type ListCache = Paginated<NotificationDto> | InfiniteData<Paginated<NotificationDto>>;

/// Применить изменение ко всем закэшированным спискам уведомлений.
function patchLists(client: QueryClient, update: (items: NotificationDto[]) => NotificationDto[]) {
  client.setQueriesData<ListCache>({ queryKey: NOTIFICATIONS_PREFIX }, (data) => {
    if (!data || typeof data !== 'object') return data;
    if ('pages' in data) {
      return { ...data, pages: data.pages.map((page) => ({ ...page, items: update(page.items) })) };
    }
    if ('items' in data) {
      return { ...data, items: update(data.items) };
    }
    return data;
  });
}

function setUnread(client: QueryClient, update: (count: number) => number) {
  client.setQueryData<UnreadCountResponse>(siteKeys.unread, (data) =>
    data ? { count: Math.max(0, update(data.count)) } : data,
  );
}

export function useNotificationActions() {
  const client = useQueryClient();
  const settle = () => client.invalidateQueries({ queryKey: NOTIFICATIONS_PREFIX });
  const find = (id: string) => {
    for (const [, data] of client.getQueriesData<ListCache>({ queryKey: NOTIFICATIONS_PREFIX })) {
      const items =
        data && 'pages' in data
          ? data.pages.flatMap((page) => page.items)
          : data && 'items' in data
            ? data.items
            : [];
      const found = items.find((item) => item.id === id);
      if (found) return found;
    }
    return undefined;
  };

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch<unknown>(`/notifications/${id}/read`),
    onMutate: (id) => {
      if (find(id)?.isRead === false) setUnread(client, (n) => n - 1);
      patchLists(client, (items) =>
        items.map((item) => (item.id === id ? { ...item, isRead: true } : item)),
      );
    },
    onSettled: settle,
  });
  const markUnread = useMutation({
    mutationFn: (id: string) => api.patch<unknown>(`/notifications/${id}/unread`),
    onMutate: (id) => {
      if (find(id)?.isRead === true) setUnread(client, (n) => n + 1);
      patchLists(client, (items) =>
        items.map((item) => (item.id === id ? { ...item, isRead: false } : item)),
      );
    },
    onSettled: settle,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete<unknown>(`/notifications/${id}`),
    onMutate: (id) => {
      if (find(id)?.isRead === false) setUnread(client, (n) => n - 1);
      patchLists(client, (items) => items.filter((item) => item.id !== id));
    },
    onSettled: settle,
  });
  const markAllRead = useMutation({
    mutationFn: () => api.patch<unknown>('/notifications/read-all'),
    onMutate: () => {
      setUnread(client, () => 0);
      patchLists(client, (items) => items.map((item) => ({ ...item, isRead: true })));
    },
    onSettled: settle,
  });
  const removeRead = useMutation({
    mutationFn: () => api.delete<{ count: number }>('/notifications/read'),
    onMutate: () => patchLists(client, (items) => items.filter((item) => !item.isRead)),
    onSettled: settle,
  });
  const clearAll = useMutation({
    mutationFn: () => api.delete<{ count: number }>('/notifications'),
    onMutate: () => {
      setUnread(client, () => 0);
      patchLists(client, () => []);
    },
    onSettled: settle,
  });
  return { markRead, markUnread, remove, markAllRead, removeRead, clearAll };
}

/// Мгновенные обновления: WS `/notifications` (событие `notification:changed`
/// несёт актуальное число непрочитанных). Без сокета работает опрос счётчика.
export function useNotificationsRealtime() {
  const client = useQueryClient();
  const authenticated = useAuthStore((state) => state.status === 'authenticated');
  useEffect(() => {
    const token = tokenStore.get();
    if (!authenticated || !token) return;
    const socket = io(`${API_URL}/notifications`, {
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });
    socket.on('notification:changed', (payload: { unreadCount?: number }) => {
      if (typeof payload?.unreadCount === 'number') {
        client.setQueryData<UnreadCountResponse>(siteKeys.unread, {
          count: payload.unreadCount,
        });
      }
      void client.invalidateQueries({
        queryKey: NOTIFICATIONS_PREFIX,
        predicate: (query) => query.queryKey[2] !== 'unread',
      });
    });
    return () => {
      socket.disconnect();
    };
  }, [authenticated, client]);
}
