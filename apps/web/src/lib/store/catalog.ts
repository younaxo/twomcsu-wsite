import type { DecimalString } from '@twomc/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Витрина магазина (слой 0, подэтап 0.1). Формы ответов — как отдаёт API
/// (`GET /store/products`, `/store/products/:slug`, `/store/categories`,
/// `/store/products/:slug/bought-together`). Цен и товаров в коде нет —
/// только данные API. Необязательные поля, которых API может не отдавать,
/// помечены `?`: UI остаётся устойчивым к их отсутствию.

export type ProductDuration = 'FOREVER' | 'MONTHS_3' | 'MONTH_1' | 'WEEK_1' | 'SEASON' | 'ONE_TIME';

export const DURATION_LABEL: Record<ProductDuration, string> = {
  FOREVER: 'Навсегда',
  MONTHS_3: '3 месяца',
  MONTH_1: '1 месяц',
  WEEK_1: '1 неделя',
  SEASON: 'На сезон',
  ONE_TIME: 'Разово',
};

export function durationLabel(duration: string | undefined, fallback = 'Вариант'): string {
  return (duration && DURATION_LABEL[duration as ProductDuration]) || fallback;
}

export interface StoreVariant {
  id: string;
  duration?: ProductDuration;
  /// Устарело и НЕ отображается: API не отдаёт название варианта (человекочитаемая
  /// подпись строится из `duration` через `durationLabel`, с безопасным fallback
  /// «Вариант»). Поле оставлено для совместимости типов.
  /** @deprecated не использовать в UI; см. durationLabel */
  name?: string;
  price: DecimalString;
  oldPrice?: DecimalString | null;
  isActive?: boolean;
}

export interface StoreCategory {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  parentId?: string | null;
}

export interface StoreProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  fullDescription?: string | null;
  image: string | null;
  images?: string[];
  type?: string;
  category?: { id: string; name: string; slug: string } | null;
  variants?: StoreVariant[];
  isUnique?: boolean;
  isGiftable?: boolean;
  isSelfOnly?: boolean;
  maxPerPurchase?: number | null;
  isNew?: boolean;
  isPopular?: boolean;
  isFeatured?: boolean;
  /// API пока НЕ отдаёт: «уже куплено» для уникальных (требование к дорожке B).
  alreadyPurchased?: boolean;
}

export interface StoreProductList {
  items: StoreProduct[];
  total: number;
  page: number;
  limit: number;
}

export const CATALOG_PAGE_SIZE = 24;
/// Предел поля количества, если `maxPerPurchase` не задан (защита интерфейса, не правило сервера).
export const DEFAULT_MAX_QUANTITY = 99;

export function activeVariants(product: Pick<StoreProduct, 'variants'>): StoreVariant[] {
  return (product.variants ?? [])
    .filter((variant) => variant.isActive !== false)
    .sort((a, b) => numeric(a.price) - numeric(b.price));
}

function numeric(value: DecimalString): number {
  return Number(value);
}

/// Самый дешёвый вариант и признак «цены отличаются» (тогда показываем «от»).
export function priceSummary(product: Pick<StoreProduct, 'variants'>): {
  min: DecimalString | null;
  hasRange: boolean;
} {
  const variants = activeVariants(product);
  if (variants.length === 0) return { min: null, hasRange: false };
  let min = variants[0]!.price;
  let hasRange = false;
  for (const variant of variants) {
    if (numeric(variant.price) !== numeric(min)) hasRange = true;
    if (numeric(variant.price) < numeric(min)) min = variant.price;
  }
  return { min, hasRange };
}

export function quantityLimit(product: Pick<StoreProduct, 'isUnique' | 'maxPerPurchase'>): number {
  if (product.isUnique) return 1;
  if (product.maxPerPurchase && product.maxPerPurchase > 0) return product.maxPerPurchase;
  return DEFAULT_MAX_QUANTITY;
}

export interface CatalogFilters {
  categorySlug: string | null;
  search: string;
  page: number;
}

export function useStoreCategories() {
  return useQuery({
    queryKey: ['site', 'store', 'categories'],
    queryFn: () => api.get<StoreCategory[]>('/store/categories', { auth: false }),
    staleTime: 60_000,
  });
}

export function useStoreProducts(filters: CatalogFilters) {
  const search = filters.search.trim();
  return useQuery({
    queryKey: ['site', 'store', 'products', filters.categorySlug, search, filters.page],
    queryFn: () =>
      api.get<StoreProductList>('/store/products', {
        auth: false,
        query: {
          page: filters.page,
          limit: CATALOG_PAGE_SIZE,
          ...(filters.categorySlug ? { categorySlug: filters.categorySlug } : {}),
          ...(search ? { search } : {}),
        },
      }),
    placeholderData: (previous) => previous,
  });
}

export function useStoreProduct(slug: string) {
  return useQuery({
    queryKey: ['site', 'store', 'product', slug],
    // Просмотр зависит от входа (inWishlist), поэтому токен прикладываем, если он есть.
    queryFn: () => api.get<StoreProduct>(`/store/products/${encodeURIComponent(slug)}`),
    retry: false,
  });
}

export function useBoughtTogether(slug: string) {
  return useQuery({
    queryKey: ['site', 'store', 'bought-together', slug],
    queryFn: () =>
      api.get<StoreProduct[]>(`/store/products/${encodeURIComponent(slug)}/bought-together`, {
        auth: false,
      }),
    retry: false,
  });
}
