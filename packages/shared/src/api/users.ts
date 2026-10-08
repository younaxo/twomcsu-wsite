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
