import type { EffectivePermissions, PermissionKey } from '@twomc/shared';

/// Требование к правам для UI-элемента/маршрута:
/// - один ключ — должен быть;
/// - массив — достаточно ЛЮБОГО из ключей (типичный случай: раздел виден, если
///   есть хотя бы один `*.view` внутри него, см. CLAUDE-DESIGN-BRIEF §2.3);
/// - объект — `anyOf` (любой) и/или `allOf` (все).
export type PermissionRequirement =
  | PermissionKey
  | readonly PermissionKey[]
  | { anyOf?: readonly PermissionKey[]; allOf?: readonly PermissionKey[] };

/// Проверка только для UX (скрыть кнопку/раздел). Источник истины — backend:
/// каждый API-вызов независимо проверяется PermissionsGuard.
export function hasPermission(
  effective: EffectivePermissions | null | undefined,
  key: PermissionKey,
): boolean {
  if (!effective) {
    return false;
  }
  if (effective.superuser) {
    return true;
  }
  return effective.permissions.includes(key);
}

export function checkPermissions(
  effective: EffectivePermissions | null | undefined,
  requirement: PermissionRequirement,
): boolean {
  if (!effective) {
    return false;
  }
  if (effective.superuser) {
    return true;
  }
  if (typeof requirement === 'string') {
    return hasPermission(effective, requirement);
  }
  if (Array.isArray(requirement)) {
    return requirement.some((key) => hasPermission(effective, key));
  }
  const { anyOf, allOf } = requirement as {
    anyOf?: readonly PermissionKey[];
    allOf?: readonly PermissionKey[];
  };
  const anyOk = !anyOf || anyOf.length === 0 || anyOf.some((key) => hasPermission(effective, key));
  const allOk = !allOf || allOf.every((key) => hasPermission(effective, key));
  return anyOk && allOk;
}

/// Плоский список ключей из требования — для текста «не хватает прав: …».
export function requirementKeys(requirement: PermissionRequirement): PermissionKey[] {
  if (typeof requirement === 'string') {
    return [requirement];
  }
  if (Array.isArray(requirement)) {
    return [...requirement];
  }
  const { anyOf = [], allOf = [] } = requirement as {
    anyOf?: readonly PermissionKey[];
    allOf?: readonly PermissionKey[];
  };
  return [...new Set([...anyOf, ...allOf])];
}
