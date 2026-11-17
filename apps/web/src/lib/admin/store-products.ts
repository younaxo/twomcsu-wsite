'use client';

import type { DecimalString } from '@twomc/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import type { ProductDuration } from '@/lib/store/catalog';

/// Админка магазина, слой 0 / подэтап 0.3: товары и варианты.
/// Контракт — apps/api/src/modules/store/products-admin.controller.ts.
/// Цена — всегда Decimal-строка (`"199.00"`), число с плавающей точкой в
/// деньгах не используется ни в состоянии формы, ни в запросах. Поля «выдача»
/// (gameCommands) здесь нет намеренно: шаблоны команд — отдельное право
/// владельца (0.11), API отклоняет их с 400.

export type AdminProductType =
  | 'PRIVILEGE'
  | 'KEY'
  | 'SUBSCRIPTION'
  | 'BADGE'
  | 'BATTLE_PASS'
  | 'BATTLE_PASS_BOOSTER'
  | 'UNMUTE'
  | 'UNBAN'
  | 'CURRENCY'
  | 'DECORATION'
  | 'BUNDLE';

export const PRODUCT_TYPE_LABEL: Record<AdminProductType, string> = {
  PRIVILEGE: 'Привилегия',
  KEY: 'Ключ',
  SUBSCRIPTION: 'Подписка',
  BADGE: 'Значок',
  BATTLE_PASS: 'Боевой пропуск',
  BATTLE_PASS_BOOSTER: 'Бустер боевого пропуска',
  UNMUTE: 'Размут',
  UNBAN: 'Разбан',
  CURRENCY: 'Валюта',
  DECORATION: 'Украшение профиля',
  BUNDLE: 'Набор',
};

/// Типы, которые можно создавать из этой формы. Набор (BUNDLE) продаётся
/// отдельной сущностью Bundle — отдельный раздел, не здесь.
export const CREATABLE_PRODUCT_TYPES: AdminProductType[] = [
  'PRIVILEGE',
  'KEY',
  'UNMUTE',
  'UNBAN',
  'CURRENCY',
  'BATTLE_PASS',
  'BATTLE_PASS_BOOSTER',
  'SUBSCRIPTION',
  'BADGE',
  'DECORATION',
];

/// Зеркало закрытого списка продаваемых типов API (sellable-types.ts, ADR-0185
/// п. 2). Только подсказка в интерфейсе: решает сервер (422).
export const SELLABLE_PRODUCT_TYPES: readonly AdminProductType[] = [
  'PRIVILEGE',
  'KEY',
  'UNMUTE',
  'UNBAN',
  'CURRENCY',
  'BATTLE_PASS',
];

export const DURATION_OPTIONS: ProductDuration[] = [
  'FOREVER',
  'MONTHS_3',
  'MONTH_1',
  'WEEK_1',
  'SEASON',
  'ONE_TIME',
];

export const CURRENCY_TYPE_LABEL = { RUBIES: 'Рубины', COINS: 'Монеты' } as const;
export type AdminCurrencyType = keyof typeof CURRENCY_TYPE_LABEL;

export interface AdminVariant {
  id: string;
  productId?: string;
  duration: ProductDuration;
  price: DecimalString;
  oldPrice: DecimalString | null;
  isActive: boolean;
  order: number;
}

export interface AdminProductCategory {
  id: string;
  name: string;
  slug: string;
}

export interface AdminProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  fullDescription: string | null;
  type: AdminProductType;
  image: string | null;
  images: string[];
  categoryId: string;
  category?: AdminProductCategory | null;
  isGiftable: boolean;
  isSelfOnly: boolean;
  isUnique: boolean;
  isSeasonalOnly: boolean;
  isFeatured: boolean;
  maxPerPurchase: number | null;
  currencyType: AdminCurrencyType | null;
  currencyAmount: number | null;
  server: string | null;
  isActive: boolean;
  order: number;
  variants: AdminVariant[];
}

export interface AdminProductList {
  items: AdminProduct[];
  total: number;
  page: number;
  limit: number;
}

