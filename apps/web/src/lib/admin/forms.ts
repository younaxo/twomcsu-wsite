'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Формы в админке (срез 7.4, ADR-0149): список, публикация, закрытие,
/// копия, удаление; ответы (список, карточка, удаление) и статистика.
/// Конструктор полей — следующим срезом.

export type FormStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'ARCHIVED';

export const FORM_STATUS_LABEL: Record<FormStatus, string> = {
  DRAFT: 'Черновик',
  PUBLISHED: 'Открыта',
  CLOSED: 'Закрыта',
  ARCHIVED: 'В архиве',
};

export interface AdminFormListItem {
  id: string;
  slug: string;
  title: string;
  status: FormStatus;
  visibility: string;
  createdAt: string;
  _count: { fields: number; responses: number };
}

export interface AdminFormField {
  id: string;
  label: string;
  type: string;
  order: number;
}

export interface AdminForm extends Omit<AdminFormListItem, '_count'> {
  fields: AdminFormField[];
}

export interface FormAnswerDto {
  fieldId: string;
  textValue: string | null;
  numberValue: string | number | null;
  booleanValue: boolean | null;
  dateValue: string | null;
  jsonValue: unknown;
  fileUrls: string[];
}

export interface FormResponseDto {
  id: string;
  isAnonymous: boolean;
  isComplete: boolean;
  createdAt: string;
  completedAt: string | null;
  respondent: { id: string; username: string; tag: string } | null;
  answers: FormAnswerDto[];
}

export interface FormStatsDto {
  totalResponses: number;
  completeResponses: number;
  completionRate: number;
  maxResponses: number | null;
  fieldStats: {
    fieldId: string;
    label: string;
    answeredCount: number;
    breakdown: Record<string, number>;
  }[];
}

export interface FormInviteDto {
  id: string;
  code: string;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  createdAt: string;
}

export const adminFormKeys = {
  all: ['admin', 'forms'] as const,
  list: (status: FormStatus | '', search: string, page: number) =>
    ['admin', 'forms', 'list', status, search, page] as const,
  detail: (id: string) => ['admin', 'forms', 'detail', id] as const,
  responses: (id: string, page: number) => ['admin', 'forms', 'responses', id, page] as const,
  stats: (id: string) => ['admin', 'forms', 'stats', id] as const,
  invites: (id: string) => ['admin', 'forms', 'invites', id] as const,
};

export const ADMIN_FORMS_PAGE_SIZE = 20;
const enc = encodeURIComponent;

export function useAdminForms(status: FormStatus | '', search: string, page: number) {
  return useQuery({
    queryKey: adminFormKeys.list(status, search, page),
    queryFn: () =>
      api.get<{ items: AdminFormListItem[]; total: number }>('/admin/forms', {
        query: {
          page,
          limit: ADMIN_FORMS_PAGE_SIZE,
          ...(status ? { status } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
        },
      }),
  });
}

export function useAdminForm(id: string) {
  return useQuery({
    queryKey: adminFormKeys.detail(id),
    queryFn: () => api.get<AdminForm>(`/admin/forms/${enc(id)}`),
  });
}

export function useFormResponses(id: string, page: number, enabled: boolean) {
  return useQuery({
    queryKey: adminFormKeys.responses(id, page),
    queryFn: () =>
      api.get<{ items: FormResponseDto[]; total: number }>(`/admin/forms/${enc(id)}/responses`, {
        query: { page, limit: ADMIN_FORMS_PAGE_SIZE },
      }),
    enabled,
  });
}

export function useFormStats(id: string, enabled: boolean) {
  return useQuery({
    queryKey: adminFormKeys.stats(id),
    queryFn: () => api.get<FormStatsDto>(`/admin/forms/${enc(id)}/stats`),
    enabled,
  });
}

export function useAdminFormActions() {
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: adminFormKeys.all });
  const setStatus = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'publish' | 'close' }) =>
      api.post(`/admin/forms/${enc(id)}/${action}`),
    onSuccess,
  });
  const duplicate = useMutation({
    mutationFn: (id: string) => api.post<{ id: string }>(`/admin/forms/${enc(id)}/duplicate`),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/forms/${enc(id)}`),
    onSuccess,
  });
  const removeResponse = useMutation({
    mutationFn: ({ formId, responseId }: { formId: string; responseId: string }) =>
      api.delete(`/admin/forms/${enc(formId)}/responses/${enc(responseId)}`),
    onSuccess,
  });
  return { setStatus, duplicate, remove, removeResponse };
}

/// Значение ответа для показа: текст, число, да/нет, дата, список вариантов.
/// Файлы не открываются — хранилище в production ещё не подключено (R3).
export function answerText(answer: FormAnswerDto, formatDate: (iso: string) => string): string {
  if (answer.textValue) return answer.textValue;
  if (answer.numberValue !== null && answer.numberValue !== undefined) {
    return String(answer.numberValue);
  }
  if (answer.booleanValue !== null) return answer.booleanValue ? 'Да' : 'Нет';
  if (answer.dateValue) return formatDate(answer.dateValue);
  if (Array.isArray(answer.jsonValue)) return answer.jsonValue.map(String).join(', ');
  if (answer.jsonValue !== null && answer.jsonValue !== undefined) {
    return JSON.stringify(answer.jsonValue);
  }
  if (answer.fileUrls.length > 0) return `Файлов: ${answer.fileUrls.length}`;
  return '—';
}

/// Приглашения по ссылке (ADR-0150): код открывает форму по адресу
/// /forms/invite/:code, лимит использований и срок — по желанию.
export function useFormInvites(id: string, enabled: boolean) {
  const client = useQueryClient();
  const key = adminFormKeys.invites(id);
  const invites = useQuery({
    queryKey: key,
    queryFn: () => api.get<FormInviteDto[]>(`/admin/forms/${enc(id)}/invites`),
    enabled,
  });
  const onSuccess = () => client.invalidateQueries({ queryKey: key });
  const create = useMutation({
    mutationFn: (body: { maxUses?: number; expiresAt?: string }) =>
      api.post<FormInviteDto>(`/admin/forms/${enc(id)}/invites`, body),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (code: string) => api.delete(`/admin/forms/${enc(id)}/invites/${enc(code)}`),
    onSuccess,
  });
  return { invites, create, remove };
}
