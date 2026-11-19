import {
  PRICE_PATTERN,
  PRODUCT_IMAGE_ERROR,
  SLUG_PATTERN,
  isAllowedProductImageUrl,
  priceToCents,
  type AdminCurrencyType,
  type AdminProduct,
  type AdminProductType,
  type AdminVariant,
  type ProductCreateInput,
  type ProductPatchInput,
  type VariantCreateInput,
} from '@/lib/admin/store-products';
import type { ProductDuration } from '@/lib/store/catalog';

/// Состояние формы товара — только строки и булевы: числа и цены хранятся
/// строками до отправки (цена уходит в API Decimal-строкой, без float).

export interface ProductFormState {
  name: string;
  slug: string;
  type: AdminProductType;
  categoryId: string;
  description: string;
  fullDescription: string;
  image: string;
  isGiftable: boolean;
  isSelfOnly: boolean;
  isUnique: boolean;
  isSeasonalOnly: boolean;
  isFeatured: boolean;
  maxPerPurchase: string;
  currencyType: AdminCurrencyType | '';
  currencyAmount: string;
  server: string;
  order: string;
  isActive: boolean;
}

export interface VariantDraft {
  key: string;
  duration: ProductDuration;
  price: string;
  oldPrice: string;
  order: string;
}

export type FormErrors = Record<string, string>;

export function emptyProductForm(categoryId = ''): ProductFormState {
  return {
    name: '',
    slug: '',
    type: 'PRIVILEGE',
    categoryId,
    description: '',
    fullDescription: '',
    image: '',
    isGiftable: true,
    isSelfOnly: false,
    isUnique: false,
    isSeasonalOnly: false,
    isFeatured: false,
    maxPerPurchase: '',
    currencyType: '',
    currencyAmount: '',
    server: '',
    order: '0',
    isActive: false,
  };
}

export function formFromProduct(product: AdminProduct): ProductFormState {
  return {
    name: product.name,
    slug: product.slug,
    type: product.type,
    categoryId: product.categoryId,
    description: product.description ?? '',
    fullDescription: product.fullDescription ?? '',
    image: product.image ?? '',
    isGiftable: product.isGiftable,
    isSelfOnly: product.isSelfOnly,
    isUnique: product.isUnique,
    isSeasonalOnly: product.isSeasonalOnly,
    isFeatured: product.isFeatured,
    maxPerPurchase: product.maxPerPurchase === null ? '' : String(product.maxPerPurchase),
    currencyType: product.currencyType ?? '',
    currencyAmount: product.currencyAmount === null ? '' : String(product.currencyAmount),
    server: product.server ?? '',
    order: String(product.order),
    isActive: product.isActive,
  };
}

let draftCounter = 0;
export function newVariantDraft(duration: ProductDuration = 'FOREVER'): VariantDraft {
  draftCounter += 1;
  return { key: `draft-${draftCounter}`, duration, price: '', oldPrice: '', order: '0' };
}

const INTEGER = /^\d+$/;

/// Ошибка цены/старой цены варианта (общая для создания и правки).
export function validatePrices(price: string, oldPrice: string): Record<string, string> {
  const errors: Record<string, string> = {};
  const trimmedPrice = price.trim();
  if (!PRICE_PATTERN.test(trimmedPrice)) {
    errors.price = 'Цена — число, до 2 знаков после точки, например 199.00';
  }
  const trimmedOld = oldPrice.trim();
  if (trimmedOld) {
    if (!PRICE_PATTERN.test(trimmedOld)) {
      errors.oldPrice = 'Старая цена — число, до 2 знаков после точки';
    } else if (!errors.price) {
      const now = priceToCents(trimmedPrice);
      const old = priceToCents(trimmedOld);
      if (now !== null && old !== null && old <= now) {
        errors.oldPrice = 'Старая цена должна быть выше текущей';
      }
    }
  }
  return errors;
}

export function validateProductForm(
  form: ProductFormState,
  mode: 'create' | 'edit',
  original?: AdminProduct,
): FormErrors {
  const errors: FormErrors = {};
  const name = form.name.trim();
  if (!name) errors.name = 'Введите название';
  else if (name.length > 200) errors.name = 'Не длиннее 200 символов';
  if (mode === 'create') {
    if (!form.slug) errors.slug = 'Введите slug';
    else if (!SLUG_PATTERN.test(form.slug) || form.slug.length > 160) {
      errors.slug = 'Только строчные латинские буквы, цифры и дефис';
    }
  }
  if (!form.categoryId) errors.categoryId = 'Выберите категорию';
  if (form.description.length > 500) errors.description = 'Не длиннее 500 символов';
  if (form.fullDescription.length > 5000) errors.fullDescription = 'Не длиннее 5000 символов';

  const image = form.image.trim();
  if (image) {
    if (!isAllowedProductImageUrl(image)) errors.image = PRODUCT_IMAGE_ERROR;
  } else if (mode === 'edit' && original?.image) {
    errors.image =
      'Очистить картинку пока нельзя (ограничение API): укажите новую ссылку или верните прежнюю';
  }

  const maxPer = form.maxPerPurchase.trim();
  if (maxPer) {
    if (!INTEGER.test(maxPer) || Number(maxPer) < 1) {
      errors.maxPerPurchase = 'Целое число от 1';
    }
  } else if (mode === 'edit' && original?.maxPerPurchase) {
    errors.maxPerPurchase =
      'Снять лимит пока нельзя (ограничение API): укажите число или верните прежнее';
  }

  if (!INTEGER.test(form.order.trim())) errors.order = 'Целое число от 0';

  if (form.type === 'CURRENCY') {
    if (!form.currencyType) errors.currencyType = 'Выберите валюту';
    const amount = form.currencyAmount.trim();
    if (!INTEGER.test(amount) || Number(amount) < 1) {
      errors.currencyAmount = 'Целое число от 1';
    }
  }
  if (form.server.length > 100) errors.server = 'Не длиннее 100 символов';
  return errors;
}

