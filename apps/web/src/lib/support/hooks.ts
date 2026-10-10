'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Обращения (срез 3.5, ADR-0120): свои обращения, создание по типу, переписка.

export type ReportType =
  'PLAYER_COMPLAINT' | 'ADMIN_COMPLAINT' | 'PUNISHMENT_APPEAL' | 'TECHNICAL_ISSUE' | 'OTHER';

export type ReportStatus =
  'PENDING' | 'IN_REVIEW' | 'WAITING_RESPONSE' | 'RESOLVED' | 'REJECTED' | 'CLOSED';

/// Типы в UI. «Проблема с донатом» — отдельно (зона доната), здесь не показывается.
export const REPORT_TYPES: Record<
  ReportType,
  { label: string; description: string; needsTarget: boolean }
> = {
  PLAYER_COMPLAINT: {
    label: 'Жалоба на игрока',
    description: 'Нарушение правил на сервере или на сайте.',
    needsTarget: true,
  },
  ADMIN_COMPLAINT: {
    label: 'Жалоба на администрацию',
    description: 'Действия модератора или администратора.',
    needsTarget: true,
  },
  PUNISHMENT_APPEAL: {
    label: 'Обжалование наказания',
    description: 'Не согласны с баном или мутом.',
    needsTarget: false,
  },
  TECHNICAL_ISSUE: {
    label: 'Техническая проблема',
    description: 'Ошибка на сайте или сервере.',
    needsTarget: false,
  },
  OTHER: {
    label: 'Другое',
    description: 'Вопрос, который не подходит под остальные.',
    needsTarget: false,
  },
};

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  PENDING: 'Ожидает',
  IN_REVIEW: 'На рассмотрении',
  WAITING_RESPONSE: 'Ждёт вашего ответа',
  RESOLVED: 'Решено',
  REJECTED: 'Отклонено',
  CLOSED: 'Закрыто',
};

export interface ReportSummaryDto {
  id: string;
  reportNumber: string;
  type: ReportType | 'DONATION_PROBLEM';
  status: ReportStatus;
  description: string;
  createdAt: string;
}

export interface ReportMessageDto {
  id: string;
  authorId: string | null;
  content: string;
  isStaff: boolean;
  isSystem: boolean;
  isDeleted: boolean;
  createdAt: string;
}

export interface ReportDetailsDto extends ReportSummaryDto {
  verdict: string | null;
  messages: ReportMessageDto[];
  targets: Array<{ id: string; username: string | null }>;
}

export const supportKeys = {
  all: ['support'] as const,
  mine: ['support', 'mine'] as const,
  one: (number: string) => ['support', 'one', number] as const,
};

export function useMyReports() {
  return useQuery({
    queryKey: supportKeys.mine,
    queryFn: () => api.get<{ items: ReportSummaryDto[] }>('/reports'),
  });
}

export function useReport(number: string) {
  return useQuery({
    queryKey: supportKeys.one(number),
    queryFn: () => api.get<ReportDetailsDto>(`/reports/${encodeURIComponent(number)}`),
    retry: false,
  });
}

export function useSupportActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: supportKeys.all });
  const create = useMutation({
    mutationFn: (body: {
      type: ReportType;
      description: string;
      targets: Array<{ username: string }>;
      server?: string;
    }) => api.post<{ reportNumber: string }>('/reports', body),
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
  return { create, reply, edit };
}
