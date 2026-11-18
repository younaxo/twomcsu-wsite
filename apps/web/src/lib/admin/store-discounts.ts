'use client';

import type { DecimalString, IsoDateString } from '@twomc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import {
  PRICE_PATTERN,
  describeStoreAdminError,
  priceToCents,
  type AdminProductType,
  type StoreAdminErrorInfo,
} from './store-products';

/// Админка магазина, слой 0 / подэтап 0.4: скидки (за объём/сумму и за
/// лояльность). Контракт — discounts-admin.controller.ts. Суммы и проценты —
/// Decimal-строки (`"10.50"`), на клиенте не превращаются в float: сравнение
/// идёт в целых копейках (priceToCents). Расчёт цены корзины не затрагивается.

export type DiscountType = 'PERCENT' | 'FIXED' | 'BONUS';

export const DISCOUNT_TYPE_LABEL: Record<DiscountType, string> = {
  PERCENT: 'Процент',
  FIXED: 'Фиксированная сумма',
  BONUS: 'Бонус',
};

export const DISCOUNT_TYPES = Object.keys(DISCOUNT_TYPE_LABEL) as DiscountType[];

/// Формат значения скидки для таблиц: процент — «15 %», иначе рубли.
export function discountValueText(type: DiscountType, value: DecimalString): string {
  if (type === 'PERCENT') return `${trimZeros(value)} %`;
  return `${trimZeros(value)} ₽`;
}

/// "10.00" → "10", "10.50" → "10.50": только отображение, без чисел с плавающей точкой.
function trimZeros(value: string): string {
  return /^\d+\.00$/.test(value) ? value.slice(0, -3) : value;
}

// ---------------------------------------------------------------- валидация

/// Размер скидки: Decimal-строка (до 8 цифр и 2 знаков), больше 0; для
/// PERCENT — не больше 100 (как assertDiscountValue в API). null — значение верное.
export function validateDiscountValue(type: DiscountType, raw: string): string | null {
  const value = raw.trim();
  if (!value) return 'Введите значение';
  if (!PRICE_PATTERN.test(value)) {
    return 'Число не более чем с 2 знаками после точки, например 10.50';
  }
  const cents = priceToCents(value);
  if (cents === null || cents <= 0n) return 'Значение должно быть больше 0';
  if (type === 'PERCENT' && cents > 10000n) return 'Процент не может быть больше 100';
  return null;
}

/// Процент лояльности — всегда PERCENT, 0 < значение ≤ 100.
export function validatePercent(raw: string): string | null {
  return validateDiscountValue('PERCENT', raw);
}

/// Необязательная сумма (минимальная сумма заказа / корзины): пусто — ок.
export function validateOptionalMoney(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  return PRICE_PATTERN.test(value)
    ? null
    : 'Число не более чем с 2 знаками после точки, например 100.00';
}

/// Целое число строкой: `min` — нижняя граница; пусто допустимо только при `optional`.
export function validateInteger(raw: string, min: number, optional = false): string | null {
  const value = raw.trim();
  if (!value) return optional ? null : 'Введите целое число';
  if (!/^\d{1,9}$/.test(value)) return 'Только целое число без знаков';
  if (Number(value) < min) return `Не меньше ${min}`;
  return null;
}

/// Дата `YYYY-MM-DD` → ISO-момент начала суток (местное время браузера).
export function dateToStartIso(date: string): IsoDateString {
  return new Date(`${date}T00:00:00`).toISOString();
}

/// Дата `YYYY-MM-DD` → ISO-момент конца суток (местное время браузера).
export function dateToEndIso(date: string): IsoDateString {
  return new Date(`${date}T23:59:59`).toISOString();
}

