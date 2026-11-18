'use client';

import type { DecimalString, IsoDateString } from '@twomc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { DiscountType } from './store-discounts';
import type { AdminProductType } from './store-products';

/// Админка магазина, слой 0 / подэтап 0.4: промокоды.
/// Контракт — promocodes-admin.controller.ts: GET /admin/promocodes?search=
/// (массив, до 500 записей, без пагинации), POST, PATCH /:id, DELETE /:id.
/// Ограничения API: code после создания не меняется; в create нет isActive;
/// PATCH не умеет снимать validFrom/validUntil (null игнорируется), а maxUses
/// нельзя опустить ниже usedCount. Заказы по промокоду блокируют удаление (409).

export const PROMO_CODE_PATTERN = /^[A-Z0-9-]+$/;

export interface AdminPromoCode {
  id: string;
  code: string;
  description: string | null;
  discountType: DiscountType;
  discountValue: DecimalString;
  maxUses: number | null;
  usedCount: number;
  validFrom: IsoDateString | null;
  validUntil: IsoDateString | null;
  isActive: boolean;
  applicableToTypes: AdminProductType[];
  minOrderAmount: DecimalString | null;
  firstPurchaseOnly: boolean;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export interface PromoCodeCreateInput {
  code: string;
  description?: string;
  discountType: DiscountType;
  discountValue: string;
  maxUses?: number;
  validFrom?: string;
  validUntil?: string;
  applicableToTypes?: AdminProductType[];
  minOrderAmount?: string;
  firstPurchaseOnly?: boolean;
}

export type PromoCodePatchInput = Partial<Omit<PromoCodeCreateInput, 'code'>> & {
  isActive?: boolean;
};

/// Состояние промокода для бейджа: от реального времени, а не от флага isActive.
export type PromoStatus = 'inactive' | 'scheduled' | 'expired' | 'exhausted' | 'active';

export function promoStatus(promo: AdminPromoCode, now: Date = new Date()): PromoStatus {
  if (!promo.isActive) return 'inactive';
  if (promo.validFrom && new Date(promo.validFrom) > now) return 'scheduled';
  if (promo.validUntil && new Date(promo.validUntil) < now) return 'expired';
  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) return 'exhausted';
  return 'active';
}

export const PROMO_STATUS_META: Record<
  PromoStatus,
  { label: string; tone: 'neutral' | 'success' | 'warning' | 'destructive' | 'info' }
> = {
  active: { label: 'Действует', tone: 'success' },
  inactive: { label: 'Отключён', tone: 'neutral' },
  scheduled: { label: 'Ещё не начался', tone: 'info' },
  expired: { label: 'Истёк', tone: 'warning' },
  exhausted: { label: 'Исчерпан', tone: 'warning' },
};

export const adminPromoKeys = {
  all: ['admin', 'store', 'promocodes'] as const,
  list: (search: string) => ['admin', 'store', 'promocodes', 'list', search] as const,
};

const BASE = '/admin/promocodes';

export function useAdminPromoCodes(search: string) {
  const q = search.trim();
  return useQuery({
    queryKey: adminPromoKeys.list(q),
    queryFn: () => api.get<AdminPromoCode[]>(BASE, { query: q ? { search: q } : {} }),
  });
}

export function usePromoCodeActions() {
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: adminPromoKeys.all });
  const create = useMutation({
    mutationFn: (body: PromoCodeCreateInput) => api.post<AdminPromoCode>(BASE, body),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: PromoCodePatchInput }) =>
      api.patch<AdminPromoCode>(`${BASE}/${encodeURIComponent(id)}`, body),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`${BASE}/${encodeURIComponent(id)}`),
    onSuccess,
  });
  return { create, update, remove };
}
