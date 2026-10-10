import type { AccountType } from './auth';
import type { IsoDateString, PaginationQuery } from './common';
import type { RoleDto } from './roles';

export interface PositionDto {
  id: string;
  name: string;
  slug: string;
  displayName: string;
  group: string;
  color: string;
  backgroundColor: string | null;
  icon: string | null;
  priority: number;
  description: string | null;
  isVisible: boolean;
  isDefault: boolean;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export interface DepartmentDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  isActive: boolean;
  order: number;
  createdBy: string;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export interface CustomPositionDto {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  icon: string | null;
  description: string | null;
  isActive: boolean;
  createdBy: string;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

/// `GET /admin/users` — SAFE_USER_SELECT из UsersController.
export interface AdminUserListItem {
  id: string;
  shortId: number;
  tag: string;
  email: string;
  username: string;
  /// Готовый URL аватара (ADR-0088) или null.
  avatar: string | null;
  /// Уровень доступа (ADR-0062).
  accessLevel: number;
  accountType: AccountType;
  isBanned: boolean;
  isVerified: boolean;
  lastLoginAt: IsoDateString | null;
  createdAt: IsoDateString;
  position: PositionDto;
}

export interface ListUsersQuery extends PaginationQuery {
  q?: string;
}

export interface UserDepartmentDto {
  id: string;
  userId: string;
  departmentId: string;
  order: number;
  assignedBy: string | null;
  assignedAt: IsoDateString;
  department: DepartmentDto;
}

export interface UserCustomPositionDto {
  id: string;
  userId: string;
  customPositionId: string;
  assignedBy: string | null;
  assignedAt: IsoDateString;
  customPosition: CustomPositionDto;
}

export interface UserRoleDto {
  userId: string;
  roleId: string;
  assignedBy: string | null;
  assignedAt: IsoDateString;
  role: RoleDto;
}

/// `GET /admin/users/:id/full`.
export interface AdminUserFull extends AdminUserListItem {
  departments: UserDepartmentDto[];
  customPosition: UserCustomPositionDto | null;
  roles: UserRoleDto[];
}

export type BulkUserAction = 'BAN' | 'UNBAN';

export interface BulkUsersRequest {
  userIds: string[];
  action: BulkUserAction;
  reason?: string;
  /// Только для action=BAN; без значения — перманентный бан.
  durationHours?: number;
}

export interface BulkUsersResult {
  succeeded: string[];
  failed: { userId: string; reason: string }[];
}

export const USER_BADGE_TYPES = [
  'LEADERSHIP',
  'VERIFIED',
  'SUBSCRIBER_PLUS',
  'PROJECT_TEAM',
  'DEVELOPERS_TEAM',
] as const;
export type UserBadgeType = (typeof USER_BADGE_TYPES)[number];

export interface UserBadgeDto {
  id: string;
  userId: string;
  type: UserBadgeType;
  grantedBy: string | null;
  grantedAt: IsoDateString;
  expiresAt: IsoDateString | null;
  isActive: boolean;
  order: number;
}

export interface GrantBadgeRequest {
  type: UserBadgeType;
  expiresAt?: IsoDateString;
}

// --- Превью профиля (ADR-0073) ------------------------------------------------

export interface ProfileSummaryRole {
  slug: string;
  displayName: string;
  priority: number;
  color: string | null;
}

export type UserBadgeKind =
  'LEADERSHIP' | 'VERIFIED' | 'SUBSCRIBER_PLUS' | 'PROJECT_TEAM' | 'DEVELOPERS_TEAM';

export type MediaBadgeKind = 'YOUTUBE' | 'TWITCH' | 'TIKTOK';

/// `GET /users/:username/summary` — карточка превью. Нет данных — `null`
/// (никаких выдуманных значений); скрытый профиль — только `hidden: true`.
export type PublicProfileSummary =
  | { username: string; hidden: true }
  | {
      username: string;
      hidden: false;
      /// Публичный числовой ID (ADR-0003).
      shortId: number;
      tag: string;
      /// Готовые URL (ADR-0088) или null — без выдуманных картинок.
      avatar: string | null;
      banner: string | null;
      /// Выбранная декорация профиля (если активна).
      decoration: { slug: string; name: string; imageUrl: string | null } | null;
      /// Активные бейджи в порядке показа.
      badges: UserBadgeKind[];
      /// Подтверждённые медиа-бейджи.
      mediaBadges: MediaBadgeKind[];
      createdAt: string;
      system: boolean;
      banned: boolean;
      position: { displayName: string; color: string } | null;
      roles: ProfileSummaryRole[];
      online: boolean;
      currentServer: string | null;
      lastActivityAt: string | null;
      statistics: {
        playTimeMinutes: number;
        kills: number;
        deaths: number;
        killDeathRatio: number;
      } | null;
      statisticsHidden: boolean;
      friendsCount: number;
      achievementsCompleted: number;
    };
