import type { DecimalString, IsoDateString, PaginationQuery } from './common';

// --- Dashboard ---------------------------------------------------------------

export interface AdminDashboard {
  users: {
    total: number;
    online: number;
    banned: number;
    newToday: number;
  };
  moderation: {
    pendingReports: number;
    pendingCommentReports: number;
    pendingProfileReports: number;
  };
  recentAuditLog: AuditLogEntry[];
}

// --- Audit log -----------------------------------------------------------------

export const AUDIT_LOG_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type AuditLogSeverity = (typeof AUDIT_LOG_SEVERITIES)[number];

export interface AuditLogEntry {
  id: string;
  actorId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  changes: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  severity: AuditLogSeverity;
  duration: number | null;
  createdAt: IsoDateString;
  actor: { id: string; username: string };
}

export interface ListAuditLogQuery extends PaginationQuery {
  actorId?: string;
  action?: string;
  severity?: AuditLogSeverity;
  targetType?: string;
  q?: string;
  from?: IsoDateString;
  to?: IsoDateString;
}

export interface AuditLogStats {
  total: number;
  last24h: number;
  bySeverity: Partial<Record<AuditLogSeverity, number>>;
  topActions: { action: string; count: number }[];
}

export interface ExportAuditRequest {
  action?: string;
  actorId?: string;
  severity?: AuditLogSeverity;
  dateFrom?: IsoDateString;
  dateTo?: IsoDateString;
}

// --- Broadcast -----------------------------------------------------------------

export const ANNOUNCEMENT_TYPES = ['info', 'success', 'warning', 'danger'] as const;
export type AnnouncementType = (typeof ANNOUNCEMENT_TYPES)[number];

export interface BroadcastRequest {
  title: string;
  message: string;
  type?: AnnouncementType;
  link?: string;
  isDismissible?: boolean;
  showUntil?: IsoDateString;
  /// Имя роли (`Role.name`) — только пользователям с этой ролью; без значения — всем.
  targetRole?: string;
}

