'use client';

import type {
  CreateReportRequest,
  Paginated,
  PunishmentType,
  ReportDetailDto,
  ReportListQuery,
  ReportStatus,
  ReportSummaryDto,
  ReportType,
} from '@twomc/shared';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Обращения (Этап 01, шаг C): свои обращения, создание по типу, переписка.
/// Типы DTO — из `@twomc/shared`; сервер — источник истины по правам и статусам.

export type { ReportStatus, ReportType, ReportSummaryDto, ReportDetailDto };
export type ReportMessageDto = ReportDetailDto['messages'][number];

export type ReportFormKind = 'complaint' | 'appeal' | 'donation' | 'plain';

/// Все 6 типов (в т. ч. «Проблема с донатом» — только форма обращения, без
/// покупок и платежей). `kind` определяет набор полей формы и API.
export const REPORT_TYPES: Record<
  ReportType,
  { label: string; description: string; needsTarget: boolean; kind: ReportFormKind }
> = {
  PLAYER_COMPLAINT: {
    label: 'Жалоба на игрока',
    description: 'Нарушение правил на сервере или на сайте.',
    needsTarget: true,
    kind: 'complaint',
  },
  ADMIN_COMPLAINT: {
    label: 'Жалоба на администрацию',
    description: 'Действия модератора или администратора.',
    needsTarget: true,
    kind: 'complaint',
  },
  PUNISHMENT_APPEAL: {
    label: 'Обжалование наказания',
    description: 'Не согласны с баном или мутом.',
    needsTarget: false,
    kind: 'appeal',
  },
  TECHNICAL_ISSUE: {
    label: 'Техническая проблема',
    description: 'Ошибка на сайте или сервере.',
    needsTarget: false,
    kind: 'plain',
  },
  DONATION_PROBLEM: {
    label: 'Проблема с донатом',
    description: 'Не пришла выдача или вопрос по платежу. Только обращение к администрации.',
    needsTarget: false,
    kind: 'donation',
  },
  OTHER: {
    label: 'Другое',
    description: 'Вопрос, который не подходит под остальные.',
    needsTarget: false,
    kind: 'plain',
  },
};

export const REPORT_TYPE_ORDER = Object.keys(REPORT_TYPES) as ReportType[];

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  PENDING: 'Ожидает',
  IN_REVIEW: 'На рассмотрении',
  WAITING_RESPONSE: 'Ждёт вашего ответа',
  RESOLVED: 'Решено',
  REJECTED: 'Отклонено',
  CLOSED: 'Закрыто',
};

export const FINAL_REPORT_STATUSES: ReadonlySet<ReportStatus> = new Set([
  'RESOLVED',
  'REJECTED',
  'CLOSED',
]);

export function reportTypeLabel(type: string): string {
  return type in REPORT_TYPES ? REPORT_TYPES[type as ReportType].label : 'Обращение';
}

/// Почему игрок не может писать в обращение (null — может).
export function replyBlockReason(report: {
  status: ReportStatus;
  isLocked: boolean;
  lockedReason?: string | null;
}): string | null {
  if (report.isLocked) {
    return report.lockedReason
      ? `Администрация закрыла переписку по этому обращению: ${report.lockedReason}`
      : 'Администрация закрыла переписку по этому обращению — ответить нельзя.';
  }
  if (FINAL_REPORT_STATUSES.has(report.status)) {
    return 'Обращение закрыто — ответить нельзя.';
  }
  return null;
}

/// Наказание игрока (`GET /users/me/punishments`) — для обжалования.
export interface MyPunishmentDto {
  id: string;
  punishmentType: PunishmentType;
  reason: string;
  duration: string | null;
  server: string | null;
  issuedAt: string;
  expiresAt: string | null;
  isActive: boolean;
  isAppealable?: boolean;
}

export const PUNISHMENT_TYPE_LABEL: Record<PunishmentType, string> = {
  WARN: 'Предупреждение',
  MUTE: 'Мут',
  KICK: 'Кик',
  TEMPBAN: 'Временный бан',
  PERMBAN: 'Бан навсегда',
};

