'use client';

import {
  SYSTEM_MESSAGE_LIMITS,
  type BulkSystemMessagePreview,
  type BulkSystemMessageRequest,
  type BulkSystemMessageResult,
  type SendSystemMessageRequest,
  type SendSystemMessageResult,
  type SystemMessageAudience,
  type SystemMessageContent,
  type SystemMessageRecipient,
} from '@twomc/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Системные сообщения от имени twomc.su (ADR-0080).

const BASE = '/admin/communications';

/// Ссылка — внутренний путь `/…` (не `//`) или `https://…` (как на сервере).
const LINK_PATTERN = /^(\/(?!\/)\S*|https:\/\/\S+)$/;

/// Ошибка заполнения или null — текст для подсказки под полем.
export function validateSystemMessage(content: SystemMessageContent): {
  title?: string;
  message?: string;
  link?: string;
} {
  const errors: { title?: string; message?: string; link?: string } = {};
  const title = content.title.trim();
  const message = content.message.trim();
  const link = content.link?.trim() ?? '';
  if (!title) errors.title = 'Введите заголовок';
  else if (title.length > SYSTEM_MESSAGE_LIMITS.title) errors.title = 'Слишком длинный заголовок';
  if (!message) errors.message = 'Введите текст сообщения';
  else if (message.length > SYSTEM_MESSAGE_LIMITS.message) errors.message = 'Слишком длинный текст';
  if (link && !LINK_PATTERN.test(link)) errors.link = 'Внутренний путь /… или https://…';
  return errors;
}

export function normalizeContent(content: SystemMessageContent): SystemMessageContent {
  const link = content.link?.trim();
  return { title: content.title.trim(), message: content.message.trim(), link: link || null };
}

/// Поиск получателей (активные обычные аккаунты). `q === null` — поиск не начат.
export function useRecipientSearch(q: string | null) {
  return useQuery({
    queryKey: ['admin', 'communications', 'recipients', q ?? ''],
    queryFn: () =>
      api.get<SystemMessageRecipient[]>(`${BASE}/recipients`, { query: { q: q || undefined } }),
    enabled: q !== null,
    staleTime: 30_000,
  });
}

export function useSendSystemMessage() {
  return useMutation({
    mutationFn: (body: SendSystemMessageRequest) =>
      api.post<SendSystemMessageResult>(`${BASE}/messages`, body),
  });
}

export function usePreviewBulkMessage() {
  return useMutation({
    mutationFn: (audience: SystemMessageAudience) =>
      api.post<BulkSystemMessagePreview>(`${BASE}/messages/bulk/preview`, { audience }),
  });
}

export function useSendBulkMessage() {
  return useMutation({
    mutationFn: (body: BulkSystemMessageRequest) =>
      api.post<BulkSystemMessageResult>(`${BASE}/messages/bulk`, body),
  });
}
