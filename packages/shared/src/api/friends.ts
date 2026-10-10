import type { IsoDateString } from './common';

/// Друзья и блокировки (срез 2.1, ADR-0108). Пользователь в списках — только
/// публичные поля: никаких email, IP и настроек приватности.
export interface FriendUserDto {
  id: string;
  username: string;
  /// `ник#0000`.
  tag: string;
  avatar: string | null;
}

/// `GET /friends`.
export interface FriendDto {
  user: FriendUserDto;
  /// Когда заявка принята.
  since: IsoDateString | null;
}

/// `GET /friends/requests/incoming` (user — отправитель) и `/outgoing` (user — адресат).
export interface FriendRequestDto {
  id: string;
  createdAt: IsoDateString;
  user: FriendUserDto;
}

/// `GET /friends/blocked` — только те, кого заблокировал я.
export interface BlockedUserDto {
  user: FriendUserDto;
  blockedAt: IsoDateString;
}

/// Отношение зрителя к игроку — для кнопки на профиле. Блокировка со стороны
/// другого игрока не раскрывается: такой профиль и так скрыт (`NONE`).
export type FriendRelationStatus =
  'SELF' | 'NONE' | 'FRIENDS' | 'OUTGOING' | 'INCOMING' | 'BLOCKED';

/// `GET /friends/relation/:username`.
export interface FriendRelationDto {
  userId: string;
  status: FriendRelationStatus;
  /// id заявки для OUTGOING (отменить) и INCOMING (принять / отклонить).
  requestId: string | null;
}
