import { getRolePrefix, rolePrefixRelativePath, type RolePrefixDefinition } from '@twomc/shared';
import { cdnUrl } from '../env';

/// Минимум, который нужен для отображения роли: slug (ключ префикса),
/// приоритет (иерархия из backend) и подпись. Подходит и `MeRole`, и
/// `RoleDto`, и `UserRoleDto.role`.
export interface DisplayableRole {
  slug: string;
  priority: number;
  displayName: string;
  color?: string | null;
}

/// Основная роль пользователя для отображения рядом с ником: роль с самым
/// высоким `priority`, у которой есть графический префикс; если ни у одной
/// нет — просто самая старшая роль. Иерархия (priority) определяется backend
/// (PermissionService), здесь только выбор, что показать — не права.
export function pickPrimaryRole<T extends DisplayableRole>(roles: readonly T[]): T | null {
  if (roles.length === 0) {
    return null;
  }
  const sorted = roles.toSorted((a, b) => b.priority - a.priority);
  return sorted.find((role) => getRolePrefix(role.slug) !== null) ?? sorted[0];
}

export interface RolePrefixAsset extends RolePrefixDefinition {
  url: string;
}

/// Описание PNG-префикса роли с абсолютным CDN URL, либо null — роль без
/// графического префикса (обычные/донатные роли, неизвестный slug).
export function getRolePrefixAsset(slug: string | null | undefined): RolePrefixAsset | null {
  const definition = getRolePrefix(slug);
  if (!definition) {
    return null;
  }
  return { ...definition, url: cdnUrl(rolePrefixRelativePath(definition.slug)) };
}
