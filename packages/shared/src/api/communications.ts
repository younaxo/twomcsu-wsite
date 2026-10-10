/// Коммуникации от имени сайта (ADR-0080). Системное сообщение — уведомление
/// типа SYSTEM с защищённым отправителем «twomc.su»: создаёт его только сервер
/// по запросу администратора с правом, пользователь подделать его не может.

/// Защищённый отправитель системных сообщений (`notification.metadata.sender`).
export const SYSTEM_MESSAGE_SENDER = 'system';

export const SYSTEM_MESSAGE_LIMITS = {
  title: 120,
  message: 2000,
  /// Максимум явно выбранных получателей массовой рассылки.
  users: 100,
} as const;

/// Кому рассылать: всем активным, обладателям роли или выбранным пользователям.
export type SystemMessageAudience =
  { kind: 'all' } | { kind: 'role'; roleId: string } | { kind: 'users'; userIds: string[] };

export interface SystemMessageContent {
  title: string;
  message: string;
  /// Внутренний путь `/…` или `https://…`.
  link?: string | null;
}

/// `POST /admin/communications/messages` — личное системное сообщение.
export interface SendSystemMessageRequest extends SystemMessageContent {
  userId: string;
}

export interface SendSystemMessageResult {
  id: string;
}

/// `POST /admin/communications/messages/bulk/preview`.
export interface BulkSystemMessagePreviewRequest {
  audience: SystemMessageAudience;
}

export interface BulkSystemMessagePreview {
  recipients: number;
}

/// `POST /admin/communications/messages/bulk` — `confirmCount` должен совпасть
/// с числом получателей на момент отправки (иначе 409 — аудитория изменилась).
export interface BulkSystemMessageRequest extends SystemMessageContent {
  audience: SystemMessageAudience;
  confirmCount: number;
}

export interface BulkSystemMessageResult {
  recipients: number;
  delivered: number;
}

/// `GET /admin/communications/recipients?q=` — получатель для выбора.
export interface SystemMessageRecipient {
  id: string;
  username: string;
  tag: string;
  avatar: string | null;
}
