'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { ReportStatus } from '@/lib/support/hooks';

/// Обращения для персонала (срез 7.3, ADR-0128): очередь с фильтрами и
/// карточка — переписка, заметки, назначение, статус, вердикт, блокировка.

export const STAFF_REPORT_TYPE_LABEL: Record<string, string> = {
  PLAYER_COMPLAINT: 'Жалоба на игрока',
  ADMIN_COMPLAINT: 'Жалоба на администрацию',
  PUNISHMENT_APPEAL: 'Обжалование наказания',
  TECHNICAL_ISSUE: 'Техническая проблема',
  DONATION_PROBLEM: 'Проблема с донатом',
  OTHER: 'Другое',
};

export interface StaffUser {
  id: string;
  username: string;
  tag: string | null;
  avatar: string | null;
}

export interface StaffReportSummary {
  id: string;
  reportNumber: string;
  type: string;
  status: ReportStatus;
  description: string;
  server: string | null;
  createdAt: string;
  isLocked: boolean;
  author: StaffUser | null;
  assignedTo: StaffUser | null;
  assignedToId: string | null;
  targets: Array<{ id: string; username: string | null; userId: string | null }>;
}

export interface StaffReportMessage {
  id: string;
  authorId: string | null;
  content: string;
  isStaff: boolean;
  isSystem: boolean;
  isDeleted: boolean;
  isPinned?: boolean;
  createdAt: string;
}

export interface StaffReportNote {
  id: string;
  authorId: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
}

export interface StaffReportDetails extends StaffReportSummary {
  authorId: string;
  isArchived: boolean;
  verdict: string | null;
  lockedReason: string | null;
  contactEmail: string | null;
  messages: StaffReportMessage[];
  moderatorNotes: StaffReportNote[];
}

export interface StaffReportsFilter {
  status: ReportStatus | '';
  type: string;
  page: number;
}

export const staffReportKeys = {
  all: ['admin', 'reports'] as const,
  list: (filter: StaffReportsFilter) => ['admin', 'reports', 'list', filter] as const,
  one: (number: string) => ['admin', 'reports', 'one', number] as const,
};

export function useStaffReports(filter: StaffReportsFilter) {
  return useQuery({
    queryKey: staffReportKeys.list(filter),
    queryFn: () =>
      api.get<{ items: StaffReportSummary[]; total: number; page: number; limit: number }>(
        '/moderation/reports',
        {
          query: {
            page: filter.page,
            limit: 30,
            ...(filter.status ? { status: filter.status } : {}),
            ...(filter.type ? { type: filter.type } : {}),
          },
        },
      ),
  });
}

/// Архив (срез 7.3, часть 2): `reports.archived.view`.
export function useArchivedReports(page: number, enabled: boolean) {
  return useQuery({
    queryKey: [...staffReportKeys.all, 'archived', page] as const,
    queryFn: () =>
      api.get<{ items: StaffReportSummary[]; total: number; page: number; limit: number }>(
        '/admin/reports/archived',
        { query: { page, limit: 30 } },
      ),
    enabled,
  });
}

export function useStaffReport(number: string) {
  return useQuery({
    queryKey: staffReportKeys.one(number),
    queryFn: () => api.get<StaffReportDetails>(`/reports/${encodeURIComponent(number)}`),
    retry: false,
  });
}

export function useStaffReportActions(number: string) {
  const client = useQueryClient();
  const base = `/moderation/reports/${encodeURIComponent(number)}`;
  const onSuccess = () => client.invalidateQueries({ queryKey: staffReportKeys.all });
  const assign = useMutation({
    mutationFn: (assignedToId: string | null) => api.patch(`${base}/assign`, { assignedToId }),
    onSuccess,
  });
  const status = useMutation({
    mutationFn: (value: ReportStatus) => api.patch(`${base}/status`, { status: value }),
    onSuccess,
  });
  const verdict = useMutation({
    mutationFn: (body: { verdict: string; status?: ReportStatus }) =>
      api.patch(`${base}/verdict`, body),
    onSuccess,
  });
  const message = useMutation({
    mutationFn: (content: string) => api.post(`${base}/messages`, { content }),
    onSuccess,
  });
  const note = useMutation({
    mutationFn: (content: string) => api.post(`${base}/notes`, { content }),
    onSuccess,
  });
  const lock = useMutation({
    mutationFn: (body: { locked: boolean; reason?: string }) => api.post(`${base}/lock`, body),
    onSuccess,
  });
  // Часть 2: скрытие и закреп сообщений, архив, запрет обращений автору.
  const hideMessage = useMutation({
    mutationFn: (messageId: string) =>
      api.delete(`${base}/messages/${encodeURIComponent(messageId)}`),
    onSuccess,
  });
  const pinMessage = useMutation({
    mutationFn: ({ messageId, pinned }: { messageId: string; pinned: boolean }) =>
      api.patch(
        `${base}/messages/${encodeURIComponent(messageId)}/${pinned ? 'pin' : 'unpin'}`,
        {},
      ),
    onSuccess,
  });
  const admin = `/admin/reports/${encodeURIComponent(number)}`;
  const archive = useMutation({
    mutationFn: (archived: boolean) =>
      api.post(`${admin}/${archived ? 'archive' : 'unarchive'}`, {}),
    onSuccess,
  });
  const banAuthor = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      api.post(`/admin/reports/ban/${encodeURIComponent(userId)}`, { reason }),
    onSuccess,
  });
  return {
    assign,
    status,
    verdict,
    message,
    note,
    lock,
    hideMessage,
    pinMessage,
    archive,
    banAuthor,
  };
}
