'use client';

import type { DecimalString, IsoDateString, OrderStatus } from '@twomc/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { adminOrderKeys } from './store-orders';

/// Админка магазина, слой 0 / подэтап 0.9: возвраты (ADR-0188).
/// Контракт — refunds-admin.controller.ts: GET /admin/store/refunds,
/// POST /admin/store/refunds/orders/:id (+ /override, /mark-failed).
/// Свежая 2FA — `twoFactorCode` в теле. Суммы — Decimal-строки; на клиенте
/// остаток считается целыми копейками только для подсказки, итог решает API.

export type RefundStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED';
export type RefundKind = 'NORMAL' | 'OVERRIDE';

export const REFUND_STATUSES: readonly RefundStatus[] = ['PENDING', 'SUCCEEDED', 'FAILED'];
export const ADMIN_REFUNDS_PAGE_SIZE = 30;
export const REFUND_REASON_MAX = 1000;
/// Слово, которое нужно ввести для «Возврата по ошибке».
export const OVERRIDE_CONFIRM_WORD = 'ВОЗВРАТ';

export const REFUND_STATUS_META: Record<
  RefundStatus,
  { label: string; tone: 'neutral' | 'success' | 'warning' | 'destructive' | 'info' }
> = {
  PENDING: { label: 'Обрабатывается', tone: 'warning' },
  SUCCEEDED: { label: 'Выполнен', tone: 'success' },
  FAILED: { label: 'Не удался', tone: 'destructive' },
};

export const REFUND_KIND_LABEL: Record<RefundKind, string> = {
  NORMAL: 'Обычный',
  OVERRIDE: 'По ошибке (после выдачи)',
};

export interface AdminRefund {
  id: string;
  orderId: string;
  amount: DecimalString;
  reason: string;
  kind: RefundKind;
  status: RefundStatus;
  providerRefundId: string | null;
  errorCode: string | null;
  requiresManualRevoke: boolean;
  actorId: string | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
  completedAt: IsoDateString | null;
  order?: { orderNumber: string; status: OrderStatus; total: DecimalString };
}

export interface AdminRefundsPage {
  items: AdminRefund[];
  total: number;
  page: number;
  limit: number;
}

export interface RefundResult {
  refund: AdminRefund;
  orderStatus: OrderStatus;
}

export interface RefundBody {
  reason: string;
  twoFactorCode: string;
  amount?: string;
}

export const adminRefundKeys = {
  all: ['admin', 'store', 'refunds'] as const,
  list: (query: object) => ['admin', 'store', 'refunds', 'list', query] as const,
  order: (orderId: string) => ['admin', 'store', 'refunds', 'order', orderId] as const,
};

export function buildRefundQuery(status: '' | RefundStatus, page: number, limit: number) {
  return { page, limit, ...(status ? { status } : {}) };
}

/// Ответ может быть неожиданной формы (старый API): список не должен падать.
function normalizePage(data: unknown): AdminRefundsPage {
  const value = (data ?? {}) as Partial<AdminRefundsPage>;
  return {
    items: Array.isArray(value.items) ? value.items : [],
    total: typeof value.total === 'number' ? value.total : 0,
    page: typeof value.page === 'number' ? value.page : 1,
    limit: typeof value.limit === 'number' ? value.limit : ADMIN_REFUNDS_PAGE_SIZE,
  };
}

export function useAdminRefunds(query: ReturnType<typeof buildRefundQuery>, enabled = true) {
  return useQuery({
    queryKey: adminRefundKeys.list(query),
    queryFn: async () =>
      normalizePage(await api.get<AdminRefundsPage>('/admin/store/refunds', { query })),
    placeholderData: keepPreviousData,
    enabled,
    retry: false,
  });
}

