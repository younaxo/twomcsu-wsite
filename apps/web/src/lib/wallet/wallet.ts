'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import { formatNumber } from '@/lib/format';

/// Кошелёк рубинов, слой 0 / подэтап 0.15 (ADR-0191). Контракт —
/// apps/api/src/modules/wallet: GET /wallet/history, GET /admin/wallet/users/:id,
/// POST /admin/wallet/users/:id/adjust. Суммы — целые со знаком СТРОКОЙ (BigInt
/// на сервере): на клиенте не считаем, только показываем. Рубины — внутриигровая
/// валюта, не деньги: ни трат, ни передачи, ни вывода здесь нет.

export type WalletEntryKind =
  'PURCHASE' | 'ADMIN_ADJUST' | 'REFUND_REVERSAL' | 'REFUND_RESTORE' | 'OPENING_BALANCE';

export const WALLET_PAGE_SIZE = 20;
export const WALLET_REASON_MAX = 500;
export const RUBY_DISCLAIMER =
  'Рубины — внутриигровая валюта, не деньги; передача и вывод недоступны.';

export const WALLET_KIND_LABEL: Record<WalletEntryKind, string> = {
  PURCHASE: 'Покупка',
  ADMIN_ADJUST: 'Корректировка администратором',
  REFUND_REVERSAL: 'Возврат по заказу',
  REFUND_RESTORE: 'Отмена возврата',
  OPENING_BALANCE: 'Начальный остаток',
};

export function walletKindLabel(kind: string): string {
  return WALLET_KIND_LABEL[kind as WalletEntryKind] ?? 'Операция';
}

export interface WalletEntry {
  id: string;
  kind: WalletEntryKind;
  /// Целое со знаком строкой: «+» зачисление, «-» списание.
  amount: string;
  balanceAfter: string;
  /// Причина — только в админском ответе (у игрока всегда null).
  reason: string | null;
  orderId: string | null;
  createdAt: string;
  /// Только админский ответ.
  actorId?: string | null;
  refundId?: string | null;
}

