import type {
  AdminDashboard,
  AdminOrderDto,
  AdminSessionDto,
  AdminUserFull,
  AdminUserListItem,
  AssignRoleRequest,
  AuditLogEntry,
  AuditLogStats,
  BookmarkDto,
  BroadcastRequest,
  BroadcastResult,
  BulkUsersRequest,
  BulkUsersResult,
  ContentDashboard,
  CreateBookmarkRequest,
  CreateRoleRequest,
  CreateSavedFilterRequest,
  CreateScheduledExportRequest,
  EffectivePermissions,
  ExportAuditRequest,
  ExportNewsRequest,
  ExportOrdersRequest,
  ExportReportsRequest,
  ExportUsersRequest,
  FinanceOverview,
  GrantBadgeRequest,
  IpWhitelistRequest,
  KvSettings,
  ListAdminOrdersQuery,
  ListAuditLogQuery,
  ListUsersQuery,
  Paginated,
  PermissionDto,
  PunishmentDto,
  RoleAssignmentLogDto,
  RoleDto,
  RoleWithPermissions,
  SavedFilterDto,
  ScheduledExportDto,
  SessionSummary,
  SiteSettingsDto,
  SuspiciousIpDto,
  UpdateBookmarkRequest,
  UpdateRoleRequest,
  UpdateSavedFilterRequest,
  UpdateScheduledExportRequest,
  UpdateSiteSettingsRequest,
  UpsertSettingsRequest,
  UserBadgeDto,
  UserBadgeType,
} from '@twomc/shared';
import { api, apiFetchRaw, downloadFromResponse, type QueryParams } from '../api/client';

/// Тонкие функции над HTTP-клиентом для всех эндпоинтов админки
/// (PHASE 20 backend). Типы — из контракта `@twomc/shared`; права
/// проверяет backend, здесь только вызовы.

const toQuery = (params: object): QueryParams => params as QueryParams;

// --- Dashboard / audit / broadcast / settings ---------------------------------