export interface VariantCreateInput {
  duration: ProductDuration;
  price: string;
  oldPrice?: string;
  order?: number;
}

export interface ProductCreateInput {
  name: string;
  slug: string;
  type: AdminProductType;
  categoryId: string;
  description?: string;
  fullDescription?: string;
  image?: string;
  isGiftable?: boolean;
  isSelfOnly?: boolean;
  isUnique?: boolean;
  isSeasonalOnly?: boolean;
  isFeatured?: boolean;
  maxPerPurchase?: number;
  currencyType?: AdminCurrencyType;
  currencyAmount?: number;
  server?: string;
  order?: number;
  variants: VariantCreateInput[];
}

/// Правка: type и slug не меняются; вариантов здесь нет (свои эндпоинты).
/// Известный долг API: `image` нельзя очистить (null/пустая строка — 400),
/// поэтому поле в PATCH уходит только непустым.
export type ProductPatchInput = Partial<
  Omit<ProductCreateInput, 'type' | 'slug' | 'variants'> & { isActive: boolean }
>;

export interface VariantPatchInput {
  price?: string;
  /// API пока не принимает null: очистить старую цену нельзя.
  oldPrice?: string;
  isActive?: boolean;
  order?: number;
}

export const ADMIN_PRODUCTS_PAGE_SIZE = 30;

export const adminProductKeys = {
  all: ['admin', 'store', 'products'] as const,
  list: (search: string, page: number) => ['admin', 'store', 'products', search, page] as const,
};

export function useAdminProducts(search: string, page: number) {
  const q = search.trim();
  return useQuery({
    queryKey: adminProductKeys.list(q, page),
    queryFn: () =>
      api.get<AdminProductList>('/admin/store/products', {
        query: { page, limit: ADMIN_PRODUCTS_PAGE_SIZE, ...(q ? { search: q } : {}) },
      }),
    placeholderData: keepPreviousData,
  });
}

const base = '/admin/store/products';
const productPath = (id: string) => `${base}/${encodeURIComponent(id)}`;

export function useAdminProductActions() {
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: adminProductKeys.all });
  const create = useMutation({
    mutationFn: (body: ProductCreateInput) => api.post<AdminProduct>(base, body),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ProductPatchInput }) =>
      api.patch<AdminProduct>(productPath(id), body),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api.delete<{ success: boolean; mode: 'deleted' | 'deactivated' }>(productPath(id)),
    onSuccess,
  });
  const createVariant = useMutation({
    mutationFn: ({ productId, body }: { productId: string; body: VariantCreateInput }) =>
      api.post<AdminVariant>(`${productPath(productId)}/variants`, body),
    onSuccess,
  });
  const updateVariant = useMutation({
    mutationFn: ({
      productId,
      variantId,
      body,
    }: {
      productId: string;
      variantId: string;
      body: VariantPatchInput;
    }) =>
      api.patch<AdminVariant>(
        `${productPath(productId)}/variants/${encodeURIComponent(variantId)}`,
        body,
      ),
    onSuccess,
  });
  const removeVariant = useMutation({
    mutationFn: ({ productId, variantId }: { productId: string; variantId: string }) =>
      api.delete<{ success: boolean; mode: 'deleted' | 'deactivated' }>(
        `${productPath(productId)}/variants/${encodeURIComponent(variantId)}`,
      ),
    onSuccess,
  });
  return { create, update, remove, createVariant, updateVariant, removeVariant };
}

// ---------------------------------------------------------------- валидация

/// Как PRICE_STRING в API (price-string.ts): до 8 цифр и до 2 после точки.
export const PRICE_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;
export const SLUG_PATTERN = /^[a-z0-9-]+$/;

/// Хосты картинок — ровно remotePatterns из next.config.mjs и
/// product-image-url.ts API. При расширении правятся все три места.
export const PRODUCT_IMAGE_HOSTS: readonly string[] = [
  'cdn-files.twomc.su',
  'mc-heads.net',
  'minotar.net',
];

export const PRODUCT_IMAGE_ERROR = `Только https-ссылка на хост: ${PRODUCT_IMAGE_HOSTS.join(', ')}`;

