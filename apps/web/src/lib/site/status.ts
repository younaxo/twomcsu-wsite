'use client';

import type { PublicSiteStatus, SiteUnavailableCode } from '@twomc/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { usePermissions } from '@/lib/auth/use-permissions';
import { SITE_STATUS_KEY } from '@/lib/query/client';

/// Публичный статус сайта (ADR-0082): техработы и выключенные модули.
/// Обновляется раз в минуту и при возврате на вкладку; любой ответ API 503
/// с кодом недоступности перечитывает его сразу (см. lib/query/client.ts).
export function useSiteStatus() {
  return useQuery({
    queryKey: SITE_STATUS_KEY,
    queryFn: () => api.get<PublicSiteStatus>('/site/status', { auth: false }),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/// Почему модуль сейчас недоступен (null — доступен) и видит ли его
/// сотрудник с правом обхода.
export function moduleUnavailability(
  status: PublicSiteStatus | undefined,
  module: string,
): SiteUnavailableCode | null {
  const maintenance = status?.maintenance;
  if (
    maintenance?.active &&
    (maintenance.scope === 'full' || (maintenance.modules ?? []).includes(module))
  ) {
    return 'MAINTENANCE';
  }
  // Неполный ответ (старый API, сбой) — считаем модуль доступным.
  return (status?.disabledModules ?? []).includes(module) ? 'MODULE_DISABLED' : null;
}

export function useModuleAvailability(module: string) {
  const status = useSiteStatus();
  const { can } = usePermissions();
  const reason = moduleUnavailability(status.data, module);
  return {
    reason,
    bypass: reason !== null && can('system.maintenance.bypass'),
    maintenance: status.data?.maintenance ?? null,
  };
}

/// Полные техработы идут прямо сейчас.
export function useFullMaintenance() {
  const status = useSiteStatus();
  const { can } = usePermissions();
  const maintenance = status.data?.maintenance;
  const active = Boolean(maintenance?.active && maintenance.scope === 'full');
  return {
    active,
    maintenance: maintenance ?? null,
    bypass: active && can('system.maintenance.bypass'),
  };
}
