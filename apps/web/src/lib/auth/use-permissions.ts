'use client';

import type { EffectivePermissions, PermissionKey } from '@twomc/shared';
import { useCallback, useMemo } from 'react';
import { checkPermissions, hasPermission, type PermissionRequirement } from './permissions';
import { useAuthStore } from './store';

export interface UsePermissionsResult {
  effective: EffectivePermissions | null;
  isSuperuser: boolean;
  has: (key: PermissionKey) => boolean;
  can: (requirement: PermissionRequirement) => boolean;
}

export function usePermissions(): UsePermissionsResult {
  const effective = useAuthStore((state) => state.user?.permissions ?? null);
  const has = useCallback((key: PermissionKey) => hasPermission(effective, key), [effective]);
  const can = useCallback(
    (requirement: PermissionRequirement) => checkPermissions(effective, requirement),
    [effective],
  );
  return useMemo(
    () => ({ effective, isSuperuser: effective?.superuser ?? false, has, can }),
    [effective, has, can],
  );
}
