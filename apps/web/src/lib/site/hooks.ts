'use client';

import type {
  CartDto,
  NotificationDto,
  Paginated,
  PublicSiteSettings,
  ServersOverview,
  UnreadCountResponse,
} from '@twomc/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuthStore } from '../auth/store';

export const siteKeys = {
  settings: ['site', 'settings'] as const,
  serversOverview: ['site', 'servers', 'overview'] as const,
  unread: ['site', 'notifications', 'unread'] as const,
  notifications: ['site', 'notifications', 'recent'] as const,
  cart: ['site', 'cart'] as const,
};

/// Публичные настройки сайта (соцсети, e-mail, модули) — кэш 5 минут.
export function usePublicSiteSettings() {
  return useQuery({
    queryKey: siteKeys.settings,
    queryFn: () => api.get<PublicSiteSettings>('/site/settings', { auth: false }),
    staleTime: 5 * 60_000,
  });
}

/// Общий онлайн — реальный Server List Ping; обновляется каждую минуту.
export function useServersOverview() {
  return useQuery({
    queryKey: siteKeys.serversOverview,
    queryFn: () => api.get<ServersOverview>('/servers/overview', { auth: false }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

function useIsAuthenticated(): boolean {
  return useAuthStore((state) => state.status === 'authenticated');
}

export function useUnreadCount() {
  const enabled = useIsAuthenticated();
  return useQuery({
    queryKey: siteKeys.unread,
    queryFn: () => api.get<UnreadCountResponse>('/notifications/unread-count'),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useRecentNotifications(enabled: boolean) {
  const authenticated = useIsAuthenticated();
  return useQuery({
    queryKey: siteKeys.notifications,
    queryFn: () =>
      api.get<Paginated<NotificationDto>>('/notifications', { query: { page: 1, limit: 10 } }),
    enabled: enabled && authenticated,
  });
}

/// Корзина — только для авторизованных и только когда она нужна (store-зона).
export function useCart(enabled: boolean) {
  const authenticated = useIsAuthenticated();
  return useQuery({
    queryKey: siteKeys.cart,
    queryFn: () => api.get<CartDto>('/store/cart'),
    enabled: enabled && authenticated,
    staleTime: 15_000,
  });
}

export function cartCount(cart: CartDto | undefined): number {
  return cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
}
