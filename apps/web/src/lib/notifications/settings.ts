'use client';

import type {
  NotificationSettingsDto,
  PushDeviceDto,
  UpdateNotificationSettingsRequest,
  VapidKeyResponse,
} from '@twomc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/store';

/// Настройки уведомлений и устройства push (ADR-0097) — один источник для
/// «Настройки → Уведомления», realtime-тостов, звука и onboarding.

export const notificationSettingsKeys = {
  settings: ['notifications', 'settings'] as const,
  devices: ['notifications', 'push-devices'] as const,
  vapid: ['notifications', 'vapid'] as const,
};

export const MESSAGE_TYPE = 'MESSAGE_RECEIVED';

export function messagesEnabled(settings: NotificationSettingsDto | undefined): boolean {
  return settings?.typeSettings?.[MESSAGE_TYPE] !== false;
}

export function useNotificationSettings() {
  const authenticated = useAuthStore((state) => state.status === 'authenticated');
  return useQuery({
    queryKey: notificationSettingsKeys.settings,
    queryFn: () => api.get<NotificationSettingsDto>('/notifications/settings'),
    enabled: authenticated,
    staleTime: 60_000,
  });
}

export function useUpdateNotificationSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateNotificationSettingsRequest) =>
      api.patch<NotificationSettingsDto>('/notifications/settings', body),
    onSuccess: (data) => client.setQueryData(notificationSettingsKeys.settings, data),
  });
}

export function useSetTypeEnabled() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ type, enabled }: { type: string; enabled: boolean }) =>
      api.patch<NotificationSettingsDto>(`/notifications/settings/type/${type}`, { enabled }),
    onSuccess: (data) => client.setQueryData(notificationSettingsKeys.settings, data),
  });
}

export function useVapidKey() {
  const authenticated = useAuthStore((state) => state.status === 'authenticated');
  return useQuery({
    queryKey: notificationSettingsKeys.vapid,
    queryFn: () => api.get<VapidKeyResponse>('/notifications/push/vapid-key'),
    enabled: authenticated,
    staleTime: 10 * 60_000,
  });
}

export function usePushDevices(enabled = true) {
  const authenticated = useAuthStore((state) => state.status === 'authenticated');
  return useQuery({
    queryKey: notificationSettingsKeys.devices,
    queryFn: () => api.get<PushDeviceDto[]>('/notifications/push/subscriptions'),
    enabled: authenticated && enabled,
  });
}

export function useRemovePushDevice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/notifications/push/subscribe/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: notificationSettingsKeys.devices }),
  });
}
