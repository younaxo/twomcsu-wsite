'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { adminFormKeys, type AdminForm } from '@/lib/admin/forms';
import type { FormFieldDto, FormFieldType } from '@/lib/forms/hooks';

/// Конструктор форм в админке: черновик полей, проверка перед отправкой,
/// сборка тела `POST /admin/forms` и `PATCH /admin/forms/:id`. Правка полей
/// пересоздаёт их на сервере, поэтому служебные свойства существующих полей
/// (проверки, пределы, условная логика) сохраняются как есть, а у формы с
/// ответами поля не отправляются вовсе (API вернул бы 409, ADR-0152).

export const FIELD_TYPE_LABEL: Record<FormFieldType, string> = {
  TEXT: 'Короткий текст',
  TEXTAREA: 'Длинный текст',
  RADIO: 'Один из списка (кнопки)',
  CHECKBOX: 'Несколько из списка',
  SELECT: 'Один из списка (меню)',
  NUMBER: 'Число',
  DATE: 'Дата',
  TIME: 'Время',
  EMAIL: 'Email',
  PHONE: 'Телефон',
  URL: 'Ссылка',
  FILE_UPLOAD: 'Файл',
  RATING: 'Оценка',
  COLOR_PICKER: 'Цвет',
  CODE_EDITOR: 'Код',
  MARKDOWN_EDITOR: 'Текст с разметкой',
  IMAGE_GALLERY: 'Изображения',
  VIDEO_URL: 'Ссылка на видео',
  SCHEDULE_PICKER: 'Дата и время',
  AGREEMENT_CHECKLIST: 'Согласие с пунктами',
  PLAYER_SELECTOR: 'Ник игрока',
  SERVER_SELECTOR: 'Сервер',
  RANK_SELECTOR: 'Ранг',
  FRIENDS_SELECTOR: 'Друг',
  PRODUCT_SELECTOR: 'Товар',
  ORDER_SELECTOR: 'Заказ',
  REPORT_REFERENCE: 'Номер обращения',
  NEWS_REFERENCE: 'Новость',
  TOPIC_REFERENCE: 'Тема',
  PUNISHMENT_REFERENCE: 'Номер наказания',
  SIGNATURE: 'Подпись',
  DATE_RANGE: 'Период',
  CURRENCY_AMOUNT: 'Сумма',
  STATS_DISPLAY: 'Статистика',
  ACHIEVEMENT_SELECTOR: 'Достижение',
};

export const FIELD_TYPES = Object.keys(FIELD_TYPE_LABEL) as FormFieldType[];

/// Типы, которым нужен список вариантов (API требует непустой для первых трёх).
export const CHOICE_TYPES: ReadonlySet<FormFieldType> = new Set(['RADIO', 'CHECKBOX', 'SELECT']);
export const OPTION_TYPES: ReadonlySet<FormFieldType> = new Set([
  'RADIO',
  'CHECKBOX',
  'SELECT',
  'AGREEMENT_CHECKLIST',
]);

export const VISIBILITY_LABEL: Record<string, string> = {
  PUBLIC: 'Всем',
  AUTHENTICATED: 'Вошедшим на сайт',
  HELPER_ONLY: 'Только хелперам и выше',
  MODERATOR_ONLY: 'Только модераторам и выше',
  ADMIN_ONLY: 'Только администрации',
  OWNER_ONLY: 'Только владельцу',
  INVITE_ONLY: 'По приглашению',
};

export const FIELD_LIMIT = 100;
export const SLUG_PATTERN = /^[a-z0-9-]+$/;

/// Свойства поля, которые API принимает и которые конструктор не редактирует.
const PRESERVED_KEYS = [
  'stepIndex',
  'validation',
  'conditionalLogic',
  'defaultValue',
  'minValue',
  'maxValue',
  'minLength',
  'maxLength',
  'maxFiles',
  'maxFileSize',
  'allowedMimes',
] as const;

export interface DraftField {
  /// Локальный ключ для React и порядка; на сервер не уходит.
  key: string;
  type: FormFieldType;
  label: string;
  description: string;
  placeholder: string;
  isRequired: boolean;
  /// Варианты — по одному в строке.
  optionsText: string;
  extra: Record<string, unknown>;
}

export interface DraftSettings {
  slug: string;
  title: string;
  description: string;
  visibility: string;
  requiresAuth: boolean;
  isAnonymous: boolean;
  onePerUser: boolean;
  thankYouMessage: string;
}

export interface DraftForm {
  settings: DraftSettings;
  fields: DraftField[];
}

let counter = 0;
export function newFieldKey(): string {
  counter += 1;
  return `f${counter}`;
}

export function emptyField(type: FormFieldType = 'TEXT'): DraftField {
  return {
    key: newFieldKey(),
    type,
    label: '',
    description: '',
    placeholder: '',
    isRequired: false,
    optionsText: '',
    extra: {},
  };
}

export function emptyDraft(): DraftForm {
  return {
    settings: {
      slug: '',
      title: '',
      description: '',
      visibility: 'PUBLIC',
      requiresAuth: false,
      isAnonymous: false,
      onePerUser: true,
      thankYouMessage: '',
    },
    fields: [emptyField()],
  };
}

export function optionsOf(field: DraftField): string[] {
  return field.optionsText
    .split('\n')
    .map((line) => line.trim())
    .filter((line, index, all) => line !== '' && all.indexOf(line) === index);
}