/// Возвраты одного заказа. 503 `refunds_disabled` — флаг выключен (не ошибка UI).
export function useOrderRefunds(orderId: string, enabled: boolean) {
  return useQuery({
    queryKey: adminRefundKeys.order(orderId),
    queryFn: async () =>
      normalizePage(
        await api.get<AdminRefundsPage>('/admin/store/refunds', {
          query: { orderId, limit: 100 },
        }),
      ),
    enabled: enabled && orderId.length > 0,
    retry: false,
  });
}

export function isRefundsDisabled(error: unknown): boolean {
  return error instanceof ApiError && error.status === 503 && error.code === 'refunds_disabled';
}

export type RefundAction = 'refund' | 'override' | 'mark-failed';

const ACTION_PATH: Record<RefundAction, string> = {
  refund: '',
  override: '/override',
  'mark-failed': '/mark-failed',
};

export function useRefundAction(action: RefundAction) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, body }: { orderId: string; body: RefundBody }) =>
      api.post<RefundResult>(
        `/admin/store/refunds/orders/${encodeURIComponent(orderId)}${ACTION_PATH[action]}`,
        body,
      ),
    // Статус заказа мог измениться и при ошибке (вебхук, сверка): перечитываем всё.
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: adminOrderKeys.all }),
        client.invalidateQueries({ queryKey: adminRefundKeys.all }),
      ]),
  });
}

/// Копейки из Decimal-строки («450», «450.5», «450.00»); null — не число.
export function toCents(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

export function centsToDecimal(cents: number): string {
  const whole = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, '0');
  return `${whole}.${frac}`;
}

/// Остаток к возврату: итог заказа минус успешные возвраты (целые копейки).
export function remainingToRefund(total: string, refunds: readonly AdminRefund[]): string {
  const totalCents = toCents(total) ?? 0;
  const refunded = refunds
    .filter((r) => r.status === 'SUCCEEDED')
    .reduce((sum, r) => sum + (toCents(r.amount) ?? 0), 0);
  return centsToDecimal(Math.max(0, totalCents - refunded));
}

export interface RefundFormValues {
  reason: string;
  amount: string;
  twoFactorCode: string;
  /// Только для override: введённое слово подтверждения.
  confirmText?: string;
}

export interface RefundFormErrors {
  reason?: string;
  amount?: string;
  twoFactorCode?: string;
  confirmText?: string;
}

/// Проверка формы до запроса. `withAmount` — у mark-failed суммы нет.
export function validateRefundForm(
  values: RefundFormValues,
  options: { withAmount: boolean; requireConfirm: boolean; remaining?: string },
): RefundFormErrors {
  const errors: RefundFormErrors = {};
  const reason = values.reason.trim();
  if (!reason) errors.reason = 'Укажите причину';
  else if (reason.length > REFUND_REASON_MAX) {
    errors.reason = `Не длиннее ${REFUND_REASON_MAX} символов`;
  }
  if (options.withAmount && values.amount.trim()) {
    const cents = toCents(values.amount);
    if (cents === null || cents <= 0) errors.amount = 'Сумма: число больше нуля, до 2 знаков';
    else if (options.remaining !== undefined && cents > (toCents(options.remaining) ?? 0)) {
      errors.amount = 'Сумма больше остатка оплаченного';
    }
  }
  const code = values.twoFactorCode.trim();
  if (!code) errors.twoFactorCode = 'Введите код из приложения 2FA';
  else if (!/^\d{6,8}$/.test(code)) errors.twoFactorCode = 'Код — 6 цифр';
  if (options.requireConfirm && (values.confirmText ?? '').trim() !== OVERRIDE_CONFIRM_WORD) {
    errors.confirmText = `Введите слово ${OVERRIDE_CONFIRM_WORD} для подтверждения`;
  }
  return errors;
}

export interface RefundErrorInfo {
  message: string;
  field: keyof RefundFormErrors | null;
  needsTwoFactorSetup: boolean;
  /// Возвраты выключены флагом: действия недоступны.
  disabled: boolean;
}