export interface WalletHistoryPage {
  items: WalletEntry[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminWalletView {
  userId: string;
  currency: 'RUBY';
  scale: 0;
  /// Баланс по журналу, строкой.
  balance: string;
  /// false — баланс кошелька не совпадает с журналом (нужен разбор).
  consistent: boolean;
  history: WalletHistoryPage;
}

export interface AdjustResult {
  entry: WalletEntry;
  balance: string;
  replayed: boolean;
}

/// «1 250» / «+100» / «−100»: знак — только у проводок (`signed`). Строки,
/// не помещающиеся в безопасное целое, показываем как есть.
export function formatRuby(value: string | null | undefined, signed = false): string {
  if (value === null || value === undefined || !/^-?\d+$/.test(value)) return '—';
  const negative = value.startsWith('-');
  const digits = negative ? value.slice(1) : value;
  const n = Number(digits);
  const body = Number.isSafeInteger(n) ? formatNumber(n) : digits;
  if (negative) return `−${body}`;
  return signed ? `+${body}` : body;
}

export function shortOrderId(orderId: string): string {
  return orderId.length > 8 ? orderId.slice(-8) : orderId;
}

export function isWalletDisabled(error: unknown): boolean {
  return error instanceof ApiError && error.status === 503 && error.code === 'wallet_disabled';
}

export const walletKeys = {
  all: ['wallet'] as const,
  mine: (page: number) => ['wallet', 'mine', page] as const,
  admin: (userId: string, page: number) => ['wallet', 'admin', userId, page] as const,
  adminAll: (userId: string) => ['wallet', 'admin', userId] as const,
};

/// Свой журнал рубинов. 503 `wallet_disabled` — не ошибка UI (см. `isWalletDisabled`).
export function useMyWalletHistory(page: number) {
  const authenticated = useAuthStore((state) => state.status === 'authenticated');
  return useQuery({
    queryKey: walletKeys.mine(page),
    queryFn: () =>
      api.get<WalletHistoryPage>('/wallet/history', {
        query: { page, limit: WALLET_PAGE_SIZE },
      }),
    enabled: authenticated,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useAdminWallet(userId: string, page: number, enabled = true) {
  return useQuery({
    queryKey: walletKeys.admin(userId, page),
    queryFn: () =>
      api.get<AdminWalletView>(`/admin/wallet/users/${encodeURIComponent(userId)}`, {
        query: { page, limit: WALLET_PAGE_SIZE },
      }),
    enabled: enabled && userId.length > 0,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export interface AdjustBody {
  amount: string;
  reason: string;
  twoFactorCode: string;
  requestId?: string;
}

export function useAdjustWallet(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: AdjustBody) =>
      api.post<AdjustResult>(`/admin/wallet/users/${encodeURIComponent(userId)}/adjust`, body),
    // Баланс мог измениться и при ошибке (параллельная операция): перечитываем.
    onSettled: () => client.invalidateQueries({ queryKey: walletKeys.adminAll(userId) }),
  });
}

/* ---------------- Форма корректировки ---------------- */

export type AdjustField = 'amount' | 'reason' | 'twoFactorCode';
export type AdjustFormErrors = Partial<Record<AdjustField, string>>;

const AMOUNT_RE = /^[+-]?[1-9]\d{0,8}$/;
const CODE_RE = /^\d{6}$/;

/// Сумма для API: без ведущего «+» и пробелов; null — формат неверен.
export function normalizeAdjustAmount(raw: string): string | null {
  const value = raw.replace(/[\s ]/g, '').replace('−', '-');
  if (!AMOUNT_RE.test(value)) return null;
  return value.startsWith('+') ? value.slice(1) : value;
}

export function validateAdjustDetails(values: {
  amount: string;
  reason: string;
}): AdjustFormErrors {
  const errors: AdjustFormErrors = {};
  if (normalizeAdjustAmount(values.amount) === null) {
    errors.amount = 'Целое число, не 0, до 9 цифр. Например +500 или -200.';
  }
  const reason = values.reason.trim();
  if (reason.length === 0) errors.reason = 'Укажите причину.';
  else if (reason.length > WALLET_REASON_MAX) {
    errors.reason = `Не больше ${WALLET_REASON_MAX} символов.`;
  }
  return errors;
}

export function validateAdjustCode(code: string): AdjustFormErrors {
  return CODE_RE.test(code.trim())
    ? {}
    : { twoFactorCode: 'Введите 6 цифр из приложения-аутентификатора.' };
}

export interface AdjustErrorInfo {
  message: string;
  /// Поле, к которому относится ошибка (null — общая).
  field: AdjustField | null;
  needsTwoFactorSetup: boolean;
  disabled: boolean;
}

const ADJUST_CODE_TEXT: Record<string, { message: string; field?: AdjustField }> = {
  wallet_disabled: { message: 'Кошелёк выключен на сервере. Корректировка недоступна.' },
  wallet_self_adjust_forbidden: { message: 'Нельзя корректировать собственный кошелёк.' },
  wallet_adjust_limit: {
    message: 'Сумма больше лимита одной корректировки. Уменьшите сумму.',
    field: 'amount',
  },
  wallet_adjust_daily_limit: {
    message: 'Суточный лимит корректировок исчерпан. Повторите позже.',
  },
  wallet_amount_invalid: { message: 'Неверная сумма: целое число, не 0.', field: 'amount' },
  wallet_insufficient: {
    message: 'Баланс не может стать отрицательным: на кошельке недостаточно рубинов.',
    field: 'amount',
  },
  wallet_reason_required: { message: 'Причина обязательна.', field: 'reason' },
  wallet_two_factor_required: {
    message: 'Нужен свежий код двухфакторной аутентификации.',
    field: 'twoFactorCode',
  },
  wallet_two_factor_invalid: {
    message: 'Неверный код 2FA. Резервные коды не подходят, нужен код из приложения.',
    field: 'twoFactorCode',
  },
  wallet_two_factor_locked: {
    message: 'Слишком много неверных кодов. Повторите позже.',
  },
  wallet_user_not_found: { message: 'Пользователь не найден.' },
  wallet_inconsistent: {
    message: 'Баланс не совпадает с журналом, операция отклонена. Сообщите разработчикам.',
  },
  wallet_idempotency_conflict: {
    message: 'Этот запрос уже выполнялся с другими данными. Закройте окно и повторите.',
  },
};

export function describeAdjustError(error: unknown): AdjustErrorInfo {
  const base: AdjustErrorInfo = {
    message: 'Не удалось выполнить корректировку. Повторите попытку.',
    field: null,
    needsTwoFactorSetup: false,
    disabled: false,
  };
  if (!(error instanceof ApiError)) return base;
  if (error.code === 'admin_2fa_required') {
    return {
      ...base,
      needsTwoFactorSetup: true,
      message:
        'Для действий в админке нужна двухфакторная аутентификация. Включите её в настройках аккаунта.',
    };
  }
  const known = error.code ? ADJUST_CODE_TEXT[error.code] : undefined;
  if (known) {
    return {
      ...base,
      message: known.message,
      field: known.field ?? null,
      disabled: error.code === 'wallet_disabled',
    };
  }
  if (error.status === 429) {
    return { ...base, message: 'Слишком много попыток. Повторите позже.' };
  }
  if (error.status === 403) return { ...base, message: 'Недостаточно прав для корректировки.' };
  if (error.status === 404) return { ...base, message: 'Пользователь не найден.' };
  return base;
}

/// Ключ повтора: один на подтверждение, чтобы двойной клик не начислил дважды.
export function newRequestId(): string {
  const c = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
