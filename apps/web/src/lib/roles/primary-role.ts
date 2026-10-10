import {
  getRolePrefix,
  prefixRelativePath,
  resolvePrimaryPrefix,
  rolePrefixRelativePath,
  type PrefixDefinition,
  type RolePrefixDefinition,
} from '@twomc/shared';
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

export interface PrefixAsset extends PrefixDefinition {
  url: string;
}

/// Префикс любой категории (STAFF / MEDIA / DONATION) с абсолютным CDN URL.
export function getPrefixAsset(prefix: PrefixDefinition | null | undefined): PrefixAsset | null {
  return prefix ? { ...prefix, url: cdnUrl(prefixRelativePath(prefix)) } : null;
}

/// Один префикс возле ника (ADR-0098): роль команды с префиксом важнее
/// медиа-партнёрства, медиа — важнее доната. Донат-привилегий пока нет —
/// выдать донат-префикс нечем, поэтому сюда он не передаётся.
export function identityPrefix(
  role: Pick<DisplayableRole, 'slug'> | null | undefined,
  mediaBadges?: readonly string[] | null,
): PrefixDefinition | null {
  return resolvePrimaryPrefix({ staffSlug: role?.slug ?? null, mediaBadges });
}
