'use client';

import type {
  MaintenanceSettingsDto,
  SiteModuleDto,
  UpdateMaintenanceRequest,
  UpdateSiteModuleRequest,
} from '@twomc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { SITE_STATUS_KEY } from '@/lib/query/client';

/// Модули сайта и техработы (ADR-0082).
const MODULES_KEY = ['admin', 'system', 'modules'] as const;
const MAINTENANCE_KEY = ['admin', 'system', 'maintenance'] as const;

export function useSiteModules(enabled = true) {
  return useQuery({
    queryKey: MODULES_KEY,
    queryFn: () => api.get<SiteModuleDto[]>('/admin/system/modules'),
    enabled,
  });
}

export function useMaintenanceSettings(enabled = true) {
  return useQuery({
    queryKey: MAINTENANCE_KEY,
    queryFn: () => api.get<MaintenanceSettingsDto>('/admin/system/maintenance'),
    enabled,
  });
}

/// После изменения — свежие админские данные и публичный статус/настройки.
function useInvalidateStatus() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: SITE_STATUS_KEY });
    void client.invalidateQueries({ queryKey: ['site', 'settings'] });
  };
}

export function useUpdateSiteModule() {
  const client = useQueryClient();
  const invalidate = useInvalidateStatus();
  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: UpdateSiteModuleRequest }) =>
      api.patch<SiteModuleDto>(`/admin/system/modules/${key}`, body),
    onSuccess: (updated) => {
      client.setQueryData<SiteModuleDto[]>(MODULES_KEY, (list) =>
        list?.map((item) => (item.key === updated.key ? updated : item)),
      );
      invalidate();
    },
  });
}

export function useUpdateMaintenance() {
  const client = useQueryClient();
  const invalidate = useInvalidateStatus();
  return useMutation({
    mutationFn: (body: UpdateMaintenanceRequest) =>
      api.put<MaintenanceSettingsDto>('/admin/system/maintenance', body),
    onSuccess: (data) => {
      client.setQueryData(MAINTENANCE_KEY, data);
      invalidate();
    },
  });
}