export interface AnnouncementDto {
  id: string;
  title: string;
  message: string;
  type: string;
  link: string | null;
  isActive: boolean;
  isDismissible: boolean;
  showFrom: IsoDateString | null;
  showUntil: IsoDateString | null;
  targetRole: string | null;
  order: number;
  createdBy: string | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export interface BroadcastResult {
  announcement: AnnouncementDto;
  usersTargeted: number;
  delivered: number;
}

// --- Settings ------------------------------------------------------------------

/// Простые KV-настройки (`GET/PATCH /admin/settings`). PATCH — upsert
/// переданных ключей, удаление ключей API не предусматривает.
export type KvSettings = Record<string, string>;

export interface UpsertSettingsRequest {
  settings: KvSettings;
}

/// Singleton `SiteSettings` (`GET/PATCH /admin/settings/site`).
export interface SiteSettingsDto {
  id: string;
  siteName: string;
  siteDescription: string | null;
  siteLogo: string | null;
  siteFavicon: string | null;
  contactEmail: string | null;
  discordInvite: string | null;
  vkGroup: string | null;
  telegramChannel: string | null;
  youtubeChannel: string | null;
  registrationEnabled: boolean;
  registrationRequiresApproval: boolean;
  maxUsersLimit: number | null;
  autoModeration: boolean;
  profanityFilter: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string[];
  googleAnalyticsId: string | null;
  yandexMetrikaId: string | null;
  chatEnabled: boolean;
  friendsEnabled: boolean;
  storeEnabled: boolean;
  commentsEnabled: boolean;
  newsEnabled: boolean;
  reportsEnabled: boolean;
  defaultNotificationsEnabled: boolean;
  /// Поле сохраняется, механизма 2FA в проекте нет (ADR-0050).
  requireAdmin2fa: boolean;
  ipWhitelist: string[];
  updatedBy: string | null;
  updatedAt: IsoDateString;
}

/// Частичное обновление — все поля опциональны; `ipWhitelist` меняется
/// отдельным `POST /admin/security/ip-whitelist`. Nullable-поля backend
/// принимает только как строку/число (class-validator), поэтому `null`
/// здесь исключён — «очистить» означает отправить пустую строку.
export type UpdateSiteSettingsRequest = Partial<{
  [K in keyof Omit<SiteSettingsDto, 'id' | 'updatedAt' | 'updatedBy' | 'ipWhitelist'>]: Exclude<
    SiteSettingsDto[K],
    null
  >;
}>;

export interface IpWhitelistRequest {
  /// Полная замена списка.
  ips: string[];
}

// --- Персональные инструменты админа ----------------------------------------

export interface SavedFilterDto {
  id: string;
  userId: string;
  name: string;
  /// Идентификатор страницы/списка админки (`users`, `orders`, `audit-log`...).
  page: string;
  filters: Record<string, unknown>;
  isDefault: boolean;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export interface CreateSavedFilterRequest {
  name: string;
  page: string;
  filters: Record<string, unknown>;
  isDefault?: boolean;
}

export type UpdateSavedFilterRequest = Partial<CreateSavedFilterRequest>;

export interface BookmarkDto {
  id: string;
  userId: string;
  /// Внутренний путь админки (`/admin/users`) или внешний URL.
  url: string;
  title: string;
  icon: string | null;
  order: number;
  createdAt: IsoDateString;
}

export interface CreateBookmarkRequest {
  url: string;
  title: string;
  icon?: string;
}

export type UpdateBookmarkRequest = Partial<CreateBookmarkRequest>;

export interface ReorderBookmarksRequest {
  /// Полный упорядоченный список id закладок текущего админа.
  ids: string[];
}

export interface ScheduledExportDto {
  id: string;
  userId: string;
  name: string;
  page: string;
  format: string;
  filters: Record<string, unknown> | null;
  /// Cron-выражение; фактическое выполнение — PHASE 29 (ADR-0048).
  schedule: string;
  email: string | null;
  isActive: boolean;
  lastRunAt: IsoDateString | null;
  nextRunAt: IsoDateString | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export interface CreateScheduledExportRequest {
  name: string;
  page: string;
  format: string;
  filters?: Record<string, unknown>;
  schedule: string;
  email?: string;
  isActive?: boolean;
}

export type UpdateScheduledExportRequest = Partial<CreateScheduledExportRequest>;

// --- Security ------------------------------------------------------------------

/// `GET /admin/security/sessions|logins` — записи `RefreshToken` с владельцем.
export interface AdminSessionDto {
  id: string;
  userId: string;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: IsoDateString;
  createdAt: IsoDateString;
  revokedAt: IsoDateString | null;
  user: { id: string; username: string };
}

export interface UserIdFilterQuery {
  userId?: string;
}

/// `GET /admin/security/suspicious` — Redis-счётчики brute-force по IP (ADR-0049).
export interface SuspiciousIpDto {
  ip: string;
  failedAttempts: number;
  isBlocked: boolean;
  blockedTtlSeconds: number | null;
}

// --- Content / Finance ---------------------------------------------------------

export interface ContentDashboard {
  news: Record<string, number>;
  forms: Record<string, number>;
  pendingCommentReports: number;
  pendingProfileReports: number;
  pendingTicketReports: number;
  totalUsers: number;
  bannedUsers: number;
}

export interface StoreStatsOverview {
  totalOrders: number;
  completedOrders: number;
  totalRevenue: DecimalString;
  activeProducts: number;
}

/// `GET /admin/finance/overview` = `StoreStatsService.getAll()` (PHASE 17).
export interface FinanceOverview {
  overview: StoreStatsOverview;
  salesByDay: { day: IsoDateString; revenue: DecimalString; count: number }[];
  salesByCategory: { category: string; revenue: DecimalString }[];
  topProducts: { name: string; quantity: number; revenue: DecimalString }[];
  revenueByWeek: { week: IsoDateString; revenue: DecimalString }[];
}

export const ORDER_STATUSES = ['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface OrderItemDto {
  id: string;
  orderId: string;
  productId: string | null;
  variantId: string | null;
  bundleId: string | null;
  quantity: number;
  unitPrice: DecimalString;
  totalPrice: DecimalString;
  giftToUserId: string | null;
  giftMessage: string | null;
  isDelivered: boolean;
  deliveredAt: IsoDateString | null;
  product: { id: string; name: string; slug: string } | null;
  variant: { id: string; name?: string } | null;
  bundle: { id: string; name: string; slug: string } | null;
  giftToUser: { id: string; username: string } | null;
}

/// `GET /admin/orders`, `GET /admin/finance/transactions|refunds`.
export interface AdminOrderDto {
  id: string;
  orderNumber: string;
  userId: string | null;
  guestMinecraftNick: string | null;
  status: OrderStatus;
  subtotal: DecimalString;
  discountAmount: DecimalString;
  promoCodeId: string | null;
  total: DecimalString;
  paymentMethod: string | null;
  paymentId: string | null;
  paymentProvider: string | null;
  paymentWebhookVerifiedAt: IsoDateString | null;
  paidAt: IsoDateString | null;
  cancelledAt: IsoDateString | null;
  refundedAt: IsoDateString | null;
  cancelReason: string | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
  items: OrderItemDto[];
  user: { id: string; username: string; email: string } | null;
}

export interface ListAdminOrdersQuery extends PaginationQuery {
  status?: OrderStatus;
  search?: string;
  userId?: string;
  dateFrom?: IsoDateString;
  dateTo?: IsoDateString;
}

// --- CSV-экспорт ---------------------------------------------------------------

export interface ExportUsersRequest {
  q?: string;
  isBanned?: boolean;
  dateFrom?: IsoDateString;
  dateTo?: IsoDateString;
}

export interface ExportOrdersRequest {
  status?: OrderStatus;
  userId?: string;
  dateFrom?: IsoDateString;
  dateTo?: IsoDateString;
}

export const REPORT_STATUSES = [
  'PENDING',
  'IN_REVIEW',
  'WAITING_RESPONSE',
  'RESOLVED',
  'REJECTED',
  'CLOSED',
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_TYPES = [
  'PLAYER_COMPLAINT',
  'ADMIN_COMPLAINT',
  'PUNISHMENT_APPEAL',
  'TECHNICAL_ISSUE',
  'DONATION_PROBLEM',
  'OTHER',
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export interface ExportReportsRequest {
  status?: ReportStatus;
  type?: ReportType;
  dateFrom?: IsoDateString;
  dateTo?: IsoDateString;
}

export const NEWS_STATUSES = ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'] as const;
export type NewsStatus = (typeof NEWS_STATUSES)[number];

export interface ExportNewsRequest {
  status?: NewsStatus;
  dateFrom?: IsoDateString;
  dateTo?: IsoDateString;
}
