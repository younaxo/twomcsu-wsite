import {
  validateBundleDescription,
  validateBundleImage,
  validateBundleItems,
  validateBundleName,
  validateBundlePrice,
  validateBundleSlug,
  type AdminBundle,
  type BundleCreateInput,
  type BundleItemDraft,
  type BundlePatchInput,
} from '@/lib/admin/store-bundles';
import { dateToEndIso, dateToStartIso, isoToDateInput } from '@/lib/admin/store-discounts';

/// Форма набора (1.3). Всё — строки; цены уходят в API числами (DTO `@IsNumber`).

export interface BundleItemRow extends BundleItemDraft {
  productName: string;
  variantLabel: string;
}

export interface BundleFormState {
  name: string;
  slug: string;
  description: string;
  image: string;
  totalPrice: string;
  originalPrice: string;
  isActive: boolean;
  isFeatured: boolean;
  validFrom: string;
  validUntil: string;
  items: BundleItemRow[];
}

export function initialBundleForm(bundle: AdminBundle | null): BundleFormState {
  return {
    name: bundle?.name ?? '',
    slug: bundle?.slug ?? '',
    description: bundle?.description ?? '',
    image: bundle?.image ?? '',
    totalPrice: bundle?.totalPrice ?? '',
    originalPrice: bundle?.originalPrice ?? '',
    // Новый набор создаётся выключенным: сначала проверить состав и цены.
    isActive: bundle?.isActive ?? false,
    isFeatured: bundle?.isFeatured ?? false,
    validFrom: isoToDateInput(bundle?.validFrom),
    validUntil: isoToDateInput(bundle?.validUntil),
    items: (bundle?.items ?? []).map((item) => ({
      productId: item.productId,
      variantId: item.variantId ?? '',
      quantity: String(item.quantity),
      productName: item.product?.name ?? item.productId,
      variantLabel: '',
    })),
  };
}

export function validateBundleForm(
  form: BundleFormState,
  existing: AdminBundle | null,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const set = (key: string, message: string | null) => {
    if (message) errors[key] = message;
  };
  set('name', validateBundleName(form.name));
  if (!existing) set('slug', validateBundleSlug(form.slug));
  set('description', validateBundleDescription(form.description));
  set('image', validateBundleImage(form.image));
  set('totalPrice', validateBundlePrice(form.totalPrice));
  set('originalPrice', validateBundlePrice(form.originalPrice));
  if (form.validFrom && form.validUntil && form.validFrom > form.validUntil) {
    errors.validUntil = 'Дата окончания раньше даты начала';
  }
  set('items', validateBundleItems(form.items));
  return errors;
}

function itemsInput(form: BundleFormState) {
  return form.items.map((item) => ({
    productId: item.productId,
    ...(item.variantId ? { variantId: item.variantId } : {}),
    quantity: Number(item.quantity),
  }));
}

function itemsKey(
  items: Array<{ productId: string; variantId?: string | null; quantity: number }>,
) {
  return JSON.stringify(items.map((i) => [i.productId, i.variantId ?? '', i.quantity]).sort());
}

export function buildBundleCreate(form: BundleFormState): BundleCreateInput {
  const description = form.description.trim();
  const image = form.image.trim();
  return {
    name: form.name.trim(),
    slug: form.slug.trim(),
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
    totalPrice: Number(form.totalPrice.trim()),
    originalPrice: Number(form.originalPrice.trim()),
    isActive: form.isActive,
    isFeatured: form.isFeatured,
    ...(form.validFrom ? { validFrom: dateToStartIso(form.validFrom) } : {}),
    ...(form.validUntil ? { validUntil: dateToEndIso(form.validUntil) } : {}),
    items: itemsInput(form),
  };
}

/// PATCH только с изменёнными полями. Даты очистить нельзя: API игнорирует
/// пустое значение, поэтому «снятая» дата в патч не попадает.
export function buildBundlePatch(form: BundleFormState, bundle: AdminBundle): BundlePatchInput {
  const patch: BundlePatchInput = {};
  if (form.name.trim() !== bundle.name) patch.name = form.name.trim();
  if (form.description.trim() !== (bundle.description ?? '')) {
    patch.description = form.description.trim();
  }
  if (form.image.trim() !== (bundle.image ?? '')) patch.image = form.image.trim();
  const total = Number(form.totalPrice.trim());
  if (total !== Number(bundle.totalPrice)) patch.totalPrice = total;
  const original = Number(form.originalPrice.trim());
  if (original !== Number(bundle.originalPrice)) patch.originalPrice = original;
  if (form.isActive !== bundle.isActive) patch.isActive = form.isActive;
  if (form.isFeatured !== bundle.isFeatured) patch.isFeatured = form.isFeatured;
  if (form.validFrom && form.validFrom !== isoToDateInput(bundle.validFrom)) {
    patch.validFrom = dateToStartIso(form.validFrom);
  }
  if (form.validUntil && form.validUntil !== isoToDateInput(bundle.validUntil)) {
    patch.validUntil = dateToEndIso(form.validUntil);
  }
  const items = itemsInput(form);
  if (itemsKey(items) !== itemsKey(bundle.items)) patch.items = items;
  return patch;
}
