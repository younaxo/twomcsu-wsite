'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Уведомления в админке (`/admin/notifications/*`): массовая рассылка,
/// Discord-вебхуки, сводная статистика. Права — `notifications.*`.

export const NOTIFICATION_TYPE_LABEL = {
  COMMENT_ON_PROFILE: 'Комментарий в профиле',
  COMMENT_MENTION: 'Упоминание в комментарии',
  COMMENT_REPLY: 'Ответ на комментарий',
  ACTIVITY_COMMENT: 'Комментарий к активности',
  ACTIVITY_COMMENT_MENTION: 'Упоминание в активности',
  FRIEND_REQUEST: 'Заявка в друзья',
  FRIEND_ACCEPTED: 'Заявка принята',
  GIFT_RECEIVED: 'Подарок',
  ORDER_STATUS_CHANGED: 'Статус заказа',
  CHAT_MENTION: 'Упоминание в чате',
  NEWS_PUBLISHED: 'Новая новость',
  NEWS_COMMENT_REPLY: 'Ответ в новости',
  NEWS_COMMENT_MENTION: 'Упоминание в новости',
  REPORT_MENTION: 'Упоминание в обращении',
  NEWS_LIKED: 'Лайк новости',
  ANNOUNCEMENT: 'Объявление',
  MAINTENANCE: 'Техработы',
  ACHIEVEMENT_UNLOCKED: 'Достижение',
  REPORT_ASSIGNED: 'Обращение назначено',
  REPORT_VERDICT: 'Вердикт по обращению',
  REPORT_STATUS_CHANGED: 'Статус обращения',
  REPORT_TARGET: 'Обращение на игрока',
  MESSAGE_RECEIVED: 'Личное сообщение',
  RANK_GRANTED: 'Выдан ранг',
  BADGE_GRANTED: 'Выдан значок',
  AWARD_GRANTED: 'Выдана награда',
  PAYMENT_RECEIVED: 'Платёж получен',
  DAILY_REWARD_AVAILABLE: 'Ежедневная награда',
  EVENT_REMINDER: 'Напоминание о событии',
  EVENT_UPDATED: 'Событие изменено',
  DECORATION_GRANTED: 'Выдано украшение',
  SYSTEM: 'Системное',
} as const;

export type NotificationTypeKey = keyof typeof NOTIFICATION_TYPE_LABEL;
export const NOTIFICATION_TYPES = Object.keys(NOTIFICATION_TYPE_LABEL) as NotificationTypeKey[];

export type BroadcastType = 'ANNOUNCEMENT' | 'MAINTENANCE' | 'SYSTEM';
export type BroadcastPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export const BROADCAST_TYPE_LABEL: Record<BroadcastType, string> = {
  ANNOUNCEMENT: 'Объявление',
  MAINTENANCE: 'Техработы',
  SYSTEM: 'Системное',
};

export const BROADCAST_PRIORITY_LABEL: Record<BroadcastPriority, string> = {
  LOW: 'Низкий',
  NORMAL: 'Обычный',
  HIGH: 'Высокий',
  URGENT: 'Срочный',
};

export interface BroadcastInput {
  title: string;
  message?: string;
  link?: string;
  type: BroadcastType;
  priority: BroadcastPriority;
}

export interface WebhookRow {
  id: string;
  name: string;
  /// Адрес вебхука — секрет: в интерфейсе показывается только маской.
  maskedUrl: string;
  eventTypes: string[];
  isActive: boolean;
  createdAt: string;
}

export interface WebhookInput {
  name: string;
  url?: string;
  eventTypes: string[];
  isActive: boolean;
}

export interface NotificationStats {
  total: number;
  unread: number;
  byType: Record<string, number>;
}

/// Адрес Discord-вебхука содержит токен: показываем только хост и хвост.
export function maskWebhookUrl(url: unknown): string {
  if (typeof url !== 'string' || url === '') return '—';
  try {
    const parsed = new URL(url);
    return `${parsed.host}/…${url.slice(-4)}`;
  } catch {
    return '…скрыт';
  }
}

interface RawWebhook {
  id?: unknown;
  name?: unknown;
  url?: unknown;
  eventTypes?: unknown;
  isActive?: unknown;
  createdAt?: unknown;
}

/// Строка собирается по белому списку: сам `url` дальше не передаётся.
export function toWebhookRow(raw: RawWebhook): WebhookRow {
  return {
    id: String(raw.id ?? ''),
    name: typeof raw.name === 'string' ? raw.name : '',
    maskedUrl: maskWebhookUrl(raw.url),
    eventTypes: Array.isArray(raw.eventTypes)
      ? raw.eventTypes.filter((item): item is string => typeof item === 'string')
      : [],
    isActive: raw.isActive !== false,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
  };
}

const BASE = '/admin/notifications';

export const adminNotificationKeys = {
  webhooks: ['admin', 'notifications', 'webhooks'] as const,
  stats: ['admin', 'notifications', 'stats'] as const,
};

export function useNotificationStats(enabled: boolean) {
  return useQuery({
    queryKey: adminNotificationKeys.stats,
    queryFn: () => api.get<NotificationStats>(`${BASE}/stats`),
    enabled,
  });
}

export function useWebhooks(enabled: boolean) {
  return useQuery({
    queryKey: adminNotificationKeys.webhooks,
    queryFn: async () => {
      const raw = await api.get<RawWebhook[]>(`${BASE}/webhooks`);
      return (Array.isArray(raw) ? raw : []).map(toWebhookRow);
    },
    enabled,
  });
}

export function useBroadcast() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: BroadcastInput) =>
      api.post<{ count: number }>(`${BASE}/broadcast`, {
        title: body.title,
        type: body.type,
        priority: body.priority,
        ...(body.message ? { message: body.message } : {}),
        ...(body.link ? { link: body.link } : {}),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: adminNotificationKeys.stats }),
  });
}

export function useWebhookActions() {
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: adminNotificationKeys.webhooks });
  const create = useMutation({
    mutationFn: (body: WebhookInput) => api.post(`${BASE}/webhooks`, body),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<WebhookInput> }) =>
      api.patch(`${BASE}/webhooks/${encodeURIComponent(id)}`, body),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`${BASE}/webhooks/${encodeURIComponent(id)}`),
    onSuccess,
  });
  return { create, update, remove };
}
