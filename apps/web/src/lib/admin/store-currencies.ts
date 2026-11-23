'use client';

import type { DecimalString } from '@twomc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { describeStoreAdminError, type StoreAdminErrorInfo } from './store-products';

/// Админка валют отображения (слой 1.3). Контракт — currencies-admin.controller.ts:
/// GET/POST/PATCH `/admin/store/currencies` (`store.currencies.view|create|edit`).
/// Курсы нужны калькулятору обмена на витрине; баланса валюты нет, оплата
/// всегда в рублях. Удаления и порядка в API нет.

export interface AdminCurrencyRate {
  id: string;
  currency: string;
  rate: DecimalString;
  symbol: string;
  flag: string;
  isActive: boolean;
  updatedAt: string;
}

export interface CurrencyCreateInput {
  currency: string;
  rate: number;
  symbol: string;
  flag: string;
}

/// Код валюты после создания не меняется (ключ в URL).
export interface CurrencyPatchInput {
  rate?: number;
  symbol?: string;
  flag?: string;
  isActive?: boolean;
}

/// Колонка Decimal(10,4): до 6 цифр целой части и до 4 знаков после точки.
export const RATE_PATTERN = /^\d{1,6}(\.\d{1,4})?$/;

export function validateCurrencyCode(raw: string): string | null {
  const value = raw.trim();
  if (!value) return 'Введите код валюты';
  if (value.length > 10) return 'Не более 10 символов';
  if (/\s|\//.test(value)) return 'Без пробелов и «/»';
  return null;
}

/// Курс строго больше 0: калькулятор делит на курс целевой валюты, 0 сломал бы обмен
/// (это строже DTO, где допустимо 0).
export function validateCurrencyRate(raw: string): string | null {
  const value = raw.trim();
  if (!value) return 'Введите курс';
  if (!RATE_PATTERN.test(value)) {
    return 'Число не более чем с 4 знаками после точки, например 1.2500';
  }
  if (Number(value) <= 0) return 'Курс должен быть больше 0';
  return null;
}

export function validateCurrencySymbol(raw: string): string | null {
  const value = raw.trim();
  if (!value) return 'Введите символ';
  if (value.length > 5) return 'Не более 5 символов';
  return null;
}

export function validateCurrencyFlag(raw: string): string | null {
  const value = raw.trim();
  if (!value) return 'Введите флаг или значок';
  if (value.length > 10) return 'Не более 10 символов';
  return null;
}

const FIELD_MATCHERS: Array<[string, RegExp]> = [
  ['currency', /^currency\b/i],
  ['rate', /^rate\b/i],
  ['symbol', /^symbol\b/i],
  ['flag', /^flag\b/i],
];

const FIELD_TEXT: Record<string, string> = {
  currency: 'Сервер отклонил код валюты.',
  rate: 'Сервер отклонил курс.',
  symbol: 'Сервер отклонил символ.',
  flag: 'Сервер отклонил флаг.',
};

export function describeCurrencyError(error: unknown): StoreAdminErrorInfo {
  const info = describeStoreAdminError(error);
  if (!(error instanceof ApiError) || info.forbidden || info.needsTwoFactor) return info;
  if (error.status === 404) {
    info.message = 'Курс не найден: возможно, список устарел. Обновите страницу.';
    return info;
  }
  if (error.status === 409) {
    info.fields = { currency: 'Курс для этой валюты уже существует.' };
    info.message = 'Курс для этой валюты уже существует.';
    return info;
  }
  if (error.status === 400 || error.status === 422) {
    info.fields = {};
    for (const message of error.messages) {
      const hit = FIELD_MATCHERS.find(([, re]) => re.test(message));
      if (hit && !info.fields[hit[0]]) info.fields[hit[0]] = FIELD_TEXT[hit[0]] ?? message;
    }
    if (Object.keys(info.fields).length === 0) {
      info.message = 'Сервер отклонил данные. Проверьте поля формы.';
    }
  }
  return info;
}

export const adminCurrencyKeys = { all: ['admin', 'store', 'currencies'] as const };

const BASE = '/admin/store/currencies';

export function useAdminCurrencies(enabled = true) {
  return useQuery({
    queryKey: adminCurrencyKeys.all,
    queryFn: () => api.get<AdminCurrencyRate[]>(BASE),
    enabled,
  });
}

export function useCurrencyActions() {
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: adminCurrencyKeys.all });
  const create = useMutation({
    mutationFn: (body: CurrencyCreateInput) => api.post<AdminCurrencyRate>(BASE, body),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: ({ currency, body }: { currency: string; body: CurrencyPatchInput }) =>
      api.patch<AdminCurrencyRate>(`${BASE}/${encodeURIComponent(currency)}`, body),
    onSuccess,
  });
  return { create, update };
}
