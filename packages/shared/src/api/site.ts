import type { DecimalString, IsoDateString } from './common';

/// `GET /site/settings` — публичная часть SiteSettings для shell frontend.
export interface PublicSiteSettings {
  siteName: string;
  siteDescription: string | null;
  siteLogo: string | null;
  contactEmail: string | null;
  socials: {
    discord: string | null;
    vk: string | null;
    telegram: string | null;
    youtube: string | null;
  };
  registrationEnabled: boolean;
  modules: {
    chat: boolean;
    friends: boolean;
    store: boolean;
    comments: boolean;
    news: boolean;
    reports: boolean;
  };
  meta: { title: string | null; description: string | null; keywords: string[] };
  updatedAt: IsoDateString;
}

/// `GET /servers/overview` — сводка по Minecraft-серверам (реальный ping).
export interface ServerOverviewItem {
  id: string;
  slug: string;
  name: string;
  online: boolean;
  playerCount: number;
  maxPlayers: number;
  version?: string | null;
  motd?: string | null;
  latencyMs?: number | null;
}

export interface ServersOverview {
  totalServers: number;
  onlineServers: number;
  totalPlayers: number;
  servers: ServerOverviewItem[];
}

/// `GET /notifications` / `GET /notifications/unread-count`.
export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  imageUrl: string | null;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' | string;
  actionUrl: string | null;
  actionLabel: string | null;
  isRead: boolean;
  readAt: IsoDateString | null;
  createdAt: IsoDateString;
  fromUser?: { id: string; username: string; avatar?: string | null } | null;
}

export interface UnreadCountResponse {
  count: number;
}

/// `GET /store/cart` — корзина текущего пользователя с пересчётом сервером.
export interface CartItemDto {
  id: string;
  quantity: number;
  productId: string | null;
  variantId: string | null;
  bundleId: string | null;
  product?: { id: string; name: string; slug: string; price?: DecimalString; image?: string | null } | null;
  variant?: { id: string; name?: string; price?: DecimalString } | null;
  bundle?: { id: string; name: string; totalPrice?: DecimalString } | null;
}

export interface CartDto {
  id: string;
  items: CartItemDto[];
  subtotal?: DecimalString;
  total?: DecimalString;
  [key: string]: unknown;
}
