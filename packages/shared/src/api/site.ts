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
  /// Тип/категория (survival, anarchy…), описание и иконка — из карточки сервера.
  type?: string | null;
  description?: string | null;
  iconUrl?: string | null;
  /// Адрес для подключения (с портом, если он нестандартный).
  address?: string | null;
  /// Версия, заданная администрацией (ping может вернуть другую строку).
  configuredVersion?: string | null;
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
  product?: {
    id: string;
    name: string;
    slug: string;
    price?: DecimalString;
    image?: string | null;
  } | null;
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

/// Публичные DTO контента для главной (списки `GET /news/*`, `GET /events/*`,
/// `GET /store/products`). Поля — по Prisma-моделям, которые эндпоинты
/// возвращают как есть (пароль автора глобально исключён на уровне Prisma).
export type NewsCategory =
  'UPDATE' | 'EVENT' | 'GUIDE' | 'ANNOUNCEMENT' | 'PATCH_NOTES' | 'COMMUNITY' | 'OTHER';

export interface NewsListItem {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  category: NewsCategory;
  publishedAt: IsoDateString | null;
  isPinned: boolean;
  isFeatured: boolean;
  viewsCount: number;
  author?: { id: string; username: string; avatar?: string | null } | null;
}

export interface CalendarEventDto {
  id: string;
  slug: string;
  title: string;
  description: string;
  coverImage: string | null;
  category: string;
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';
  startsAt: IsoDateString;
  endsAt: IsoDateString | null;
  isAllDay: boolean;
  location: string | null;
  server: string | null;
  isFeatured: boolean;
  _count?: { participants: number };
}

export interface ProductListItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  type?: string;
  isFeatured?: boolean;
  isPopular?: boolean;
  category?: { id: string; name: string; slug: string } | null;
  variants?: { id: string; name?: string; price: DecimalString }[];
}
