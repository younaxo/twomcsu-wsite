import type { IsoDateString } from './common';

/// Лента активности (срез 2.6, ADR-0114).
export type ActivityVisibility = 'PUBLIC' | 'FRIENDS' | 'PRIVATE';
export const ACTIVITY_REACTIONS = ['like', 'heart', 'laugh', 'fire', 'wow'] as const;
export type ActivityReactionKey = (typeof ACTIVITY_REACTIONS)[number];

export interface ActivityUserDto {
  id: string;
  username: string;
  tag: string;
  avatar: string | null;
}

export interface ActivityDto {
  id: string;
  type: string;
  title: string;
  description: string | null;
  visibility: ActivityVisibility;
  createdAt: IsoDateString;
  user: ActivityUserDto;
  /// Для записи о дружбе — ник друга.
  friend: { username: string } | null;
  reactions: Array<{ key: ActivityReactionKey; count: number }>;
  myReaction: ActivityReactionKey | null;
  commentsCount: number;
}

export interface ActivityPage {
  items: ActivityDto[];
  total: number;
  page: number;
  limit: number;
}

export interface ActivityCommentDto {
  id: string;
  content: string;
  createdAt: IsoDateString;
  author: ActivityUserDto;
  canDelete: boolean;
}

export interface ActivityCommentsPage {
  items: ActivityCommentDto[];
  total: number;
  page: number;
  limit: number;
}

/// `GET/PATCH /activity/settings` — применяется сейчас только дружба (ADR-0114).
export interface ActivitySettingsDto {
  showFriendships: boolean;
  friendshipsVisibility: ActivityVisibility;
  notifyOnComment: boolean;
}