export function validateVariantDrafts(variants: VariantDraft[]): Record<string, FormErrors> {
  const result: Record<string, FormErrors> = {};
  const seen = new Set<string>();
  for (const draft of variants) {
    const errors: FormErrors = validatePrices(draft.price, draft.oldPrice);
    if (!INTEGER.test(draft.order.trim())) errors.order = 'Целое число от 0';
    if (seen.has(draft.duration)) errors.duration = 'Срок уже выбран в другом варианте';
    seen.add(draft.duration);
    if (Object.keys(errors).length > 0) result[draft.key] = errors;
  }
  return result;
}

export function variantInput(draft: VariantDraft): VariantCreateInput {
  return {
    duration: draft.duration,
    price: draft.price.trim(),
    ...(draft.oldPrice.trim() ? { oldPrice: draft.oldPrice.trim() } : {}),
    order: Number(draft.order.trim() || '0'),
  };
}

/// Тело создания: без isActive (товар всегда создаётся неактивным) и без
/// gameCommands (шаблоны выдачи — только 0.11).
export function buildCreateBody(
  form: ProductFormState,
  variants: VariantDraft[],
): ProductCreateInput {
  const body: ProductCreateInput = {
    name: form.name.trim(),
    slug: form.slug,
    type: form.type,
    categoryId: form.categoryId,
    isGiftable: form.isGiftable,
    isSelfOnly: form.isSelfOnly,
    isUnique: form.isUnique,
    isSeasonalOnly: form.isSeasonalOnly,
    isFeatured: form.isFeatured,
    order: Number(form.order.trim() || '0'),
    variants: variants.map(variantInput),
  };
  if (form.description.trim()) body.description = form.description.trim();
  if (form.fullDescription.trim()) body.fullDescription = form.fullDescription;
  if (form.image.trim()) body.image = form.image.trim();
  if (form.maxPerPurchase.trim()) body.maxPerPurchase = Number(form.maxPerPurchase.trim());
  if (form.type === 'CURRENCY' && form.currencyType) {
    body.currencyType = form.currencyType;
    body.currencyAmount = Number(form.currencyAmount.trim());
  }
  if (form.server.trim()) body.server = form.server.trim();
  return body;
}

/// PATCH только с изменёнными полями. Очистка image/maxPerPurchase не
/// отправляется (валидатор формы её не пропускает).
export function buildPatch(form: ProductFormState, original: AdminProduct): ProductPatchInput {
  const patch: ProductPatchInput = {};
  const before = formFromProduct(original);
  if (form.name.trim() !== before.name) patch.name = form.name.trim();
  if (form.categoryId !== before.categoryId) patch.categoryId = form.categoryId;
  if (form.description.trim() !== before.description) patch.description = form.description.trim();
  if (form.fullDescription !== before.fullDescription) patch.fullDescription = form.fullDescription;
  if (form.image.trim() !== before.image && form.image.trim()) patch.image = form.image.trim();
  if (form.isGiftable !== before.isGiftable) patch.isGiftable = form.isGiftable;
  if (form.isSelfOnly !== before.isSelfOnly) patch.isSelfOnly = form.isSelfOnly;
  if (form.isUnique !== before.isUnique) patch.isUnique = form.isUnique;
  if (form.isSeasonalOnly !== before.isSeasonalOnly) patch.isSeasonalOnly = form.isSeasonalOnly;
  if (form.isFeatured !== before.isFeatured) patch.isFeatured = form.isFeatured;
  if (form.isActive !== before.isActive) patch.isActive = form.isActive;
  if (form.maxPerPurchase.trim() !== before.maxPerPurchase && form.maxPerPurchase.trim()) {
    patch.maxPerPurchase = Number(form.maxPerPurchase.trim());
  }
  if (form.currencyType !== before.currencyType && form.currencyType) {
    patch.currencyType = form.currencyType;
  }
  if (form.currencyAmount.trim() !== before.currencyAmount && form.currencyAmount.trim()) {
    patch.currencyAmount = Number(form.currencyAmount.trim());
  }
  if (form.server.trim() !== before.server) patch.server = form.server.trim();
  if (form.order.trim() !== before.order) patch.order = Number(form.order.trim());
  return patch;
}

export interface VariantRowState {
  price: string;
  oldPrice: string;
  order: string;
  isActive: boolean;
}

export function rowFromVariant(variant: AdminVariant): VariantRowState {
  return {
    price: variant.price,
    oldPrice: variant.oldPrice ?? '',
    order: String(variant.order),
    isActive: variant.isActive,
  };
}
