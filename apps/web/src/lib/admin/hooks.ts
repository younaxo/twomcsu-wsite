'use client';

import type {
  AssignRoleRequest,
  BroadcastRequest,
  BulkUsersRequest,
  CreateBookmarkRequest,
  CreateRoleRequest,
  CreateSavedFilterRequest,
  CreateScheduledExportRequest,
  GrantBadgeRequest,
  ListAdminOrdersQuery,
  ListAuditLogQuery,
  ListUsersQuery,
  UpdateBookmarkRequest,
  UpdateRoleRequest,
  UpdateSavedFilterRequest,
  UpdateScheduledExportRequest,
  UpdateSiteSettingsRequest,
  UpsertSettingsRequest,
  UserBadgeType,
} from '@twomc/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../auth/store';
import { queryKeys } from '../query/keys';
import { adminApi } from './api';

/// Хуки TanStack Query для админки. Списки держат предыдущие данные при
/// смене страницы/фильтра (без мигания скелетоном), мутации инвалидируют
/// домен целиком — проще и надёжнее точечных обновлений кеша.

// --- Dashboard -------------------------------------------------------------------

export function useDashboard() {
  return useQuery({ queryKey: queryKeys.dashboard.all, queryFn: adminApi.dashboard });
}

// --- Users -----------------------------------------------------------------------

export function useUsers(params: ListUsersQuery) {
  return useQuery({
    queryKey: queryKeys.users.list(params),
    queryFn: () => adminApi.users(params),
    placeholderData: keepPreviousData,
  });
}

export function useUser(id: string) {
  return useQuery({ queryKey: queryKeys.users.detail(id), queryFn: () => adminApi.user(id) });
}

export function useUserEffectivePermissions(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.users.effectivePermissions(id),
    queryFn: () => adminApi.userEffectivePermissions(id),
    enabled,
  });
}

export function useUserBadges(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.users.badges(id),
    queryFn: () => adminApi.userBadges(id),
    enabled,
  });
}

export function useUserPunishments(username: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.users.punishments(username),
    queryFn: () => adminApi.punishments(username),
    enabled: enabled && username.length > 0,
  });
}

export function useUserSessions(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.users.sessions(id),
    queryFn: () => adminApi.userSessions(id),
    enabled,
  });
}

export function useBulkUsers() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: BulkUsersRequest) => adminApi.bulkUsers(body),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.users.all }),
  });
}

export function useGrantBadge(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: GrantBadgeRequest) => adminApi.grantBadge(userId, body),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.users.badges(userId) }),
  });
}

export function useRevokeBadge(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (type: UserBadgeType) => adminApi.revokeBadge(userId, type),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.users.badges(userId) }),
  });
}

/// После смены ролей у самого себя перечитываем /auth/me — меню и права
/// текущего пользователя обновятся без перезагрузки.
function useReloadSelfIf(userId: string) {
  const selfId = useAuthStore((state) => state.user?.id);
  const reload = useAuthStore((state) => state.reload);
  return () => (selfId === userId ? reload() : Promise.resolve(null));
}

export function useAssignRole(userId: string) {
  const client = useQueryClient();
  const reloadSelf = useReloadSelfIf(userId);
  return useMutation({
    mutationFn: ({ roleId, ...body }: AssignRoleRequest & { roleId: string }) =>
      adminApi.assignRole(userId, roleId, body),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.users.detail(userId) }),
        client.invalidateQueries({ queryKey: queryKeys.users.effectivePermissions(userId) }),
        client.invalidateQueries({ queryKey: queryKeys.roles.all }),
        reloadSelf(),
      ]);
    },
  });
}

export function useRevokeRole(userId: string) {
  const client = useQueryClient();
  const reloadSelf = useReloadSelfIf(userId);
  return useMutation({
    mutationFn: (roleId: string) => adminApi.revokeRole(userId, roleId),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.users.detail(userId) }),
        client.invalidateQueries({ queryKey: queryKeys.users.effectivePermissions(userId) }),
        client.invalidateQueries({ queryKey: queryKeys.roles.all }),
        reloadSelf(),
      ]);
    },
  });
}

// --- Roles / permissions ---------------------------------------------------------

export function useRoles(enabled = true) {
  return useQuery({ queryKey: queryKeys.roles.list, queryFn: adminApi.roles, enabled });
}

export function useRole(id: string) {
  return useQuery({ queryKey: queryKeys.roles.detail(id), queryFn: () => adminApi.role(id) });
}

export function useRoleHistory(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.roles.history(id),
    queryFn: () => adminApi.roleHistory(id),
    enabled,
  });
}

export function usePermissionsCatalog(enabled = true) {
  return useQuery({
    queryKey: queryKeys.roles.permissions,
    queryFn: adminApi.permissions,
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useCreateRole() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateRoleRequest) => adminApi.createRole(body),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.roles.all }),
  });
}

export function useUpdateRole(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateRoleRequest) => adminApi.updateRole(id, body),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.roles.all }),
  });
}

export function useDeleteRole() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.deleteRole(id),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.roles.all }),
  });
}

