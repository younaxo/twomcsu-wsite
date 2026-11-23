'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Очереди жалоб на комментарии и профили (`GET/PATCH /admin/comment-reports`,
/// `/admin/profile-reports`). API отдаёт строки БД как есть (у жалобы на
/// профиль внутри целые записи пользователей), поэтому строка собирается по
/// белому списку полей: лишнее до разметки не доходит.

export type ContentReportStatus = 'PENDING' | 'RESOLVED' | 'REJECTED';
export type ContentReportKind = 'comment' | 'profile';

export const CONTENT_REPORT_STATUS_LABEL: Record<ContentReportStatus, string> = {
  PENDING: 'Ожидает',
  RESOLVED: 'Принята',
  REJECTED: 'Отклонена',
};

export const CONTENT_REPORT_REASON_LABEL: Record<string, string> = {
  SPAM: 'Спам',
  INAPPROPRIATE: 'Неприемлемый контент',
  INAPPROPRIATE_CONTENT: 'Неприемлемый контент',
  HARASSMENT: 'Оскорбления',
  IMPERSONATION: 'Выдача себя за другого',
  OTHER: 'Другое',
};

export interface ContentReportRow {
  id: string;
  kind: ContentReportKind;
  status: ContentReportStatus;
  reason: string;
  description: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  /// Комментарий (жалоба на комментарий).
  commentId: string | null;
  commentText: string | null;
  commentDeleted: boolean;
  /// Профиль (жалоба на профиль).
  profileId: string | null;
  profileName: string | null;
  reporterName: string | null;
}

interface RawReport {
  id?: unknown;
  status?: unknown;
  reason?: unknown;
  description?: unknown;
  reviewNote?: unknown;
  reviewedAt?: unknown;
  createdAt?: unknown;
  commentId?: unknown;
  profileId?: unknown;
  comment?: { content?: unknown; isDeleted?: unknown } | null;
  profile?: { username?: unknown } | null;
  reporter?: { username?: unknown } | null;
}

const str = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

export function toReportRow(kind: ContentReportKind, raw: RawReport): ContentReportRow {
  const status = raw.status === 'RESOLVED' || raw.status === 'REJECTED' ? raw.status : 'PENDING';
  return {
    id: String(raw.id ?? ''),
    kind,
    status,
    reason: str(raw.reason) ?? 'OTHER',
    description: str(raw.description),
    reviewNote: str(raw.reviewNote),
    reviewedAt: str(raw.reviewedAt),
    createdAt: str(raw.createdAt) ?? '',
    commentId: kind === 'comment' ? str(raw.commentId) : null,
    commentText: kind === 'comment' ? str(raw.comment?.content) : null,
    commentDeleted: kind === 'comment' && raw.comment?.isDeleted === true,
    profileId: kind === 'profile' ? str(raw.profileId) : null,
    profileName: kind === 'profile' ? str(raw.profile?.username) : null,
    reporterName: str(raw.reporter?.username),
  };
}

const PATH: Record<ContentReportKind, string> = {
  comment: '/admin/comment-reports',
  profile: '/admin/profile-reports',
};

export const contentReportKeys = {
  all: ['admin', 'content-reports'] as const,
  list: (kind: ContentReportKind, status: ContentReportStatus | 'ALL') =>
    ['admin', 'content-reports', kind, status] as const,
};

export function useContentReports(kind: ContentReportKind, status: ContentReportStatus | 'ALL') {
  return useQuery({
    queryKey: contentReportKeys.list(kind, status),
    queryFn: async ({ signal }) => {
      const raw = await api.get<RawReport[]>(PATH[kind], {
        signal,
        query: { status: status === 'ALL' ? undefined : status },
      });
      return (Array.isArray(raw) ? raw : []).map((item) => toReportRow(kind, item));
    },
  });
}

export function useReviewContentReport(kind: ContentReportKind) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      reviewNote,
    }: {
      id: string;
      status: 'RESOLVED' | 'REJECTED';
      reviewNote?: string;
    }) =>
      api.patch(`${PATH[kind]}/${encodeURIComponent(id)}`, {
        status,
        ...(reviewNote?.trim() ? { reviewNote: reviewNote.trim() } : {}),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: contentReportKeys.all }),
  });
}

/// Жёсткое удаление комментария (`POST /moderation/comments/:id/hard-delete`,
/// право `comments.hard_delete`) — необратимо.
export function useHardDeleteComment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, reason }: { commentId: string; reason?: string }) =>
      api.post(`/moderation/comments/${encodeURIComponent(commentId)}/hard-delete`, {
        ...(reason?.trim() ? { reason: reason.trim() } : {}),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: contentReportKeys.all }),
  });
}
