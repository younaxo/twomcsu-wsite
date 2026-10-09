import type { IsoDateString } from './common';

export type PermissionEffect = 'ALLOW' | 'DENY';

export interface RoleDto {
  id: string;
  name: string;
  slug: string;
  displayName: string;
  priority: number;
  color: string | null;
  isSystem: boolean;
  isSuperuser: boolean;
  isAssignable: boolean;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export interface PermissionDto {
  id: string;
  key: string;
  module: string;
  description: string;
  createdAt: IsoDateString;
}

export interface RolePermissionDto {
  roleId: string;
  permissionId: string;
  effect: PermissionEffect;
  createdAt: IsoDateString;
  permission: PermissionDto;
}

/// `GET /admin/roles/:id`, `PUT /admin/roles/:id/permissions`.
export interface RoleWithPermissions extends RoleDto {
  permissions: RolePermissionDto[];
}

export interface CreateRoleRequest {
  name: string;
  slug: string;
  displayName: string;
  priority: number;
  color?: string;
  isAssignable?: boolean;
}

export interface UpdateRoleRequest {
  displayName?: string;
  priority?: number;
  color?: string;
  isAssignable?: boolean;
}

export interface SetRolePermissionsRequest {
  permissionKeys: string[];
}

export type RoleAssignmentAction = 'GRANTED' | 'REVOKED';

/// `GET /admin/roles/:id/history`.
export interface RoleAssignmentLogDto {
  id: string;
  userId: string;
  roleId: string;
  action: RoleAssignmentAction;
  actorId: string;
  reason: string | null;
  createdAt: IsoDateString;
}

export interface AssignRoleRequest {
  reason?: string;
}

/// `POST /admin/roles/bulk/permissions` (ADR-0068): add/remove по умолчанию,
/// replace — только с `confirmReplace: true`. Операция атомарна.
export interface BulkRolePermissionsRequest {
  roleIds: string[];
  add?: string[];
  remove?: string[];
  replace?: string[];
  confirmReplace?: boolean;
}

export interface BulkRolePermissionsResult {
  updated: { id: string; name: string; added: string[]; removed: string[] }[];
}