export const adminApi = {
  dashboard: () => api.get<AdminDashboard>('/admin/dashboard'),

  auditLog: (query: ListAuditLogQuery) =>
    api.get<Paginated<AuditLogEntry>>('/admin/audit-log', { query: toQuery(query) }),
  auditStats: () => api.get<AuditLogStats>('/admin/audit-log/stats'),

  broadcast: (body: BroadcastRequest) => api.post<BroadcastResult>('/admin/broadcast', body),

  kvSettings: () => api.get<KvSettings>('/admin/settings'),
  upsertKvSettings: (body: UpsertSettingsRequest) => api.patch<KvSettings>('/admin/settings', body),
  siteSettings: () => api.get<SiteSettingsDto>('/admin/settings/site'),
  updateSiteSettings: (body: UpdateSiteSettingsRequest) =>
    api.patch<SiteSettingsDto>('/admin/settings/site', body),

  // --- Users -------------------------------------------------------------------

  users: (query: ListUsersQuery) =>
    api.get<Paginated<AdminUserListItem>>('/admin/users', { query: toQuery(query) }),
  user: (id: string) => api.get<AdminUserFull>(`/admin/users/${id}/full`),
  userEffectivePermissions: (id: string) =>
    api.get<EffectivePermissions>(`/admin/users/${id}/effective-permissions`),
  userBadges: (id: string) => api.get<UserBadgeDto[]>(`/admin/users/${id}/badges`),
  grantBadge: (id: string, body: GrantBadgeRequest) =>
    api.post<UserBadgeDto>(`/admin/users/${id}/badges`, body),
  revokeBadge: (id: string, type: UserBadgeType) =>
    api.delete<void>(`/admin/users/${id}/badges/${type}`, { parse: 'none' }),
  punishments: (username: string) =>
    api.get<PunishmentDto[]>(`/admin/users/${encodeURIComponent(username)}/punishments`),
  userSessions: (id: string) =>
    api.get<AdminSessionDto[]>('/admin/security/sessions', { query: { userId: id } }),
  bulkUsers: (body: BulkUsersRequest) => api.patch<BulkUsersResult>('/admin/users/bulk', body),
  assignRole: (userId: string, roleId: string, body: AssignRoleRequest) =>
    api.post<unknown>(`/admin/users/${userId}/roles/${roleId}`, body),
  revokeRole: (userId: string, roleId: string) =>
    api.delete<unknown>(`/admin/users/${userId}/roles/${roleId}`),

  // --- Roles / permissions -----------------------------------------------------

  roles: () => api.get<RoleDto[]>('/admin/roles'),
  role: (id: string) => api.get<RoleWithPermissions>(`/admin/roles/${id}`),
  roleHistory: (id: string) => api.get<RoleAssignmentLogDto[]>(`/admin/roles/${id}/history`),
  permissions: () => api.get<PermissionDto[]>('/admin/permissions'),
  createRole: (body: CreateRoleRequest) => api.post<RoleDto>('/admin/roles', body),
  updateRole: (id: string, body: UpdateRoleRequest) =>
    api.patch<RoleDto>(`/admin/roles/${id}`, body),
  deleteRole: (id: string) => api.delete<unknown>(`/admin/roles/${id}`),
  setRolePermissions: (id: string, permissionKeys: string[]) =>
    api.put<RoleWithPermissions>(`/admin/roles/${id}/permissions`, { permissionKeys }),

  // --- Security ----------------------------------------------------------------

  securitySessions: (userId?: string) =>
    api.get<AdminSessionDto[]>('/admin/security/sessions', { query: { userId } }),
  securityLogins: (userId?: string) =>
    api.get<AdminSessionDto[]>('/admin/security/logins', { query: { userId } }),
  suspicious: () => api.get<SuspiciousIpDto[]>('/admin/security/suspicious'),
  setIpWhitelist: (body: IpWhitelistRequest) =>
    api.post<SiteSettingsDto>('/admin/security/ip-whitelist', body),
  mySessions: () => api.get<SessionSummary[]>('/auth/sessions'),

  // --- Content / finance -------------------------------------------------------

  contentDashboard: () => api.get<ContentDashboard>('/admin/content/dashboard'),
  financeOverview: () => api.get<FinanceOverview>('/admin/finance/overview'),
  financeTransactions: (query: ListAdminOrdersQuery) =>
    api.get<Paginated<AdminOrderDto>>('/admin/finance/transactions', { query: toQuery(query) }),
  financeRefunds: (query: ListAdminOrdersQuery) =>
    api.get<Paginated<AdminOrderDto>>('/admin/finance/refunds', { query: toQuery(query) }),

  // --- Personal tools ----------------------------------------------------------

  savedFilters: (page?: string) =>
    api.get<SavedFilterDto[]>('/admin/saved-filters', { query: { page } }),
  createSavedFilter: (body: CreateSavedFilterRequest) =>
    api.post<SavedFilterDto>('/admin/saved-filters', body),
  updateSavedFilter: (id: string, body: UpdateSavedFilterRequest) =>
    api.patch<SavedFilterDto>(`/admin/saved-filters/${id}`, body),
  deleteSavedFilter: (id: string) => api.delete<unknown>(`/admin/saved-filters/${id}`),

  bookmarks: () => api.get<BookmarkDto[]>('/admin/bookmarks'),
  createBookmark: (body: CreateBookmarkRequest) => api.post<BookmarkDto>('/admin/bookmarks', body),
  updateBookmark: (id: string, body: UpdateBookmarkRequest) =>
    api.patch<BookmarkDto>(`/admin/bookmarks/${id}`, body),
  deleteBookmark: (id: string) => api.delete<unknown>(`/admin/bookmarks/${id}`),
  reorderBookmarks: (ids: string[]) => api.post<BookmarkDto[]>('/admin/bookmarks/reorder', { ids }),

  scheduledExports: () => api.get<ScheduledExportDto[]>('/admin/exports/scheduled'),
  createScheduledExport: (body: CreateScheduledExportRequest) =>
    api.post<ScheduledExportDto>('/admin/exports/scheduled', body),
  updateScheduledExport: (id: string, body: UpdateScheduledExportRequest) =>
    api.patch<ScheduledExportDto>(`/admin/exports/scheduled/${id}`, body),
  deleteScheduledExport: (id: string) => api.delete<unknown>(`/admin/exports/scheduled/${id}`),
};

// --- CSV-экспорт: ответ — файл, скачиваем через Blob -----------------------------

export type ExportKind = 'users' | 'orders' | 'reports' | 'news' | 'audit' | 'finance';

export type ExportRequestByKind = {
  users: ExportUsersRequest;
  orders: ExportOrdersRequest;
  reports: ExportReportsRequest;
  news: ExportNewsRequest;
  audit: ExportAuditRequest;
  finance: ExportOrdersRequest;
};

const EXPORT_PATH: Record<ExportKind, string> = {
  users: '/admin/users/export',
  orders: '/admin/orders/export',
  reports: '/admin/reports/export',
  news: '/admin/news/export',
  audit: '/admin/audit-log/export',
  finance: '/admin/finance/export',
};

export async function downloadExport<K extends ExportKind>(
  kind: K,
  body: ExportRequestByKind[K],
): Promise<void> {
  const response = await apiFetchRaw(EXPORT_PATH[kind], { method: 'POST', body });
  await downloadFromResponse(response, `${kind}-${new Date().toISOString().slice(0, 10)}.csv`);
}
