import type { IsoDateString } from './common';

/// Личные сообщения (срез 2.4, ADR-0112). Участник — только публичные поля.
export interface MessageUserDto {
  id: string;
  username: string;
  tag: string;
  avatar: string | null;
}

export type ConversationType = 'DIRECT' | 'GROUP';

/// Реакции на сообщения — те же ключи, что у комментариев (иконки рисует web).
export const MESSAGE_REACTIONS = ['like', 'heart', 'laugh', 'fire', 'wow'] as const;
export type MessageReactionKey = (typeof MESSAGE_REACTIONS)[number];

export interface DirectMessageDto {
  id: string;
  conversationId: string;
  senderId: string | null;
  /// Удалённое — пустая строка и `isDeleted: true`.
  content: string;
  parentId: string | null;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: IsoDateString;
  sender?: MessageUserDto | null;
  reactions?: Array<{ userId: string; emoji: string }>;
}

/// `GET /messages/conversations` — беседы с последним сообщением и непрочитанным.
export interface ConversationSummaryDto {
  id: string;
  type: ConversationType;
  title: string | null;
  avatar: string | null;
  members: MessageUserDto[];
  lastMessage: DirectMessageDto | null;
  lastMessageAt: IsoDateString | null;
  unreadCount: number;
  isMuted: boolean;
  isArchived: boolean;
}

/// `GET /messages/conversations/:id`.
export interface ConversationDto {
  id: string;
  type: ConversationType;
  title: string | null;
  members: Array<{ userId: string; role: string; user: MessageUserDto }>;
}

export interface MessagesPage {
  items: DirectMessageDto[];
  total: number;
  page: number;
  limit: number;
}

/// `POST /messages/conversations/:id/invites` и `GET /messages/invites/:code`.
export interface GroupInviteDto {
  code: string;
  conversationId: string;
  maxUses: number | null;
  usedCount: number;
  expiresAt: IsoDateString | null;
  conversation?: { id: string; title: string | null; type: ConversationType };
}