/// Форма из ответа API -> черновик. Лишние свойства отбрасываются по белому списку.
export function toDraft(form: AdminForm): DraftForm {
  const raw = form as AdminForm & Partial<DraftSettings> & { responsesCount?: number };
  const fields = [...form.fields]
    .sort((a, b) => a.order - b.order)
    .map((field): DraftField => {
      const source = field as unknown as Record<string, unknown>;
      const extra: Record<string, unknown> = {};
      for (const key of PRESERVED_KEYS) {
        const value = source[key];
        if (value !== null && value !== undefined) extra[key] = value;
      }
      const options = Array.isArray(source.options)
        ? source.options.filter((item): item is string => typeof item === 'string')
        : [];
      return {
        key: newFieldKey(),
        type: field.type as FormFieldType,
        label: field.label,
        description: typeof source.description === 'string' ? source.description : '',
        placeholder: typeof source.placeholder === 'string' ? source.placeholder : '',
        isRequired: source.isRequired === true,
        optionsText: options.join('\n'),
        extra,
      };
    });
  return {
    settings: {
      slug: form.slug,
      title: form.title,
      description: typeof raw.description === 'string' ? raw.description : '',
      visibility: form.visibility,
      requiresAuth: raw.requiresAuth === true,
      isAnonymous: raw.isAnonymous === true,
      onePerUser: raw.onePerUser !== false,
      thankYouMessage: typeof raw.thankYouMessage === 'string' ? raw.thankYouMessage : '',
    },
    fields: fields.length > 0 ? fields : [emptyField()],
  };
}

export type BuilderErrors = {
  title?: string;
  slug?: string;
  fields?: string;
  /// Ошибки по ключу поля.
  byField: Record<string, string>;
};

export function validateDraft(draft: DraftForm, mode: 'create' | 'edit'): BuilderErrors {
  const errors: BuilderErrors = { byField: {} };
  if (!draft.settings.title.trim()) errors.title = 'Введите название';
  if (mode === 'create' && !SLUG_PATTERN.test(draft.settings.slug)) {
    errors.slug = 'Только строчные латинские буквы, цифры и дефис';
  }
  if (draft.fields.length === 0) errors.fields = 'Добавьте хотя бы одно поле';
  if (draft.fields.length > FIELD_LIMIT) errors.fields = `Не больше ${FIELD_LIMIT} полей`;
  for (const field of draft.fields) {
    if (!field.label.trim()) {
      errors.byField[field.key] = 'Введите вопрос';
    } else if (CHOICE_TYPES.has(field.type) && optionsOf(field).length === 0) {
      errors.byField[field.key] = 'Добавьте хотя бы один вариант';
    }
  }
  return errors;
}

export function hasErrors(errors: BuilderErrors): boolean {
  return (
    Boolean(errors.title) ||
    Boolean(errors.slug) ||
    Boolean(errors.fields) ||
    Object.keys(errors.byField).length > 0
  );
}

export function fieldPayload(field: DraftField, index: number): Record<string, unknown> {
  const options = optionsOf(field);
  return {
    ...field.extra,
    type: field.type,
    label: field.label.trim(),
    ...(field.description.trim() ? { description: field.description.trim() } : {}),
    ...(field.placeholder.trim() ? { placeholder: field.placeholder.trim() } : {}),
    isRequired: field.isRequired,
    order: index,
    ...(OPTION_TYPES.has(field.type) && options.length > 0 ? { options } : {}),
  };
}

export function settingsPayload(settings: DraftSettings) {
  return {
    title: settings.title.trim(),
    description: settings.description.trim(),
    visibility: settings.visibility,
    requiresAuth: settings.requiresAuth,
    isAnonymous: settings.isAnonymous,
    onePerUser: settings.onePerUser,
    thankYouMessage: settings.thankYouMessage.trim(),
  };
}

export function createPayload(draft: DraftForm) {
  return {
    slug: draft.settings.slug,
    ...settingsPayload(draft.settings),
    fields: draft.fields.map(fieldPayload),
  };
}

/// `withFields = false` — у формы есть ответы: правятся только настройки.
export function updatePayload(draft: DraftForm, withFields: boolean) {
  return {
    ...settingsPayload(draft.settings),
    ...(withFields ? { fields: draft.fields.map(fieldPayload) } : {}),
  };
}

/// Поле конструктора -> то, что ждёт публичный рендер поля (для предпросмотра).
export function toPreviewField(field: DraftField, index: number): FormFieldDto {
  const options = optionsOf(field);
  return {
    id: field.key,
    type: field.type,
    label: field.label.trim() || 'Без названия',
    description: field.description.trim() || null,
    placeholder: field.placeholder.trim() || null,
    isRequired: field.isRequired,
    order: index,
    stepIndex: null,
    options: OPTION_TYPES.has(field.type) ? options : null,
    defaultValue: null,
    minValue: null,
    maxValue: null,
    minLength: null,
    maxLength: null,
    maxFiles: null,
    metadata: null,
  };
}

export function useCreateForm() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (draft: DraftForm) =>
      api.post<{ id: string }>('/admin/forms', createPayload(draft)),
    onSuccess: () => client.invalidateQueries({ queryKey: adminFormKeys.all }),
  });
}

export function useUpdateForm(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ draft, withFields }: { draft: DraftForm; withFields: boolean }) =>
      api.patch(`/admin/forms/${encodeURIComponent(id)}`, updatePayload(draft, withFields)),
    onSuccess: () => client.invalidateQueries({ queryKey: adminFormKeys.all }),
  });
}

/// Сколько ответов уже получено: при `> 0` поля менять нельзя (ADR-0152).
export function responsesCountOf(form: AdminForm): number {
  const value = (form as AdminForm & { responsesCount?: unknown }).responsesCount;
  return typeof value === 'number' ? value : 0;
}
