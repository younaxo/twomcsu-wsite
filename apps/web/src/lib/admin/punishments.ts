'use client';

import type {
  PunishmentKind,
  PunishmentStaffStatus,
  StaffPunishment,
  StaffPunishmentListResponse,
} from '@twomc/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Админ-список наказаний сервера (`GET /admin/punishments`, право
/// `users.punishments`). Q31: IP и контакты не показываются никогда, выдавший
/// скрыт по умолчанию. Строка собирается явно по белому списку полей: всё
/// лишнее в ответе (IP, uuid, контакты, служебные id) до разметки не доходит.

export interface AdminPunishmentRow {
  ref: string;
  kind: PunishmentKind;
  status: PunishmentStaffStatus;
  subjectName: string | null;
  reason: string | null;
  reasonMasked: boolean;
  ipBan: boolean;
  silent: boolean;
  permanent: boolean;
  startedAt: string;
  until: string | null;
  removedAt: string | null;
  /// Выдавший: показывается только по явному действию «Показать».
  executor: string | null;
  /// Принудительно скрыт (Q63 п.3): имя не раскрывается даже персоналу в этом списке.
  issuerHidden: boolean;
}

export interface AdminPunishmentFilters {
  kind: PunishmentKind | 'ALL';
  status: PunishmentStaffStatus | 'ALL';
  name: string;
}

export const ADMIN_PUNISHMENTS_LIMIT = 25;

export const ADMIN_KIND_LABELS: Record<PunishmentKind, string> = {
  BAN: 'Бан',
  MUTE: 'Мут',
  WARN: 'Предупреждение',
  KICK: 'Кик',
};

export const ADMIN_STATUS_LABELS: Record<PunishmentStaffStatus, string> = {
  ACTIVE: 'Действует',
  EXPIRED: 'Истёк',
  REMOVED: 'Снят',
  DELETED_AT_SOURCE: 'Удалён в источнике',
};

export const ADMIN_NAME_PATTERN = /^[A-Za-z0-9_.]{3,16}$/;

export function toAdminRow(item: StaffPunishment): AdminPunishmentRow {
  const actor = item.executor;
  const executor = !actor ? null : actor.console ? 'Консоль' : (actor.name ?? null);
  return {
    ref: item.ref,
    kind: item.kind,
    status: item.status,
    subjectName: item.subjectName,
    reason: item.reason,
    reasonMasked: item.reasonMasked,
    ipBan: item.ipBan,
    silent: item.silent,
    permanent: item.permanent,
    startedAt: item.startedAt,
    until: item.until,
    removedAt: item.removedAt,
    executor: item.issuerHidden ? null : executor,
    issuerHidden: item.issuerHidden,
  };
}

export const adminPunishmentKeys = {
  list: (filters: AdminPunishmentFilters) => ['admin', 'punishments', filters] as const,
};

export function useAdminPunishments(filters: AdminPunishmentFilters) {
  return useInfiniteQuery({
    queryKey: adminPunishmentKeys.list(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const raw = await api.get<StaffPunishmentListResponse>('/admin/punishments', {
        signal,
        query: {
          kind: filters.kind === 'ALL' ? undefined : filters.kind,
          status: filters.status === 'ALL' ? undefined : filters.status,
          name: filters.name || undefined,
          order: 'desc',
          limit: ADMIN_PUNISHMENTS_LIMIT,
          cursor: pageParam,
        },
      });
      return {
        items: (raw.items ?? []).map(toAdminRow),
        nextCursor: raw.nextCursor ?? null,
        stale: raw.meta?.stale === true,
      };
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
