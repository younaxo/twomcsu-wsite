import type { PushPayload } from './push.service';

/// Политика системных push-уведомлений (ADR-0097) — одно место решений:
/// когда отправлять и что класть в payload.
///
/// - Сайт открыт на переднем плане (хотя бы одна видимая вкладка) — push не
///   нужен: человек видит уведомление в интерфейсе (in-app + звук). В фоне,
///   свёрнутом браузере или без вкладок — системное уведомление.
/// - Один `notification.id` — не больше одного push (`sentViaPush`); `tag`
///   беседы схлопывает уведомления одного диалога в системе.
/// - Превью выключено — в payload не попадают ни имя отправителя, ни текст:
///   сервер не отправляет их вовсе (а не прячет на клиенте).
/// - URL — только внутренний путь сайта.

/// Раздел «Сообщения» выпущен (срез 2.4, ADR-0112): push о сообщении ведёт в
/// беседу. Флаг оставлен, чтобы раздел можно было снова скрыть одной строкой.
export const MESSAGES_ROUTE_AVAILABLE = true;

const PREVIEW_MAX = 120;

export interface PushDecisionInput {
  pushEnabled: boolean;
  /// Тихие часы (кроме срочных).
  suppressed: boolean;
  /// Есть видимая вкладка сайта у пользователя.
  foreground: boolean;
  alreadySent: boolean;
}

export function shouldSendPush(input: PushDecisionInput): boolean {
  return (
    input.pushEnabled &&
    !input.suppressed &&
    !input.foreground &&
    !input.alreadySent
  );
}

/// Только внутренний путь (`/…`, не `//host`), иначе — Центр уведомлений.
export function safeInternalPath(link: string | null | undefined): string {
  if (
    !link ||
    !link.startsWith('/') ||
    link.startsWith('//') ||
    link.includes('\\')
  ) {
    return '/notifications';
  }
  if (link.startsWith('/messages/') && !MESSAGES_ROUTE_AVAILABLE)
    return '/notifications';
  return link;
}

export interface PushSource {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  metadata?: unknown;
}

function conversationIdOf(metadata: unknown): string | null {
  if (
    metadata &&
    typeof metadata === 'object' &&
    'conversationId' in metadata
  ) {
    const value = (metadata as { conversationId?: unknown }).conversationId;
    return typeof value === 'string' ? value : null;
  }
  return null;
}

function preview(text: string | null): string | undefined {
  if (!text) return undefined;
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > PREVIEW_MAX
    ? `${flat.slice(0, PREVIEW_MAX - 1)}…`
    : flat;
}

export function buildPushPayload(
  notification: PushSource,
  options: { previewEnabled: boolean; senderName: string | null },
): PushPayload {
  const url = safeInternalPath(notification.link);
  if (notification.type === 'MESSAGE_RECEIVED') {
    const conversationId = conversationIdOf(notification.metadata);
    const tag = conversationId
      ? `msg:${conversationId}`
      : `msg:${notification.id}`;
    if (!options.previewEnabled) {
      return {
        id: notification.id,
        type: notification.type,
        tag,
        url,
        title: 'TwoMC',
        body: 'Новое сообщение',
      };
    }
    return {
      id: notification.id,
      type: notification.type,
      tag,
      url,
      title: options.senderName ? `TwoMC · ${options.senderName}` : 'TwoMC',
      body: preview(notification.message) ?? 'Новое сообщение',
    };
  }
  return {
    id: notification.id,
    type: notification.type,
    tag: `n:${notification.id}`,
    url,
    title: notification.title,
    body: options.previewEnabled ? preview(notification.message) : undefined,
  };
}