/// ISO-момент → `YYYY-MM-DD` в местном времени (для DatePicker); пусто — ''.
export function isoToDateInput(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/// Ошибки API админки скидок: поля формы + общие ответы (403/2FA/409).
const FIELD_MATCHERS: Array<[string, RegExp]> = [
  ['discountValue', /discountValue/i],
  ['discountPercent', /discountPercent/i],
  ['maxUses', /maxUses/i],
  ['validFrom', /validFrom/i],
  ['validUntil', /validUntil/i],
  ['minOrderAmount', /minOrderAmount/i],
  ['minAmount', /minAmount/i],
  ['minQuantity', /minQuantity/i],
  ['minPurchases', /minPurchases/i],
  ['applicableToTypes', /applicableToTypes/i],
  ['productId', /productId|товар скидки/i],
  ['code', /^code\b|промокод/i],
  ['name', /^name\b/i],
  ['description', /^description\b/i],
];

export function describeDiscountAdminError(error: unknown): StoreAdminErrorInfo {
  const info = describeStoreAdminError(error);
  if (!(error instanceof ApiError) || info.forbidden || info.needsTwoFactor) return info;
  if (error.code === 'PROMO_HAS_ORDERS') {
    info.message =
      'По промокоду уже есть заказы, поэтому удалить его нельзя. Отключите промокод — история заказов сохранится.';
    return info;
  }
  const tracked = [400, 409, 422].includes(error.status);
  if (tracked) {
    for (const message of error.messages) {
      const hit = FIELD_MATCHERS.find(([, re]) => re.test(message));
      if (hit && !info.fields[hit[0]]) info.fields[hit[0]] = message;
    }
  }
  return info;
}

// ---------------------------------------------------------------- скидка за объём

export interface AdminBulkDiscount {
  id: string;
  productId: string | null;
  productType: AdminProductType | null;
  minQuantity: number;
  minAmount: DecimalString | null;
  discountType: DiscountType;
  discountValue: DecimalString;
  isActive: boolean;
  createdAt: IsoDateString;
}

export interface BulkDiscountCreateInput {
  productId?: string;
  productType?: AdminProductType;
  minQuantity?: number;
  minAmount?: string;
  discountType: DiscountType;
  discountValue: string;
}

/// productId и productType после создания не меняются (UpdateBulkDiscountDto).
export interface BulkDiscountPatchInput {
  minQuantity?: number;
  minAmount?: string;
  discountType?: DiscountType;
  discountValue?: string;
  isActive?: boolean;
}

// ---------------------------------------------------------------- лояльность

export interface AdminLoyaltyDiscount {
  id: string;
  minPurchases: number;
  discountPercent: DecimalString;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface LoyaltyDiscountCreateInput {
  minPurchases: number;
  discountPercent: string;
  name: string;
  description?: string;
}

export interface LoyaltyDiscountPatchInput {
  minPurchases?: number;
  discountPercent?: string;
  name?: string;
  description?: string;
  isActive?: boolean;
}

export const adminDiscountKeys = {
  bulk: ['admin', 'store', 'discounts', 'bulk'] as const,
  loyalty: ['admin', 'store', 'discounts', 'loyalty'] as const,
};

const BASE = '/admin/store/discounts';

/// Списки читаются по `store.discounts.view`; `enabled` — когда права нет,
/// запрос не отправляется.
export function useAdminBulkDiscounts(enabled = true) {
  return useQuery({
    queryKey: adminDiscountKeys.bulk,
    queryFn: () => api.get<AdminBulkDiscount[]>(`${BASE}/bulk`),
    enabled,
  });
}

export function useAdminLoyaltyDiscounts(enabled = true) {
  return useQuery({
    queryKey: adminDiscountKeys.loyalty,
    queryFn: () => api.get<AdminLoyaltyDiscount[]>(`${BASE}/loyalty`),
    enabled,
  });
}

export function useBulkDiscountActions() {
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: adminDiscountKeys.bulk });
  const create = useMutation({
    mutationFn: (body: BulkDiscountCreateInput) =>
      api.post<AdminBulkDiscount>(`${BASE}/bulk`, body),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: BulkDiscountPatchInput }) =>
      api.patch<AdminBulkDiscount>(`${BASE}/bulk/${encodeURIComponent(id)}`, body),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`${BASE}/bulk/${encodeURIComponent(id)}`),
    onSuccess,
  });
  return { create, update, remove };
}

export function useLoyaltyDiscountActions() {
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: adminDiscountKeys.loyalty });
  const create = useMutation({
    mutationFn: (body: LoyaltyDiscountCreateInput) =>
      api.post<AdminLoyaltyDiscount>(`${BASE}/loyalty`, body),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: LoyaltyDiscountPatchInput }) =>
      api.patch<AdminLoyaltyDiscount>(`${BASE}/loyalty/${encodeURIComponent(id)}`, body),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`${BASE}/loyalty/${encodeURIComponent(id)}`),
    onSuccess,
  });
  return { create, update, remove };
}
