'use client';

import { useAuthStore } from '@/lib/auth/store';
import { useNotificationsRealtime } from '@/lib/notifications/hooks';
import { formatAdminBaseTitle, useDocumentBadge } from '@/lib/site/document-badge';

/// Единственная точка title + favicon вкладки (unread из общего состояния):
///   сайт:   `twomc.su` / `(N) twomc.su`;
///   админка (`variant="admin"`): `twomc.su | A [L]` / `(N) twomc.su | A [L]`,
///   где L — уровень доступа из /auth/me (не priority роли, ADR-0062).
export function DocumentBadge({ variant = 'site' }: { variant?: 'site' | 'admin' }) {
  const accessLevel = useAuthStore((state) => state.user?.accessLevel);
  useDocumentBadge(variant === 'admin' ? formatAdminBaseTitle(accessLevel) : undefined);
  // Одно WS-подключение на вкладку: счётчик и списки обновляются мгновенно.
  useNotificationsRealtime();
  return null;
}
