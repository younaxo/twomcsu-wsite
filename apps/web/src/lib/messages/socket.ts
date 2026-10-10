'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { tokenStore } from '@/lib/api/token-store';
import { useAuthStore } from '@/lib/auth/store';
import { API_URL } from '@/lib/env';
import { useActiveConversation } from '@/lib/notifications/in-app';
import { messageKeys } from './hooks';

/// WS `/messages` для открытой беседы (ADR-0112): входит в комнату, обновляет
/// историю и список бесед по событиям, отдаёт id печатающих участников. Пока беседа
/// открыта — она «активная»: уведомления о ней внутри сайта не всплывают.
export function useConversationSocket(conversationId: string) {
  const client = useQueryClient();
  const authenticated = useAuthStore((state) => state.status === 'authenticated');
  const meId = useAuthStore((state) => state.user?.id ?? null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [typing, setTyping] = useState<string[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    useActiveConversation.getState().set(conversationId);
    return () => useActiveConversation.getState().set(null);
  }, [conversationId]);

  useEffect(() => {
    const token = tokenStore.get();
    if (!authenticated || !token) return;
    const connection = io(`${API_URL}/messages`, {
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });
    const refresh = () => {
      void client.invalidateQueries({ queryKey: messageKeys.history(conversationId) });
      void client.invalidateQueries({ queryKey: messageKeys.conversations });
    };
    connection.on('connect', () => {
      connection.emit('conversation:join', { conversationId });
    });
    connection.on('message:new', refresh);
    connection.on('message:updated', refresh);
    connection.on('conversation:changed', () =>
      client.invalidateQueries({ queryKey: messageKeys.conversations }),
    );
    connection.on('typing:start', (payload: { userId?: string; conversationId?: string }) => {
      const userId = payload?.userId;
      if (payload?.conversationId !== conversationId || !userId || userId === meId) return;
      setTyping((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
      clearTimeout(timers.current.get(userId));
      // Без typing:stop (обрыв связи) — индикатор гаснет сам.
      timers.current.set(
        userId,
        setTimeout(() => setTyping((prev) => prev.filter((item) => item !== userId)), 6000),
      );
    });
    connection.on('typing:stop', (payload: { userId?: string; conversationId?: string }) => {
      if (payload?.conversationId !== conversationId || !payload.userId) return;
      setTyping((prev) => prev.filter((item) => item !== payload.userId));
    });
    setSocket(connection);
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
      connection.emit('conversation:leave', { conversationId });
      connection.disconnect();
      setSocket(null);
      setTyping([]);
    };
  }, [authenticated, client, conversationId, meId]);

  return { socket, typing };
}
