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

/// Внутренняя ссылка уведомления (раздел «Сообщения» ещё не выпущен —
/// диалоги ведут в Центр уведомлений).
export function inAppLink(notification: Pick<NotificationDto, 'link' | 'actionUrl'>): string {
  const link = notification.actionUrl ?? notification.link;
  if (!link || !link.startsWith('/') || link.startsWith('//') || link.startsWith('/messages/')) {
    return '/notifications';
  }
  return link;
}
