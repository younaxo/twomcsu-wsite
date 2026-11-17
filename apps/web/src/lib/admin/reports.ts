'use client';

import type {
  Paginated,
  ReportHistoryItemDto,
  ReportPriority,
  ReportStatus,
  ReportType,
  StaffListReportsQuery,
  StaffReportDetailDto,
  StaffReportListItemDto,
} from '@twomc/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Обращения для персонала (Этап 01, шаг C): очередь с фильтрами (статус, тип,
/// приоритет, ответственный, поиск), карточка — переписка, заметки, назначение,
/// статус, вердикт, блокировка, история действий. Права проверяет сервер.

export const STAFF_REPORT_TYPE_LABEL: Record<ReportType, string> = {
  PLAYER_COMPLAINT: 'Жалоба на игрока',
  ADMIN_COMPLAINT: 'Жалоба на администрацию',
  PUNISHMENT_APPEAL: 'Обжалование наказания',
  TECHNICAL_ISSUE: 'Техническая проблема',
  DONATION_PROBLEM: 'Проблема с донатом',
  OTHER: 'Другое',
};

export const REPORT_PRIORITY_LABEL: Record<ReportPriority, string> = {
  LOW: 'Низкий',
  NORMAL: 'Обычный',
  HIGH: 'Высокий',
  URGENT: 'Срочный',
};

export const REPORT_PRIORITY_TONE: Record<
  ReportPriority,
  'neutral' | 'info' | 'warning' | 'destructive'
> = {
  LOW: 'neutral',
  NORMAL: 'info',
  HIGH: 'warning',
  URGENT: 'destructive',
};

export type StaffReportSummary = StaffReportListItemDto;
export type StaffReportDetails = StaffReportDetailDto;
export type StaffReportMessage = StaffReportDetailDto['messages'][number];
export type StaffReportNote = StaffReportDetailDto['moderatorNotes'][number];

/// Поиск `q` на сервере — до 100 символов.
export const REPORT_SEARCH_MAX = 100;

/// Ответственный: `''` — любой, `me`, `unassigned` или id пользователя.
export interface StaffReportsFilter {
  status: ReportStatus | '';
  type: ReportType | '';
  priority: ReportPriority | '';
  assignedToId: string;
  q: string;
  page: number;
}

export const EMPTY_STAFF_FILTER: StaffReportsFilter = {
  status: '',
  type: '',
  priority: '',
  assignedToId: '',
  q: '',
  page: 1,
};

export const STAFF_REPORTS_LIMIT = 30;

/// Query-параметры без пустых значений; `q` обрезается и ограничивается 100 символами.
export function buildStaffReportsQuery(filter: StaffReportsFilter): StaffListReportsQuery {
  const q = filter.q.trim().slice(0, REPORT_SEARCH_MAX);
  const assignedToId = filter.assignedToId.trim();
  return {
    page: filter.page,
    limit: STAFF_REPORTS_LIMIT,
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.priority ? { priority: filter.priority } : {}),
    ...(assignedToId ? { assignedToId } : {}),
    ...(q ? { q } : {}),
  };
}

export const staffReportKeys = {
  all: ['admin', 'reports'] as const,
  list: (filter: StaffReportsFilter) => ['admin', 'reports', 'list', filter] as const,
  archived: (filter: StaffReportsFilter) => ['admin', 'reports', 'archived', filter] as const,
  one: (number: string) => ['admin', 'reports', 'one', number] as const,
  history: (number: string, page: number) => ['admin', 'reports', 'history', number, page] as const,
};

