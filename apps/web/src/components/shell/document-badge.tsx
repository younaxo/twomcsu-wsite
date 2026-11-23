'use client';

import { useAuthStore } from '@/lib/auth/store';
import { useNotificationsRealtime } from '@/lib/notifications/hooks';
import { formatAdminBaseTitle, useDocumentBadge } from '@/lib/site/document-badge';
import { RouteTitle } from './page-title';

/// Единственная точка title + favicon вкладки (unread из общего состояния):
///   сайт:   `Раздел — twomc.su` / `(N) Раздел — twomc.su` (главная — `twomc.su`);
///   админка (`variant="admin"`): `Раздел — twomc.su | A [L]` / `(N) …`,
///   где L — уровень доступа из /auth/me (не priority роли, ADR-0062).
export function DocumentBadge({ variant = 'site' }: { variant?: 'site' | 'admin' }) {
  const accessLevel = useAuthStore((state) => state.user?.accessLevel);
  useDocumentBadge(variant === 'admin' ? formatAdminBaseTitle(accessLevel) : undefined);
  // Одно WS-подключение на вкладку: счётчик и списки обновляются мгновенно.
  useNotificationsRealtime();
  // Заголовок страницы по маршруту (статичные разделы); админка — PageHeader.
  return variant === 'admin' ? null : <RouteTitle />;
}
