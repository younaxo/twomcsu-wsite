import type { IsoDateString } from './common';

/// Собственный профиль и приватность (`GET/PATCH /users/me/profile`).

export type ProfileVisibility = 'EVERYONE' | 'FRIENDS_ONLY' | 'NOBODY';
export type FriendRequestPolicy = 'EVERYONE' | 'FRIENDS_OF_FRIENDS' | 'NOBODY';
export type DirectMessagePolicy = 'EVERYONE' | 'FRIENDS_OF_FRIENDS' | 'FRIENDS' | 'NOBODY';
export type CommentPolicy = 'EVERYONE' | 'FRIENDS' | 'FRIENDS_OF_FRIENDS' | 'NOBODY';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';

export const SOCIAL_PLATFORMS = [
  'DISCORD',
  'TELEGRAM',
  'VK',
  'YOUTUBE',
  'TWITCH',
  'TIKTOK',
  'STEAM',
  'GITHUB',
  'WEBSITE',
] as const;
/// Discord, Telegram, VK и Steam — только реальные привязки (Connected
/// Accounts, /settings/linked-accounts, ADR-0095), не ручные ссылки.
export const CONNECTED_SOCIAL_PLATFORMS: readonly SocialPlatform[] = [
  'DISCORD',
  'TELEGRAM',
  'VK',
  'STEAM',
];
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export interface ProfileSocialLinkDto {
  platform: SocialPlatform;
  value: string;
}

export interface OwnProfileDto {
  id: string;
  shortId: number;
  username: string;
  tag: string;
  email: string;
  /// Готовые URL (ADR-0088) или null; в БД хранится ключ хранилища.
  avatar: string | null;
  banner: string | null;
  selectedDecoration: { id: string; slug: string; name: string; imageUrl: string } | null;
  statusText: string | null;
  bio: string | null;
  country: string | null;
  city: string | null;
  gender: Gender | null;
  birthDate: IsoDateString | null;
  showBirthDate: boolean;
  profileVisibility: ProfileVisibility;
  friendRequestPolicy: FriendRequestPolicy;
  directMessagePolicy: DirectMessagePolicy;
  commentPolicy: CommentPolicy;
  commentsEnabled: boolean;
  hideEmail: boolean;
  hideCountry: boolean;
  hideCity: boolean;
  hideBirthDate: boolean;
  hideGender: boolean;
  hideStatistics: boolean;
  hideSocials: boolean;
  notifyOnComment: boolean;
  notifyOnMention: boolean;
  notifyOnReply: boolean;
  notifyOnFriendRequest: boolean;
  notifyOnGift: boolean;
  notifyOnOrder: boolean;
  socialLinks: ProfileSocialLinkDto[];
  createdAt: IsoDateString;
}

/// Изменяемые поля; дата рождения — `YYYY-MM-DD`.
export type UpdateOwnProfileRequest = Partial<
  Omit<
    OwnProfileDto,
    'id' | 'username' | 'tag' | 'email' | 'avatar' | 'banner' | 'socialLinks' | 'createdAt'
  >
>;