export function useStaffReports(filter: StaffReportsFilter, enabled = true) {
  return useQuery({
    queryKey: staffReportKeys.list(filter),
    queryFn: () =>
      api.get<Paginated<StaffReportSummary>>('/moderation/reports', {
        query: { ...buildStaffReportsQuery(filter) },
      }),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/// Архив: `reports.archived.view`.
export function useArchivedReports(filter: StaffReportsFilter, enabled: boolean) {
  return useQuery({
    queryKey: staffReportKeys.archived(filter),
    queryFn: () =>
      api.get<Paginated<StaffReportSummary>>('/admin/reports/archived', {
        query: { ...buildStaffReportsQuery(filter) },
      }),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useStaffReport(number: string) {
  return useQuery({
    queryKey: staffReportKeys.one(number),
    queryFn: () => api.get<StaffReportDetails>(`/reports/${encodeURIComponent(number)}`),
    retry: false,
  });
}

export const REPORT_HISTORY_LIMIT = 20;

/// Кандидат на назначение (`GET /moderation/reports/assignable-staff`, `reports.assign`).
export interface AssignableStaffMember {
  id: string;
  username: string;
  tag: string | null;
  avatar: string | null;
}

export const ASSIGNABLE_STAFF_LIMIT = 20;

/// Список сотрудников для выбора исполнителя; `q === null` — запрос не отправляется
/// (список ещё не открывали). Ошибки: 403 нет `reports.assign`, 400 неверные параметры.
export function useAssignableStaff(q: string | null) {
  return useQuery({
    queryKey: ['admin', 'reports', 'assignable-staff', q] as const,
    queryFn: () =>
      api.get<{ items: AssignableStaffMember[] }>('/moderation/reports/assignable-staff', {
        query: { q: (q ?? '').trim().slice(0, REPORT_SEARCH_MAX), limit: ASSIGNABLE_STAFF_LIMIT },
      }),
    enabled: q !== null,
    retry: false,
    placeholderData: keepPreviousData,
  });
}

/// Закреплённые заметки — первыми (сервер уже так сортирует; порядок внутри групп сохраняется).
export function sortNotesPinnedFirst(notes: StaffReportNote[]): StaffReportNote[] {
  return [...notes].sort((a, b) => Number(b.isPinned) - Number(a.isPinned));
}

/// История действий по обращению (`reports.view`).
export function useReportHistory(number: string, page: number, enabled: boolean) {
  return useQuery({
    queryKey: staffReportKeys.history(number, page),
    queryFn: () =>
      api.get<Paginated<ReportHistoryItemDto>>(
        `/moderation/reports/${encodeURIComponent(number)}/history`,
        { query: { page, limit: REPORT_HISTORY_LIMIT } },
      ),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/// Безопасное текстовое представление `changes`: только текст (React сам
/// экранирует), без HTML; длинные значения усекаются.
export function formatHistoryChanges(changes: Record<string, unknown> | null): string {
  if (!changes || Object.keys(changes).length === 0) return '';
  return Object.entries(changes)
    .map(([key, value]) => {
      const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
      return `${key}: ${text.length > 200 ? `${text.slice(0, 200)}…` : text}`;
    })
    .join('\n');
}

export function useStaffReportActions(number: string) {
  const client = useQueryClient();
  const base = `/moderation/reports/${encodeURIComponent(number)}`;
  const onSuccess = () => client.invalidateQueries({ queryKey: staffReportKeys.all });
  /// `null` — снять исполнителя. Ошибки: 404 нет исполнителя, 400 забанен/без reports.view.
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
  /// 403 — править можно только свои заметки (или при `reports.notes.edit`).
  const editNote = useMutation({
    mutationFn: ({ noteId, content }: { noteId: string; content: string }) =>
      api.patch(`${base}/notes/${encodeURIComponent(noteId)}`, { content }),
    onSuccess,
  });
  /// Закрепление — право `reports.notes.pin`, открепление — `reports.notes.unpin`.
  const pinNote = useMutation({
    mutationFn: ({ noteId, pinned }: { noteId: string; pinned: boolean }) =>
      api.patch(`${base}/notes/${encodeURIComponent(noteId)}/pin`, { pinned }),
    onSuccess,
  });
  const lock = useMutation({
    mutationFn: (body: { locked: boolean; reason?: string }) => api.post(`${base}/lock`, body),
    onSuccess,
  });
  // Скрытие и закреп сообщений, архив, запрет обращений автору.
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
    editNote,
    pinNote,
    lock,
    hideMessage,
    pinMessage,
    archive,
    banAuthor,
  };
}
