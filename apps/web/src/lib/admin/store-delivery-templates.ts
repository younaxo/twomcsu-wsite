'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';

/// Админка магазина, слой 0 / подэтап 0.11: шаблоны игровых команд выдачи.
/// Контракт — delivery-templates-admin.controller.ts и command-template.ts
/// (ADR-0189). Право `store.delivery.templates.manage`; запись требует свежий
/// код 2FA (TOTP) в теле. Клиентская проверка только подсказывает: окончательно
/// шаблон проверяет сервер. Команда отсюда никогда не отправляется на сервер игры.

export const TEMPLATE_MAX_LENGTH = 200;
export const TEMPLATE_VARIABLES = ['username', 'duration'] as const;
export const MAX_VARIABLE_USES = 4;
export const ROOT_MAX_LENGTH = 32;
export const EXTRA_ROOTS_MAX = 30;
export const TWO_FACTOR_MIN = 6;
export const TWO_FACTOR_MAX = 8;
export const PREVIEW_DEFAULT_USERNAME = 'TestPlayer';

const LITERAL_RE = /^[A-Za-z0-9_ .:,+-]*$/;
const VARIABLE_RE = /\{([^{}]*)\}/g;
const ROOT_RE = /^[a-z0-9_-]{1,32}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

/// Ответ GET /admin/store/delivery-templates/roots.
export interface CommandRoots {
  defaults: string[];
  forbidden: string[];
  extra: string[];
}

/// Строка GET /admin/store/delivery-templates (Prisma DeliveryCommandTemplate).
export interface DeliveryTemplate {
  id: string;
  productId: string;
  variantId: string | null;
  scopeKey: string;
  template: string;
  version: number;
  updatedBy?: string | null;
  updatedAt?: string;
}

/// Русские тексты машинных кодов сервера (TemplateErrorCode и коды 2FA).
export const TEMPLATE_ERROR_TEXT: Record<string, string> = {
  template_empty: 'Шаблон не может быть пустым.',
  template_too_long: `Шаблон длиннее ${TEMPLATE_MAX_LENGTH} символов.`,
  template_control_chars: 'В шаблоне нельзя использовать переводы строк и управляющие символы.',
  template_forbidden_chars:
    'В шаблоне недопустимые символы. Разрешены латиница, цифры, пробел и _ - . : , +',
  template_unknown_variable:
    'В шаблоне неизвестная переменная. Разрешены только {username} и {duration}.',
  template_username_required: 'В шаблоне должна быть переменная {username}.',
  template_too_many_variables: `Каждая переменная может встречаться не более ${MAX_VARIABLE_USES} раз.`,
  template_leading_slash: 'Шаблон не должен начинаться с «/».',
  invalid_nick: 'Тестовый ник не подходит: используйте допустимый игровой ник.',
  invalid_duration: 'Срок не подходит для подстановки в команду.',
  rendered_too_long: 'Итоговая команда получается слишком длинной. Сократите шаблон.',
  root_not_allowed: 'Первое слово команды не входит в разрешённые корни.',
  template_form_not_allowed:
    'Форма команды не из белого списка: ник только {username}, слова через один пробел, аргументы как у шаблонов плагина (например: lp user {username} parent add <группа>, give {username} <предмет> [число]).',
  root_forbidden: 'Это слово команды запрещено: опасные и служебные команды не разрешаются.',
  root_invalid: 'Корень команды: латиница в нижнем регистре, цифры, _ и -.',
  two_factor_required: 'Введите свежий код 2FA из приложения-аутентификатора.',
  two_factor_invalid: 'Неверный код 2FA. Введите актуальный код из приложения.',
  template_two_factor_locked: 'Слишком много попыток. Повторите позже.',
  unknown_setting: 'Неизвестная настройка.',
};

export interface TemplateErrorInfo {
  message: string;
  code?: string;
  /// Нужно включить 2FA в настройках аккаунта (admin_2fa_required).
  needsTwoFactorSetup: boolean;
  /// Ошибка кода 2FA (поле кода нужно очистить и вернуть в него фокус).
  twoFactorProblem: boolean;
  rateLimited: boolean;
  forbidden: boolean;
}

/// Разбор ошибки API шаблонов: машинный код -> понятный русский текст.
export function describeTemplateError(error: unknown): TemplateErrorInfo {
  const base: TemplateErrorInfo = {
    message: error instanceof Error ? error.message : 'Неизвестная ошибка',
    needsTwoFactorSetup: false,
    twoFactorProblem: false,
    rateLimited: false,
    forbidden: false,
  };
  if (!(error instanceof ApiError)) return base;
  const code = error.code;
  const info = { ...base, code };
  if (error.status === 429) {
    return {
      ...info,
      rateLimited: true,
      twoFactorProblem: true,
      message: 'Слишком много попыток. Повторите позже.',
    };
  }
  if (error.status === 403) {
    if (code === 'admin_2fa_required') {
      return {
        ...info,
        needsTwoFactorSetup: true,
        message:
          'Для действий в админке нужна двухфакторная аутентификация. Включите её в настройках аккаунта.',
      };
    }
    if (code === 'two_factor_required' || code === 'two_factor_invalid') {
      return { ...info, twoFactorProblem: true, message: TEMPLATE_ERROR_TEXT[code]! };
    }
    return { ...info, forbidden: true, message: 'Недостаточно прав для этого действия.' };
  }
  if (code && TEMPLATE_ERROR_TEXT[code]) {
    return { ...info, message: TEMPLATE_ERROR_TEXT[code]! };
  }
  if (error.status === 404) {
    return {
      ...info,
      message: 'Товар или вариант не найден: возможно, он удалён. Обновите страницу.',
    };
  }
  if (error.status === 400 || error.status === 422) {
    return { ...info, message: error.messages.join('. ') };
  }
  return { ...info, message: error.messages.join('. ') };
}

