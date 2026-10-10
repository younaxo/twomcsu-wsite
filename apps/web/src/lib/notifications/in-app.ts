'use client';

import type { NotificationDto } from '@twomc/shared';
import { create } from 'zustand';

/// Уведомления, когда сайт открыт (ADR-0097) — одно правило, без дублей:
///
/// - вкладка скрыта → ничего в интерфейсе: доставит системный push (сервер
///   сам не шлёт push, пока есть видимая вкладка);
/// - своё сообщение, повтор того же id или выключенные сообщения → ничего;
/// - открыт именно этот диалог → без тоста, тихий звук;
/// - иначе (сайт активен, другая страница) → тост + звук по настройкам.

/// Открытый сейчас диалог — выставит раздел «Сообщения», когда он появится.
export const useActiveConversation = create<{
  id: string | null;
  set: (id: string | null) => void;
}>((set) => ({ id: null, set: (id) => set({ id }) }));

export interface InAppContext {
  visible: boolean;
  meId: string | null;
  foregroundEnabled: boolean;
  soundEnabled: boolean;
  messagesEnabled: boolean;
  activeConversationId: string | null;
  seen: (id: string) => boolean;
}

export interface InAppDecision {
  toast: boolean;
  sound: 'normal' | 'quiet' | null;
}

const NOTHING: InAppDecision = { toast: false, sound: null };

export function conversationOf(notification: Pick<NotificationDto, 'metadata'>): string | null {
  const value = notification.metadata?.conversationId;
  return typeof value === 'string' ? value : null;
}

export function inAppDecision(notification: NotificationDto, ctx: InAppContext): InAppDecision {
  if (notification.type !== 'MESSAGE_RECEIVED') return NOTHING;
  if (!ctx.visible || !ctx.messagesEnabled) return NOTHING;
  if (notification.fromUser?.id && notification.fromUser.id === ctx.meId) return NOTHING;
  if (ctx.seen(notification.id)) return NOTHING;
  const conversation = conversationOf(notification);
  if (conversation && conversation === ctx.activeConversationId) {
    return { toast: false, sound: ctx.soundEnabled ? 'quiet' : null };
  }
  if (!ctx.foregroundEnabled) return NOTHING;
  return { toast: true, sound: ctx.soundEnabled ? 'normal' : null };
}

/// Раздел «Сообщения» выпущен (срез 2.4, ADR-0112) — ссылки на беседы работают
/// (как и `MESSAGES_ROUTE_AVAILABLE` в API).
export const MESSAGES_ROUTE_AVAILABLE = true;

function unavailable(link: string): boolean {
  return !MESSAGES_ROUTE_AVAILABLE && link.startsWith('/messages/');
}

/// Ссылка пункта в Центре уведомлений и в окне колокольчика: null — пункт не
/// кликабельный (нет ссылки или раздел ещё не выпущен). Внешние адреса
/// проходят через подтверждение внешних ссылок.
export function notificationHref(
  notification: Pick<NotificationDto, 'link' | 'actionUrl'>,
): string | null {
  const link = notification.actionUrl ?? notification.link;
  if (!link || unavailable(link)) return null;
  return link;
}

/// Внутренняя ссылка для тоста и системного push: только путь сайта; диалоги
/// (раздел ещё не выпущен) и внешние адреса — Центр уведомлений.
export function inAppLink(notification: Pick<NotificationDto, 'link' | 'actionUrl'>): string {
  const link = notification.actionUrl ?? notification.link;
  if (!link || !link.startsWith('/') || link.startsWith('//') || unavailable(link)) {
    return '/notifications';
  }
  return link;
}