/// История обращения для игрока (`GET /reports/:n/history`): без актора.
export type ReportHistoryKind = 'STATUS_CHANGED' | 'VERDICT' | 'CREATED';
export interface PlayerHistoryItemDto {
  id: string;
  kind: ReportHistoryKind;
  status: ReportStatus | null;
  createdAt: string;
}

export const HISTORY_KIND_LABEL: Record<ReportHistoryKind, string> = {
  CREATED: 'Обращение создано',
  STATUS_CHANGED: 'Статус изменён',
  VERDICT: 'Вынесено решение',
};

/// Заголовок записи истории; неизвестные kind/status не ломают список.
export function historyItemTitle(item: Pick<PlayerHistoryItemDto, 'kind' | 'status'>): string {
  const base = Object.hasOwn(HISTORY_KIND_LABEL, item.kind)
    ? HISTORY_KIND_LABEL[item.kind]
    : 'Событие';
  return item.kind === 'STATUS_CHANGED' && item.status && item.status in REPORT_STATUS_LABEL
    ? `${base}: ${REPORT_STATUS_LABEL[item.status]}`
    : base;
}

/// Значение фильтра из URL → enum или undefined (мусор игнорируется).
export function parseStatusFilter(value: string | null | undefined): ReportStatus | undefined {
  return value && Object.hasOwn(REPORT_STATUS_LABEL, value) ? (value as ReportStatus) : undefined;
}

export function parseTypeFilter(value: string | null | undefined): ReportType | undefined {
  return value && Object.hasOwn(REPORT_TYPES, value) ? (value as ReportType) : undefined;
}

export const supportKeys = {
  all: ['support'] as const,
  history: (number: string) => ['support', 'history', number] as const,
  mine: (query: ReportListQuery) => ['support', 'mine', query] as const,
  one: (number: string) => ['support', 'one', number] as const,
};

/// Тот же ключ, что у «Настройки → Наказания»: общий кэш.
export const myPunishmentsKey = ['account', 'punishments'] as const;

export function useMyPunishments(enabled = true) {
  return useQuery({
    queryKey: myPunishmentsKey,
    queryFn: () => api.get<MyPunishmentDto[]>('/users/me/punishments'),
    enabled,
  });
}

export function useMyReports(query: ReportListQuery = {}) {
  return useQuery({
    queryKey: supportKeys.mine(query),
    queryFn: () => api.get<Paginated<ReportSummaryDto>>('/reports', { query: { ...query } }),
    placeholderData: keepPreviousData,
  });
}

export function useReport(number: string) {
  return useQuery({
    queryKey: supportKeys.one(number),
    queryFn: () => api.get<ReportDetailDto>(`/reports/${encodeURIComponent(number)}`),
    retry: false,
  });
}

const HISTORY_LIMIT = 10;

export function useReportHistory(number: string) {
  return useInfiniteQuery({
    queryKey: supportKeys.history(number),
    queryFn: ({ pageParam }) =>
      api.get<Paginated<PlayerHistoryItemDto>>(`/reports/${encodeURIComponent(number)}/history`, {
        query: { page: pageParam, limit: HISTORY_LIMIT },
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
    retry: false,
  });
}

export interface DonationProblemBody {
  description: string;
  paymentDate?: string;
  contactEmail?: string;
}

export function useSupportActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: supportKeys.all });
  const create = useMutation({
    mutationFn: (body: CreateReportRequest) => api.post<{ reportNumber: string }>('/reports', body),
    onSuccess: refresh,
  });
  const createDonation = useMutation({
    mutationFn: (body: DonationProblemBody) =>
      api.post<{ reportNumber: string }>('/support/donation-problem', body),
    onSuccess: refresh,
  });
  const reply = useMutation({
    mutationFn: ({ number, content }: { number: string; content: string }) =>
      api.post(`/reports/${encodeURIComponent(number)}/messages`, { content }),
    onSuccess: refresh,
  });
  const edit = useMutation({
    mutationFn: ({
      number,
      messageId,
      content,
    }: {
      number: string;
      messageId: string;
      content: string;
    }) =>
      api.patch(
        `/reports/${encodeURIComponent(number)}/messages/${encodeURIComponent(messageId)}`,
        { content },
      ),
    onSuccess: refresh,
  });
  return { create, createDonation, reply, edit };
}
