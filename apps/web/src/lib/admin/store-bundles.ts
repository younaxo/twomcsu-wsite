'use client';

import type { DecimalString, IsoDateString } from '@twomc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import {
  PRICE_PATTERN,
  PRODUCT_IMAGE_ERROR,
  SLUG_PATTERN,
  describeStoreAdminError,
  isAllowedProductImageUrl,
  priceToCents,
  type StoreAdminErrorInfo,
} from './store-products';

/// Админка наборов магазина (слой 1.3). Контракт — bundles-admin.controller.ts:
/// GET `/admin/store/bundles` (`store.bundles.view`, все наборы, включая
/// выключенные и просроченные, с пагинацией) и POST/PATCH/DELETE
/// (`store.bundles.create|edit|delete`).

export interface AdminBundleItem {
  id?: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  product?: { id?: string; name?: string; variants?: Array<{ id: string; duration?: string }> };
}

export interface AdminBundle {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  totalPrice: DecimalString;
  originalPrice: DecimalString;
  isActive: boolean;
  isFeatured: boolean;
  validFrom: IsoDateString | null;
  validUntil: IsoDateString | null;
  items: AdminBundleItem[];
}

export interface BundleItemInput {
  productId: string;
  variantId?: string;
  quantity?: number;
}

/// Цены в DTO — JSON-числа (`@IsNumber @Min(0)`), в ответе — Decimal-строки.
export interface BundleCreateInput {
  name: string;
  slug: string;
  description?: string;
  image?: string;
  totalPrice: number;
  originalPrice: number;
  isActive?: boolean;
  isFeatured?: boolean;
  validFrom?: string;
  validUntil?: string;
  items: BundleItemInput[];
}

/// slug после создания не меняется (UpdateBundleDto без slug).
export type BundlePatchInput = Partial<Omit<BundleCreateInput, 'slug'>>;

export const BUNDLE_MAX_ITEMS = 50;

// ---------------------------------------------------------------- валидация

export function validateBundleName(raw: string): string | null {
  const value = raw.trim();
  if (!value) return 'Введите название';
  if (value.length > 200) return 'Не более 200 символов';
  return null;
}

export function validateBundleSlug(raw: string): string | null {
  const value = raw.trim();
  if (!value) return 'Введите slug';
  if (value.length > 160) return 'Не более 160 символов';
  if (!SLUG_PATTERN.test(value)) {
    return 'Только строчные латинские буквы, цифры и дефис';
  }
  return null;
}

/// Цена набора: до 8 цифр и 2 знаков после точки, не меньше 0 (0 допустим по DTO).
export function validateBundlePrice(raw: string): string | null {
  const value = raw.trim();
  if (!value) return 'Введите цену';
  if (!PRICE_PATTERN.test(value)) {
    return 'Число не более чем с 2 знаками после точки, например 499.00';
  }
  return null;
}

export function validateBundleImage(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  return isAllowedProductImageUrl(value) ? null : PRODUCT_IMAGE_ERROR;
}

export function validateBundleDescription(raw: string): string | null {
  return raw.length > 1000 ? 'Не более 1000 символов' : null;
}

export interface BundleItemDraft {
  productId: string;
  variantId: string;
  quantity: string;
}

export function validateBundleItems(items: BundleItemDraft[]): string | null {
  if (items.length === 0) return 'Добавьте хотя бы один товар';
  if (items.length > BUNDLE_MAX_ITEMS) return `Не более ${BUNDLE_MAX_ITEMS} позиций`;
  const seen = new Set<string>();
  for (const item of items) {
    if (!/^\d{1,4}$/.test(item.quantity.trim()) || Number(item.quantity) < 1) {
      return 'Количество — целое число не меньше 1';
    }
    const key = `${item.productId}:${item.variantId}`;
    if (seen.has(key)) return 'Одна и та же позиция добавлена дважды';
    seen.add(key);
  }
  return null;
}

/// Скидка набора относительно суммы товаров по отдельности, в процентах
/// (только подсказка в форме, на цену не влияет). null — посчитать нельзя.
export function bundleDiscountPercent(total: string, original: string): number | null {
  const t = priceToCents(total.trim());
  const o = priceToCents(original.trim());
  if (t === null || o === null || o <= 0n || t > o) return null;
  return Number(((o - t) * 10000n) / o) / 100;
}

// ------------------------------------------------------------------- ошибки

const FIELD_MATCHERS: Array<[string, RegExp]> = [
  ['slug', /slug/i],
  ['name', /^name\b/i],
  ['description', /^description\b/i],
  ['image', /^image\b/i],
  ['totalPrice', /totalPrice/i],
  ['originalPrice', /originalPrice/i],
  ['validFrom', /validFrom/i],
  ['validUntil', /validUntil/i],
  ['items', /^items\b|productId|variantId|quantity/i],
];

const FIELD_TEXT: Record<string, string> = {
  slug: 'Сервер отклонил slug.',
  name: 'Сервер отклонил название.',
  description: 'Сервер отклонил описание.',
  image: 'Сервер отклонил ссылку на картинку.',
  totalPrice: 'Сервер отклонил цену набора.',
  originalPrice: 'Сервер отклонил цену без скидки.',
  validFrom: 'Сервер отклонил дату начала.',
  validUntil: 'Сервер отклонил дату окончания.',
  items: 'Сервер отклонил состав набора.',
};

/// Ошибки наборов: статусы и тексты API → русские сообщения и поля формы.
/// У набора API не отдаёт машинных кодов, только статус и текст.
export function describeBundleError(error: unknown): StoreAdminErrorInfo {
  const info = describeStoreAdminError(error);
  if (!(error instanceof ApiError) || info.forbidden || info.needsTwoFactor) return info;
  if (error.status === 404) {
    info.message = 'Набор не найден: возможно, его уже удалили. Обновите список.';
    return info;
  }
  if (error.status === 409) {
    info.fields = { slug: 'Набор с таким slug уже существует.' };
    info.message = 'Набор с таким slug уже существует.';
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
    return info;
  }
  if (error.status >= 500) {
    info.message =
      'Не удалось выполнить действие. Если набор уже есть в заказах, отключите его вместо удаления.';
  }
  return info;
}

// ------------------------------------------------------------------- запросы

export const adminBundleKeys = { all: ['admin', 'store', 'bundles'] as const };

const BASE = '/admin/store/bundles';

export const ADMIN_BUNDLES_PAGE_SIZE = 30;

export interface AdminBundlesPage {
  items: AdminBundle[];
  total: number;
  page: number;
  limit: number;
}

/// Все наборы (включая выключенные и просроченные), постранично.
export function useAdminBundles(page = 1, enabled = true) {
  return useQuery({
    queryKey: [...adminBundleKeys.all, page] as const,
    queryFn: () =>
      api.get<AdminBundlesPage>(`${BASE}?page=${page}&limit=${ADMIN_BUNDLES_PAGE_SIZE}`),
    enabled,
  });
}

export function useBundleActions() {
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: adminBundleKeys.all });
  const create = useMutation({
    mutationFn: (body: BundleCreateInput) => api.post<AdminBundle>(BASE, body),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: BundlePatchInput }) =>
      api.patch<AdminBundle>(`${BASE}/${encodeURIComponent(id)}`, body),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`${BASE}/${encodeURIComponent(id)}`),
    onSuccess,
  });
  return { create, update, remove };
}