export function useSetRolePermissions(id: string) {
  const client = useQueryClient();
  const reload = useAuthStore((state) => state.reload);
  return useMutation({
    mutationFn: (permissionKeys: string[]) => adminApi.setRolePermissions(id, permissionKeys),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.roles.all });
      // Возможно, изменили права своей роли — обновим меню.
      await reload();
    },
  });
}

// --- Audit log -------------------------------------------------------------------

export function useAuditLog(params: ListAuditLogQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.auditLog.list(params),
    queryFn: () => adminApi.auditLog(params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useAuditStats(enabled = true) {
  return useQuery({ queryKey: queryKeys.auditLog.stats, queryFn: adminApi.auditStats, enabled });
}

// --- Broadcast / settings --------------------------------------------------------

export function useBroadcast() {
  return useMutation({ mutationFn: (body: BroadcastRequest) => adminApi.broadcast(body) });
}

export function useKvSettings(enabled = true) {
  return useQuery({ queryKey: queryKeys.settings.kv, queryFn: adminApi.kvSettings, enabled });
}

export function useUpsertKvSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UpsertSettingsRequest) => adminApi.upsertKvSettings(body),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.settings.kv }),
  });
}

export function useSiteSettings(enabled = true) {
  return useQuery({ queryKey: queryKeys.settings.site, queryFn: adminApi.siteSettings, enabled });
}

export function useUpdateSiteSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateSiteSettingsRequest) => adminApi.updateSiteSettings(body),
    onSuccess: (data) => client.setQueryData(queryKeys.settings.site, data),
  });
}

// --- Security --------------------------------------------------------------------

export function useSecuritySessions(userId?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.security.sessions({ userId: userId ?? null }),
    queryFn: () => adminApi.securitySessions(userId),
    enabled,
  });
}

export function useSecurityLogins(userId?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.security.logins({ userId: userId ?? null }),
    queryFn: () => adminApi.securityLogins(userId),
    enabled,
  });
}

export function useSuspiciousIps(enabled = true) {
  return useQuery({
    queryKey: queryKeys.security.suspicious,
    queryFn: adminApi.suspicious,
    enabled,
    refetchInterval: 30_000,
  });
}

export function useSetIpWhitelist() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ips: string[]) => adminApi.setIpWhitelist({ ips }),
    onSuccess: (data) => client.setQueryData(queryKeys.settings.site, data),
  });
}

// --- Content / finance -----------------------------------------------------------

export function useContentDashboard(enabled = true) {
  return useQuery({
    queryKey: queryKeys.content.dashboard,
    queryFn: adminApi.contentDashboard,
    enabled,
  });
}

export function useFinanceOverview(enabled = true) {
  return useQuery({
    queryKey: queryKeys.finance.overview,
    queryFn: adminApi.financeOverview,
    enabled,
  });
}

export function useFinanceTransactions(params: ListAdminOrdersQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.finance.transactions(params),
    queryFn: () => adminApi.financeTransactions(params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useFinanceRefunds(params: ListAdminOrdersQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.finance.refunds(params),
    queryFn: () => adminApi.financeRefunds(params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

// --- Personal tools --------------------------------------------------------------

export function useSavedFilters(page?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.tools.savedFilters(page),
    queryFn: () => adminApi.savedFilters(page),
    enabled,
  });
}

export function useSavedFilterMutations() {
  const client = useQueryClient();
  const invalidate = () =>
    client.invalidateQueries({ queryKey: ['admin', 'tools', 'saved-filters'] });
  const create = useMutation({
    mutationFn: (body: CreateSavedFilterRequest) => adminApi.createSavedFilter(body),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: UpdateSavedFilterRequest & { id: string }) =>
      adminApi.updateSavedFilter(id, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteSavedFilter(id),
    onSuccess: invalidate,
  });
  return { create, update, remove };
}

export function useBookmarks(enabled = true) {
  return useQuery({ queryKey: queryKeys.tools.bookmarks, queryFn: adminApi.bookmarks, enabled });
}

export function useBookmarkMutations() {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: queryKeys.tools.bookmarks });
  const create = useMutation({
    mutationFn: (body: CreateBookmarkRequest) => adminApi.createBookmark(body),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: UpdateBookmarkRequest & { id: string }) =>
      adminApi.updateBookmark(id, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteBookmark(id),
    onSuccess: invalidate,
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => adminApi.reorderBookmarks(ids),
    onSuccess: invalidate,
  });
  return { create, update, remove, reorder };
}

export function useScheduledExports(enabled = true) {
  return useQuery({
    queryKey: queryKeys.tools.scheduledExports,
    queryFn: adminApi.scheduledExports,
    enabled,
  });
}

export function useScheduledExportMutations() {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: queryKeys.tools.scheduledExports });
  const create = useMutation({
    mutationFn: (body: CreateScheduledExportRequest) => adminApi.createScheduledExport(body),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: UpdateScheduledExportRequest & { id: string }) =>
      adminApi.updateScheduledExport(id, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteScheduledExport(id),
    onSuccess: invalidate,
  });
  return { create, update, remove };
}
