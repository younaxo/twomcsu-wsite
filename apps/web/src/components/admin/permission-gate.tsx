'use client';

import type { ReactNode } from 'react';
import { ForbiddenState } from '@/components/ui/error-state';
import { requirementKeys, type PermissionRequirement } from '@/lib/auth/permissions';
import { usePermissions } from '@/lib/auth/use-permissions';

export interface PermissionGateProps {
  requirement: PermissionRequirement;
  children: ReactNode;
  /// Что показать без прав: по умолчанию — экран 403 с перечнем ключей;
  /// `null` — ничего (скрыть кнопку/блок).
  fallback?: ReactNode | null;
  /// Заголовок/описание для экрана 403 (fallback по умолчанию).
  title?: ReactNode;
  description?: ReactNode;
}

/// Permission-aware UI: показывает детей, только если у текущего
/// пользователя есть требуемые права. Для кнопок — `fallback={null}`,
/// для страниц — ForbiddenState по умолчанию. Backend проверяет сам.
export function PermissionGate({
  requirement,
  children,
  fallback,
  title,
  description,
}: PermissionGateProps) {
  const { can } = usePermissions();
  if (can(requirement)) {
    return children;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  return (
    <ForbiddenState
      requiredPermissions={requirementKeys(requirement)}
      title={title}
      description={description}
    />
  );
}

/// Условный рендер без разметки 403 — для кнопок, пунктов меню, колонок.
export function Can({
  requirement,
  children,
}: {
  requirement: PermissionRequirement;
  children: ReactNode;
}) {
  const { can } = usePermissions();
  return can(requirement) ? children : null;
}
