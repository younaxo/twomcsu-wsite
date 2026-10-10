import type { IsoDateString } from './common';

/// Общий чат (срез 2.5, ADR-0113).
export interface ChatChannelDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isReadOnly: boolean;
  slowMode: number | null;
}

export interface ChatMessageDto {
  id: string;
  channelId: string;
  content: string;
  isPinned: boolean;
  isEdited: boolean;
  createdAt: IsoDateString;
  author: { id: string; username: string; tag: string; avatar: string | null } | null;
}

export interface ChatMessagesPage {
  items: ChatMessageDto[];
  total: number;
  page: number;
  limit: number;
}

/// `GET /chat/channels/:slug/online`.
export interface ChatOnlineDto {
  userIds: string[];
  count: number;
}