/// Предварительная проверка шаблона на клиенте (зеркало validateTemplate на API).
/// Возвращает текст ошибки или null. Сервер всё равно проверяет окончательно.
export function validateTemplateClient(
  raw: string,
  allowedRoots: readonly string[],
  forbiddenRoots: readonly string[],
): string | null {
  if (CONTROL_RE.test(raw)) return TEMPLATE_ERROR_TEXT.template_control_chars!;
  const template = raw.trim();
  if (template.length === 0) return TEMPLATE_ERROR_TEXT.template_empty!;
  if (template.length > TEMPLATE_MAX_LENGTH) return TEMPLATE_ERROR_TEXT.template_too_long!;
  if (template.startsWith('/')) return TEMPLATE_ERROR_TEXT.template_leading_slash!;
  const root = template.split(' ')[0]!.toLowerCase();
  if (forbiddenRoots.includes(root)) return `Команда «${root}» запрещена.`;
  // Пока список корней не загружен — корень проверяет только сервер.
  if (allowedRoots.length > 0 && !allowedRoots.includes(root)) {
    return `Команда «${root}» не в белом списке корней.`;
  }
  const counts: Record<string, number> = {};
  for (const match of template.matchAll(VARIABLE_RE)) {
    const name = match[1]!;
    if (!(TEMPLATE_VARIABLES as readonly string[]).includes(name)) {
      return `Неизвестная переменная {${name}}. Разрешены только {username} и {duration}.`;
    }
    counts[name] = (counts[name] ?? 0) + 1;
    if (counts[name]! > MAX_VARIABLE_USES) return TEMPLATE_ERROR_TEXT.template_too_many_variables!;
  }
  if (!LITERAL_RE.test(template.replace(VARIABLE_RE, ''))) {
    return TEMPLATE_ERROR_TEXT.template_forbidden_chars!;
  }
  if (!counts.username) return TEMPLATE_ERROR_TEXT.template_username_required!;
  return null;
}

/// Код 2FA: 6-8 цифр (резервные коды для шаблонов не принимаются).
export function validateTwoFactorCode(code: string): string | null {
  const value = code.trim();
  if (value.length === 0) return 'Введите код 2FA из приложения-аутентификатора.';
  if (!/^\d{6,8}$/.test(value)) return 'Код 2FA — от 6 до 8 цифр.';
  return null;
}

/// Список расширения корней из текста через запятую/пробел/перевод строки.
export function parseRootsInput(input: string): string[] {
  const out = new Set<string>();
  for (const part of input.split(/[\s,]+/)) {
    const root = part.trim().toLowerCase();
    if (root) out.add(root);
  }
  return [...out];
}

export function validateRootsClient(roots: string[], forbidden: readonly string[]): string | null {
  if (roots.length > EXTRA_ROOTS_MAX) return `Не более ${EXTRA_ROOTS_MAX} дополнительных корней.`;
  for (const root of roots) {
    if (!ROOT_RE.test(root)) {
      return `Корень «${root}»: латиница в нижнем регистре, цифры, _ и -, до ${ROOT_MAX_LENGTH} символов.`;
    }
    if (forbidden.includes(root)) return `Корень «${root}» запрещён.`;
  }
  return null;
}

const BASE = '/admin/store/delivery-templates';

export const deliveryTemplateKeys = {
  list: (productId: string) => ['admin', 'store', 'delivery-templates', productId] as const,
  roots: ['admin', 'store', 'delivery-templates', 'roots'] as const,
};

export function useDeliveryTemplates(productId: string, enabled = true) {
  return useQuery({
    queryKey: deliveryTemplateKeys.list(productId),
    queryFn: () => api.get<DeliveryTemplate[]>(BASE, { query: { productId } }),
    enabled,
  });
}

export function useCommandRoots(enabled = true) {
  return useQuery({
    queryKey: deliveryTemplateKeys.roots,
    queryFn: () => api.get<CommandRoots>(`${BASE}/roots`),
    enabled,
  });
}

export interface PreviewInput {
  template: string;
  username: string;
  duration: string;
}

/// Предпросмотр: подстановка без сохранения и без отправки на сервер игры.
export function usePreviewTemplate() {
  return useMutation({
    mutationFn: (body: PreviewInput) => api.post<{ command: string }>(`${BASE}/preview`, body),
  });
}

export interface SaveTemplateInput {
  productId: string;
  variantId?: string;
  template: string;
  twoFactorCode: string;
}

export function useSaveTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, ...body }: SaveTemplateInput) =>
      api.put<DeliveryTemplate>(`${BASE}/products/${encodeURIComponent(productId)}`, body),
    onSuccess: (_data, vars) =>
      client.invalidateQueries({ queryKey: deliveryTemplateKeys.list(vars.productId) }),
  });
}

export function useSaveRoots() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { roots: string[]; twoFactorCode: string }) =>
      api.put<{ extra: string[] }>(`${BASE}/roots`, body),
    onSuccess: () => client.invalidateQueries({ queryKey: deliveryTemplateKeys.roots }),
  });
}