const CODE_TEXT: Record<string, { message: string; field?: keyof RefundFormErrors }> = {
  refunds_disabled: { message: 'Возвраты выключены.' },
  refund_reason_required: { message: 'Причина обязательна.', field: 'reason' },
  refund_two_factor_required: {
    message: 'Нужен свежий код двухфакторной аутентификации.',
    field: 'twoFactorCode',
  },
  refund_two_factor_invalid: {
    message: 'Неверный код 2FA. Резервные коды не подходят, нужен код из приложения.',
    field: 'twoFactorCode',
  },
  refund_two_factor_locked: { message: 'Слишком много попыток. Повторите позже.' },
  refund_amount_invalid: { message: 'Неверная сумма возврата.', field: 'amount' },
  refund_exceeds_paid: { message: 'Сумма больше остатка оплаченного.', field: 'amount' },
  order_not_refundable: { message: 'Этот заказ нельзя вернуть в текущем статусе.' },
  order_already_refunded: { message: 'Заказ уже возвращён полностью.' },
  refund_in_progress: { message: 'Возврат по заказу уже выполняется. Дождитесь результата.' },
  refund_after_delivery: {
    message:
      'Товар уже выдан: обычный возврат запрещён. Используйте «Возврат по ошибке» (нужно отдельное право).',
  },
  refund_override_not_needed: {
    message: 'Товар не выдан: используйте обычный возврат.',
  },
  refund_rubies_unsupported: { message: 'Возврат рубинов пока не поддерживается.' },
  payment_unavailable: {
    message: 'Платёжный провайдер недоступен. Повторите позже.',
  },
  refund_use_refunds_api: { message: 'Этот заказ возвращается только через раздел возвратов.' },
  refund_not_pending: { message: 'У заказа нет возврата в ожидании.' },
};

/// Понятные русские тексты по машинным кодам API; 429 — «Слишком много попыток».
export function describeRefundError(error: unknown): RefundErrorInfo {
  const base: RefundErrorInfo = {
    message: error instanceof Error ? error.message : 'Неизвестная ошибка',
    field: null,
    needsTwoFactorSetup: false,
    disabled: false,
  };
  if (!(error instanceof ApiError)) return base;
  if (error.status === 429) {
    return { ...base, message: 'Слишком много попыток. Повторите позже.' };
  }
  if (error.code === 'admin_2fa_required') {
    return {
      ...base,
      needsTwoFactorSetup: true,
      message:
        'Для действий в админке нужна двухфакторная аутентификация. Включите её в настройках аккаунта.',
    };
  }
  const known = error.code ? CODE_TEXT[error.code] : undefined;
  if (known) {
    return {
      ...base,
      message: known.message,
      field: known.field ?? null,
      disabled: error.code === 'refunds_disabled',
    };
  }
  if (error.status === 403) return { ...base, message: 'Недостаточно прав для возврата.' };
  if (error.status === 404) return { ...base, message: 'Заказ не найден.' };
  if (error.status === 409) {
    return {
      ...base,
      message: 'Состояние заказа изменилось. Данные обновлены, повторите попытку.',
    };
  }
  return { ...base, message: error.messages.join('. ') };
}

/// Итог операции для aria-live сообщения.
export function describeRefundResult(action: RefundAction, result: RefundResult): string {
  const { refund } = result;
  if (action === 'mark-failed') {
    return 'Возврат отмечен неудавшимся. Повторный возврат снова доступен.';
  }
  if (refund.status === 'SUCCEEDED') {
    return refund.requiresManualRevoke
      ? 'Возврат выполнен. Выданное в игре нужно отозвать вручную.'
      : 'Возврат выполнен.';
  }
  if (refund.status === 'FAILED') {
    return 'Провайдер отклонил возврат. Заказ в статусе «Возврат не удался», можно повторить.';
  }
  return 'Возврат отправлен провайдеру и обрабатывается. Статус обновится после сверки.';
}