export function isAllowedProductImageUrl(value: string): boolean {
  if (value.length === 0 || value.length > 2000) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.username === '' &&
    url.password === '' &&
    url.port === '' &&
    PRODUCT_IMAGE_HOSTS.includes(url.hostname)
  );
}

/// Цена для сравнения без float: целая часть и копейки как строки.
export function priceToCents(value: string): bigint | null {
  if (!PRICE_PATTERN.test(value)) return null;
  const [whole = '0', frac = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'));
}

// ------------------------------------------------------------------- ошибки

export interface StoreAdminErrorInfo {
  /// Общее сообщение (toast / форма).
  message: string;
  /// Ошибки по полям: ключ — имя поля формы.
  fields: Record<string, string>;
  /// admin_2fa_required — нужна 2FA.
  needsTwoFactor: boolean;
  forbidden: boolean;
}

const FIELD_MATCHERS: Array<[string, RegExp]> = [
  ['slug', /slug/i],
  ['image', /image|картинк/i],
  ['price', /price|цена/i],
  ['name', /^name\b/i],
  ['description', /^description\b/i],
  ['fullDescription', /^fullDescription\b/i],
  ['categoryId', /categoryId|категори/i],
  ['maxPerPurchase', /maxPerPurchase/i],
  ['order', /^order\b/i],
  ['currencyAmount', /currencyAmount/i],
  ['server', /^server\b/i],
];

/// Разбор ошибки API админки магазина: коды 409/422/403, 2FA, валидация 400.
export function describeStoreAdminError(error: unknown): StoreAdminErrorInfo {
  if (!(error instanceof ApiError)) {
    return {
      message: error instanceof Error ? error.message : 'Неизвестная ошибка',
      fields: {},
      needsTwoFactor: false,
      forbidden: false,
    };
  }
  const info: StoreAdminErrorInfo = {
    message: error.messages.join('. '),
    fields: {},
    needsTwoFactor: false,
    forbidden: false,
  };
  if (error.status === 403) {
    if (error.code === 'admin_2fa_required') {
      info.needsTwoFactor = true;
      info.message =
        'Для действий в админке нужна двухфакторная аутентификация. Включите её в настройках аккаунта.';
    } else {
      info.forbidden = true;
      info.message = 'Недостаточно прав для этого действия.';
    }
    return info;
  }
  switch (error.code) {
    case 'PRODUCT_IN_BUNDLE':
      info.message =
        'Товар входит в набор, поэтому его нельзя удалить. Сначала уберите товар из набора.';
      return info;
    case 'VARIANT_IN_BUNDLE':
      info.message =
        'Вариант входит в набор, поэтому его нельзя удалить. Сначала уберите его из набора.';
      return info;
    case 'CATEGORY_HAS_CHILDREN':
      info.message =
        'В категории есть подкатегории, поэтому её нельзя удалить. Сначала удалите или перенесите подкатегории.';
      return info;
    case 'CATEGORY_HAS_PRODUCTS':
      info.message =
        'В категории есть товары, поэтому её нельзя удалить. Сначала перенесите или удалите товары.';
      return info;
    case 'PRODUCT_TYPE_NOT_SELLABLE':
      info.fields.isActive =
        'Тип этого товара не входит в список продаваемых — активировать его нельзя.';
      return info;
    default:
      break;
  }
  if (error.status === 409) {
    // «Товар с таким slug уже существует», «Вариант с такой длительностью…».
    if (/slug/i.test(error.message)) info.fields.slug = error.message;
    else if (/длительност/i.test(error.message)) info.fields.duration = error.message;
    // Прочие 409 (в т.ч. без кода): общий фолбэк — текст API (по умолчанию «Конфликт данных»).
    return info;
  }
  if (error.status === 400 || error.status === 422) {
    for (const message of error.messages) {
      const hit = FIELD_MATCHERS.find(([, re]) => re.test(message));
      if (hit && !info.fields[hit[0]]) info.fields[hit[0]] = message;
    }
  }
  return info;
}
