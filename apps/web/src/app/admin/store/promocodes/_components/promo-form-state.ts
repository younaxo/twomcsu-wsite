import {
  dateToEndIso,
  dateToStartIso,
  isoToDateInput,
  validateDiscountValue,
  validateInteger,
  validateOptionalMoney,
  type DiscountType,
} from '@/lib/admin/store-discounts';
import {
  PROMO_CODE_PATTERN,
  type AdminPromoCode,
  type PromoCodeCreateInput,
  type PromoCodePatchInput,
} from '@/lib/admin/store-promocodes';
import type { AdminProductType } from '@/lib/admin/store-products';

/// Состояние формы промокода: всё — строки (ADR-0087, без нативных числовых полей),
/// суммы — Decimal-строки, даты — `YYYY-MM-DD`.
export interface PromoFormState {
  code: string;
  description: string;
  discountType: DiscountType;
  discountValue: string;
  maxUses: string;
  validFrom: string;
  validUntil: string;
  applicableToTypes: AdminProductType[];
  minOrderAmount: string;
  firstPurchaseOnly: boolean;
  isActive: boolean;
}

export function initialPromoForm(promo: AdminPromoCode | null): PromoFormState {
  return {
    code: promo?.code ?? '',
    description: promo?.description ?? '',
    discountType: promo?.discountType ?? 'PERCENT',
    discountValue: promo?.discountValue ?? '',
    maxUses: promo?.maxUses != null ? String(promo.maxUses) : '',
    validFrom: isoToDateInput(promo?.validFrom),
    validUntil: isoToDateInput(promo?.validUntil),
    applicableToTypes: promo?.applicableToTypes ?? [],
    minOrderAmount: promo?.minOrderAmount ?? '',
    firstPurchaseOnly: promo?.firstPurchaseOnly ?? false,
    isActive: promo?.isActive ?? true,
  };
}

const CLEAR_UNSUPPORTED =
  'Снять ограничение пока нельзя (ограничение API): укажите новое значение или верните прежнее';

/// Проверка формы. Для правки (`existing`) нельзя снять уже заданные даты:
/// PATCH их игнорирует, и человек решил бы, что ограничение снято.
export function validatePromoForm(
  form: PromoFormState,
  existing: AdminPromoCode | null,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!existing) {
    if (!form.code) errors.code = 'Введите код';
    else if (form.code.length < 3 || form.code.length > 32) errors.code = 'От 3 до 32 символов';
    else if (!PROMO_CODE_PATTERN.test(form.code)) {
      errors.code = 'Только заглавные латинские буквы, цифры и дефис';
    }
  }
  if (form.description.length > 500) errors.description = 'Не длиннее 500 символов';
  const value = validateDiscountValue(form.discountType, form.discountValue);
  if (value) errors.discountValue = value;
  const maxUses = validateInteger(form.maxUses, 1, true);
  if (maxUses) errors.maxUses = maxUses;
  else if (existing && existing.maxUses !== null && !form.maxUses.trim()) {
    errors.maxUses = CLEAR_UNSUPPORTED;
  } else if (existing && form.maxUses.trim() && Number(form.maxUses) < existing.usedCount) {
    errors.maxUses = `Не меньше уже использованного числа раз (${existing.usedCount})`;
  }
  const minAmount = validateOptionalMoney(form.minOrderAmount);
  if (minAmount) errors.minOrderAmount = minAmount;
  else if (existing && existing.minOrderAmount !== null && !form.minOrderAmount.trim()) {
    errors.minOrderAmount = CLEAR_UNSUPPORTED;
  }
  if (existing?.validFrom && !form.validFrom) errors.validFrom = CLEAR_UNSUPPORTED;
  if (existing?.validUntil && !form.validUntil) errors.validUntil = CLEAR_UNSUPPORTED;
  if (form.validFrom && form.validUntil && form.validUntil < form.validFrom) {
    errors.validUntil = 'Дата окончания не может быть раньше даты начала';
  }
  return errors;
}

/// Тело создания: пустые необязательные поля не отправляются.
export function buildPromoCreate(form: PromoFormState): PromoCodeCreateInput {
  const description = form.description.trim();
  return {
    code: form.code,
    discountType: form.discountType,
    discountValue: form.discountValue.trim(),
    ...(description ? { description } : {}),
    ...(form.maxUses.trim() ? { maxUses: Number(form.maxUses) } : {}),
    ...(form.validFrom ? { validFrom: dateToStartIso(form.validFrom) } : {}),
    ...(form.validUntil ? { validUntil: dateToEndIso(form.validUntil) } : {}),
    ...(form.applicableToTypes.length > 0 ? { applicableToTypes: form.applicableToTypes } : {}),
    ...(form.minOrderAmount.trim() ? { minOrderAmount: form.minOrderAmount.trim() } : {}),
    ...(form.firstPurchaseOnly ? { firstPurchaseOnly: true } : {}),
  };
}

/// Тело правки: только изменённые поля. Список типов отправляется целиком, если
/// он изменился (пустой массив = «все типы»).
export function buildPromoPatch(form: PromoFormState, before: AdminPromoCode): PromoCodePatchInput {
  const initial = initialPromoForm(before);
  const patch: PromoCodePatchInput = {};
  if (form.description.trim() !== initial.description) patch.description = form.description.trim();
  if (form.discountType !== initial.discountType) patch.discountType = form.discountType;
  if (form.discountValue.trim() !== initial.discountValue) {
    patch.discountValue = form.discountValue.trim();
  }
  // Тип без нового значения тоже проверяется сервером по старому значению, но
  // отправляем пару вместе, чтобы аудит и проверка видели оба поля.
  if (patch.discountType && patch.discountValue === undefined) {
    patch.discountValue = form.discountValue.trim();
  }
  if (form.maxUses.trim() !== initial.maxUses && form.maxUses.trim()) {
    patch.maxUses = Number(form.maxUses);
  }
  if (form.validFrom !== initial.validFrom && form.validFrom) {
    patch.validFrom = dateToStartIso(form.validFrom);
  }
  if (form.validUntil !== initial.validUntil && form.validUntil) {
    patch.validUntil = dateToEndIso(form.validUntil);
  }
  if (form.minOrderAmount.trim() !== initial.minOrderAmount && form.minOrderAmount.trim()) {
    patch.minOrderAmount = form.minOrderAmount.trim();
  }
  if (
    [...form.applicableToTypes].sort().join(',') !== [...initial.applicableToTypes].sort().join(',')
  ) {
    patch.applicableToTypes = form.applicableToTypes;
  }
  if (form.firstPurchaseOnly !== initial.firstPurchaseOnly) {
    patch.firstPurchaseOnly = form.firstPurchaseOnly;
  }
  if (form.isActive !== initial.isActive) patch.isActive = form.isActive;
  return patch;
}
