import {
  validateDiscountValue,
  validateInteger,
  validateOptionalMoney,
  validatePercent,
  type AdminBulkDiscount,
  type AdminLoyaltyDiscount,
  type BulkDiscountCreateInput,
  type BulkDiscountPatchInput,
  type DiscountType,
  type LoyaltyDiscountCreateInput,
  type LoyaltyDiscountPatchInput,
} from '@/lib/admin/store-discounts';
import type { AdminProductType } from '@/lib/admin/store-products';

/// Формы скидок (0.4). Всё — строки (ADR-0087, без нативных числовых полей); суммы и
/// проценты — Decimal-строки.

export type BulkScope = 'all' | 'type' | 'product';

export interface BulkFormState {
  scope: BulkScope;
  productId: string;
  productType: AdminProductType | '';
  minQuantity: string;
  minAmount: string;
  discountType: DiscountType;
  discountValue: string;
  isActive: boolean;
}

export function initialBulkForm(discount: AdminBulkDiscount | null): BulkFormState {
  return {
    scope: discount?.productId ? 'product' : discount?.productType ? 'type' : 'all',
    productId: discount?.productId ?? '',
    productType: discount?.productType ?? '',
    minQuantity: String(discount?.minQuantity ?? 0),
    minAmount: discount?.minAmount ?? '',
    discountType: discount?.discountType ?? 'PERCENT',
    discountValue: discount?.discountValue ?? '',
    isActive: discount?.isActive ?? true,
  };
}

/// Область действия (товар/тип) после создания не меняется — API не принимает
/// productId/productType в PATCH, поэтому при правке она не проверяется.
export function validateBulkForm(
  form: BulkFormState,
  existing: AdminBulkDiscount | null,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!existing) {
    if (form.scope === 'product' && !form.productId) errors.productId = 'Выберите товар';
    if (form.scope === 'type' && !form.productType) errors.productType = 'Выберите тип товара';
  }
  const quantity = validateInteger(form.minQuantity, 0);
  if (quantity) errors.minQuantity = quantity;
  const amount = validateOptionalMoney(form.minAmount);
  if (amount) errors.minAmount = amount;
  else if (existing && existing.minAmount !== null && !form.minAmount.trim()) {
    errors.minAmount = 'Снять порог суммы пока нельзя (ограничение API): укажите значение';
  }
  const value = validateDiscountValue(form.discountType, form.discountValue);
  if (value) errors.discountValue = value;
  return errors;
}

export function buildBulkCreate(form: BulkFormState): BulkDiscountCreateInput {
  return {
    discountType: form.discountType,
    discountValue: form.discountValue.trim(),
    minQuantity: Number(form.minQuantity),
    ...(form.minAmount.trim() ? { minAmount: form.minAmount.trim() } : {}),
    ...(form.scope === 'product' && form.productId ? { productId: form.productId } : {}),
    ...(form.scope === 'type' && form.productType ? { productType: form.productType } : {}),
  };
}

export function buildBulkPatch(
  form: BulkFormState,
  before: AdminBulkDiscount,
): BulkDiscountPatchInput {
  const initial = initialBulkForm(before);
  const patch: BulkDiscountPatchInput = {};
  if (form.minQuantity.trim() !== initial.minQuantity) patch.minQuantity = Number(form.minQuantity);
  if (form.minAmount.trim() !== initial.minAmount && form.minAmount.trim()) {
    patch.minAmount = form.minAmount.trim();
  }
  if (form.discountType !== initial.discountType) patch.discountType = form.discountType;
  if (form.discountValue.trim() !== initial.discountValue) {
    patch.discountValue = form.discountValue.trim();
  }
  if (form.isActive !== initial.isActive) patch.isActive = form.isActive;
  return patch;
}

export interface LoyaltyFormState {
  name: string;
  description: string;
  minPurchases: string;
  discountPercent: string;
  isActive: boolean;
}

export function initialLoyaltyForm(discount: AdminLoyaltyDiscount | null): LoyaltyFormState {
  return {
    name: discount?.name ?? '',
    description: discount?.description ?? '',
    minPurchases: discount ? String(discount.minPurchases) : '',
    discountPercent: discount?.discountPercent ?? '',
    isActive: discount?.isActive ?? true,
  };
}

export function validateLoyaltyForm(form: LoyaltyFormState): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = form.name.trim();
  if (!name) errors.name = 'Введите название';
  else if (name.length > 100) errors.name = 'Не длиннее 100 символов';
  if (form.description.length > 500) errors.description = 'Не длиннее 500 символов';
  const purchases = validateInteger(form.minPurchases, 1);
  if (purchases) errors.minPurchases = purchases;
  const percent = validatePercent(form.discountPercent);
  if (percent) errors.discountPercent = percent;
  return errors;
}

export function buildLoyaltyCreate(form: LoyaltyFormState): LoyaltyDiscountCreateInput {
  const description = form.description.trim();
  return {
    name: form.name.trim(),
    minPurchases: Number(form.minPurchases),
    discountPercent: form.discountPercent.trim(),
    ...(description ? { description } : {}),
  };
}

export function buildLoyaltyPatch(
  form: LoyaltyFormState,
  before: AdminLoyaltyDiscount,
): LoyaltyDiscountPatchInput {
  const initial = initialLoyaltyForm(before);
  const patch: LoyaltyDiscountPatchInput = {};
  if (form.name.trim() !== initial.name) patch.name = form.name.trim();
  if (form.description.trim() !== initial.description) patch.description = form.description.trim();
  if (form.minPurchases.trim() !== initial.minPurchases) {
    patch.minPurchases = Number(form.minPurchases);
  }
  if (form.discountPercent.trim() !== initial.discountPercent) {
    patch.discountPercent = form.discountPercent.trim();
  }
  if (form.isActive !== initial.isActive) patch.isActive = form.isActive;
  return patch;
}
