'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Формы (срез 3.6, ADR-0122): публичные формы, заполнение, черновики,
/// «Мои ответы», формы по приглашению.

export type FormFieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'RADIO'
  | 'CHECKBOX'
  | 'SELECT'
  | 'NUMBER'
  | 'DATE'
  | 'TIME'
  | 'EMAIL'
  | 'PHONE'
  | 'URL'
  | 'FILE_UPLOAD'
  | 'RATING'
  | 'COLOR_PICKER'
  | 'CODE_EDITOR'
  | 'MARKDOWN_EDITOR'
  | 'IMAGE_GALLERY'
  | 'VIDEO_URL'
  | 'SCHEDULE_PICKER'
  | 'AGREEMENT_CHECKLIST'
  | 'PLAYER_SELECTOR'
  | 'SERVER_SELECTOR'
  | 'RANK_SELECTOR'
  | 'FRIENDS_SELECTOR'
  | 'PRODUCT_SELECTOR'
  | 'ORDER_SELECTOR'
  | 'REPORT_REFERENCE'
  | 'NEWS_REFERENCE'
  | 'TOPIC_REFERENCE'
  | 'PUNISHMENT_REFERENCE'
  | 'SIGNATURE'
  | 'DATE_RANGE'
  | 'CURRENCY_AMOUNT'
  | 'STATS_DISPLAY'
  | 'ACHIEVEMENT_SELECTOR';

export interface FormFieldDto {
  id: string;
  type: FormFieldType;
  label: string;
  description: string | null;
  placeholder: string | null;
  isRequired: boolean;
  order: number;
  stepIndex: number | null;
  options: unknown;
  defaultValue: string | null;
  minValue: number | null;
  maxValue: number | null;
  minLength: number | null;
  maxLength: number | null;
  maxFiles: number | null;
  metadata: unknown;
}

export interface FormSummaryDto {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  requiresAuth: boolean;
  opensAt: string | null;
  closesAt: string | null;
  createdAt: string;
}

export interface FormDto extends FormSummaryDto {
  visibility: string;
  onePerUser: boolean;
  isAnonymous: boolean;
  requiresCaptcha: boolean;
  maxResponses: number | null;
  responsesCount: number;
  multiStep: boolean;
  thankYouMessage: string | null;
  redirectUrl: string | null;
  fields: FormFieldDto[];
}

export interface FormAnswerDto {
  fieldId: string;
  textValue: string | null;
  numberValue: number | null;
  booleanValue: boolean | null;
  dateValue: string | null;
  jsonValue: unknown;
  fileUrls: string[];
}

export interface MyFormResponseDto {
  id: string;
  formId: string;
  isComplete: boolean;
  currentStep: number | null;
  createdAt: string;
  completedAt: string | null;
  form: { id: string; slug: string; title: string };
  answers: FormAnswerDto[];
}

export type FormValues = Record<string, unknown>;

export const formsKeys = {
  all: ['forms'] as const,
  list: (signedIn: boolean) => ['forms', 'list', signedIn] as const,
  mine: ['forms', 'mine'] as const,
  one: (slug: string, signedIn: boolean) => ['forms', 'one', slug, signedIn] as const,
  invite: (code: string) => ['forms', 'invite', code] as const,
  autofill: ['forms', 'autofill'] as const,
};

export function useForms(signedIn: boolean) {
  return useQuery({
    queryKey: formsKeys.list(signedIn),
    queryFn: () => api.get<FormSummaryDto[]>('/forms'),
  });
}

export function useMyFormResponses(enabled: boolean) {
  return useQuery({
    queryKey: formsKeys.mine,
    queryFn: () => api.get<MyFormResponseDto[]>('/forms/my/responses'),
    enabled,
  });
}

export function useForm(slug: string, signedIn: boolean) {
  return useQuery({
    queryKey: formsKeys.one(slug, signedIn),
    queryFn: () => api.get<FormDto>(`/forms/${encodeURIComponent(slug)}`),
    retry: false,
  });
}

export function useInviteForm(code: string) {
  return useQuery({
    queryKey: formsKeys.invite(code),
    queryFn: () => api.get<FormDto>(`/forms/invite/${encodeURIComponent(code)}`),
    retry: false,
  });
}

export function useFormAutofill(enabled: boolean) {
  return useQuery({
    queryKey: formsKeys.autofill,
    queryFn: () => api.get<{ username: string; email: string | null }>('/forms/autofill'),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/// Пустое значение не отправляется: сервер сам проверит обязательность.
export function toAnswers(values: FormValues) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== '' && value !== null)
    .filter(([, value]) => !(Array.isArray(value) && value.length === 0))
    .map(([fieldId, value]) => ({ fieldId, value }));
}

/// Значение сохранённого ответа (черновика) — обратно в значение поля.
export function answerValue(answer: FormAnswerDto): unknown {
  if (answer.textValue !== null) return answer.textValue;
  if (answer.numberValue !== null) return answer.numberValue;
  if (answer.booleanValue !== null) return answer.booleanValue;
  if (answer.dateValue !== null) return answer.dateValue.slice(0, 10);
  if (answer.jsonValue !== null && answer.jsonValue !== undefined) return answer.jsonValue;
  return answer.fileUrls.length > 0 ? answer.fileUrls : undefined;
}

export function useFormActions(slug: string) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: formsKeys.all });
  const submit = useMutation({
    mutationFn: (body: { values: FormValues; captchaToken?: string; inviteCode?: string }) =>
      api.post<{ id: string }>(`/forms/${encodeURIComponent(slug)}/responses`, {
        answers: toAnswers(body.values),
        ...(body.captchaToken ? { captchaToken: body.captchaToken } : {}),
        ...(body.inviteCode ? { inviteCode: body.inviteCode } : {}),
      }),
    onSuccess: refresh,
  });
  const saveDraft = useMutation({
    mutationFn: (body: { values: FormValues; currentStep: number; inviteCode?: string }) =>
      api.post(`/forms/${encodeURIComponent(slug)}/responses/save-draft`, {
        answers: toAnswers(body.values),
        currentStep: body.currentStep,
        ...(body.inviteCode ? { inviteCode: body.inviteCode } : {}),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: formsKeys.mine }),
  });
  return { submit, saveDraft };
}
