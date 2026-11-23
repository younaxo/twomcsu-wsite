'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ProductCard } from '@/app/(site)/shop/_components/product-card';
import { PermissionGate } from '@/components/admin/permission-gate';
import { Button } from '@/components/ui/button';
import { CheckboxField } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  FormErrorSummary,
  FormField as Field,
  useFocusFirstInvalid,
} from '@/components/admin/form-field';
import { Input, Textarea, inputClassName } from '@/components/ui/input';
import { SafeMarkdown } from '@/components/ui/safe-markdown';
import { SwitchField } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import {
  CREATABLE_PRODUCT_TYPES,
  CURRENCY_TYPE_LABEL,
  PRODUCT_TYPE_LABEL,
  SELLABLE_PRODUCT_TYPES,
  describeStoreAdminError,
  isAllowedProductImageUrl,
  useAdminProductActions,
  type AdminCurrencyType,
  type AdminProduct,
  type AdminProductType,
} from '@/lib/admin/store-products';
import type { StoreProduct, StoreVariant } from '@/lib/store/catalog';
import {
  buildCreateBody,
  buildPatch,
  emptyProductForm,
  formFromProduct,
  newVariantDraft,
  validateProductForm,
  validateVariantDrafts,
  type FormErrors,
  type ProductFormState,
  type VariantDraft,
} from './product-form-state';
import { DeliveryTemplateBlock } from './delivery-template-block';
import { VariantDraftsEditor, VariantsManager } from './variants-editor';

export interface CategoryOption {
  id: string;
  name: string;
  slug: string;
}

export interface ProductPermissions {
  canCreate: boolean;
  canEdit: boolean;
  canVariants: boolean;
}

/// Карточка как на витрине: тот же ProductCard, что в /shop. Ссылка внутри
/// отключена (inert) — это только предпросмотр.
function ProductPreview({
  form,
  variants,
  category,
}: {
  form: ProductFormState;
  variants: StoreVariant[];
  category: CategoryOption | undefined;
}) {
  const image = form.image.trim();
  const product: StoreProduct = {
    id: 'preview',
    name: form.name.trim() || 'Название товара',
    slug: form.slug || 'preview',
    description: form.description.trim() || null,
    image: image && isAllowedProductImageUrl(image) ? image : null,
    type: form.type,
    category: category ?? null,
    variants,
    isFeatured: form.isFeatured,
  };
  return (
    <section aria-label="Предпросмотр карточки" className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Предпросмотр карточки на витрине</h3>
      <ul
        className="w-full max-w-64 list-none"
        data-testid="product-preview"
        ref={(el) => el?.setAttribute('inert', '')}
      >
        <ProductCard product={product} headingLevel={3} />
      </ul>
      {form.fullDescription.trim() ? (
        <div className="rounded-lg bg-surface-sunken p-3" data-testid="full-description-preview">
          <p className="mb-2 text-xs text-muted-foreground">Полное описание</p>
          <SafeMarkdown source={form.fullDescription} className="text-sm" />
        </div>
      ) : null}
    </section>
  );
}

export function ProductDialog({
  product,
  categories,
  permissions,
  open,
  onOpenChange,
}: {
  /// null — создание.
  product: AdminProduct | null;
  categories: CategoryOption[];
  permissions: ProductPermissions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const mode = product ? 'edit' : 'create';
  const { create, update } = useAdminProductActions();
  const [form, setForm] = useState<ProductFormState>(() =>
    product ? formFromProduct(product) : emptyProductForm(categories[0]?.id ?? ''),
  );
  const [drafts, setDrafts] = useState<VariantDraft[]>(() => [newVariantDraft('FOREVER')]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [draftErrors, setDraftErrors] = useState<Record<string, FormErrors>>({});
  const [formError, setFormError] = useState<{ message: string; twoFactor: boolean } | null>(null);
  const { containerRef, focusFirstInvalid } = useFocusFirstInvalid<HTMLFormElement>();
  const set = (patch: Partial<ProductFormState>) =>
    setForm((current) => ({ ...current, ...patch }));
  const readOnly = mode === 'edit' && !permissions.canEdit;
  const category = categories.find((c) => c.id === form.categoryId);

  const previewVariants = useMemo(
    () =>
      product
        ? product.variants.map((v) => ({ ...v }))
        : drafts
            .filter((d) => d.price.trim())
            .map((d) => ({
              id: d.key,
              duration: d.duration,
              price: d.price.trim(),
              oldPrice: d.oldPrice.trim() || null,
              isActive: true,
            })),
    [product, drafts],
  );

  const handleError = (error: unknown) => {
    const info = describeStoreAdminError(error);
    const known = { ...info.fields };
    // price/duration относятся к вариантам — в общую ошибку формы.
    const rest = Object.keys(known).filter(
      (key) => !['price', 'duration', 'oldPrice'].includes(key),
    );
    setErrors(Object.fromEntries(rest.map((key) => [key, known[key]!])));
    const generalFromVariants = known.price ?? known.duration ?? known.oldPrice;
    setFormError(
      rest.length > 0 && !info.needsTwoFactor && !info.forbidden
        ? { message: 'Проверьте поля формы: сервер отклонил значения.', twoFactor: false }
        : {
            message: generalFromVariants ?? info.message,
            twoFactor: info.needsTwoFactor,
          },
    );
    if (rest.length > 0) focusFirstInvalid();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const next = validateProductForm(form, mode, product ?? undefined);
    setErrors(next);
    let nextDraftErrors: Record<string, FormErrors> = {};
    let variantsListError = false;
    if (mode === 'create') {
      nextDraftErrors = validateVariantDrafts(drafts);
      variantsListError = drafts.length === 0;
      setDraftErrors(nextDraftErrors);
    }
    const invalidCount =
      Object.keys(next).length +
      Object.values(nextDraftErrors).reduce((sum, e) => sum + Object.keys(e).length, 0) +
      (variantsListError ? 1 : 0);
    if (invalidCount > 0) {
      // Одна сводка (role="alert"); ошибки полей — текстом у полей, без своих alert.
      setFormError({
        message: `Исправьте ошибки в форме (${invalidCount}). Первое поле с ошибкой выделено.`,
        twoFactor: false,
      });
      focusFirstInvalid();
      return;
    }
    if (product) {
      const body = buildPatch(form, product);
      if (Object.keys(body).length === 0) {
        toast.info('Изменений нет');
        return;
      }
      update.mutate(
        { id: product.id, body },
        {
          onSuccess: () => {
            toast.success('Товар сохранён');
            onOpenChange(false);
          },
          onError: handleError,
        },
      );
    } else {
      create.mutate(buildCreateBody(form, drafts), {
        onSuccess: () => {
          toast.success('Товар создан неактивным — включите его после проверки');
          onOpenChange(false);
        },
        onError: handleError,
      });
    }
  };

  const deliveryNote = (
    <p
      className="rounded-lg bg-surface-sunken p-3 text-xs text-muted-foreground"
      data-testid="delivery-note"
    >
      Команда выдачи задаётся владельцем после создания товара, в правке товара.
    </p>
  );
  const sellable = SELLABLE_PRODUCT_TYPES.includes(form.type);
  const types: AdminProductType[] =
    product && !CREATABLE_PRODUCT_TYPES.includes(product.type)
      ? [product.type, ...CREATABLE_PRODUCT_TYPES]
      : CREATABLE_PRODUCT_TYPES;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <form
          ref={containerRef}
          onSubmit={submit}
          noValidate
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogHeader>
            <DialogTitle>{product ? `Товар: ${product.name}` : 'Новый товар'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-4 overflow-y-auto sm:grid-cols-2">
            {formError ? (
              <FormErrorSummary data-testid="product-form-error" className="sm:col-span-2">
                {formError.message}{' '}
                {formError.twoFactor ? (
                  <Link href="/settings/security" className="font-medium underline">
                    Включить 2FA
                  </Link>
                ) : null}
              </FormErrorSummary>
            ) : null}
            <Field label="Название" required error={errors.name}>
              <Input
                value={form.name}
                maxLength={200}
                disabled={readOnly}
                onChange={(e) => set({ name: e.target.value })}
              />
            </Field>
            <Field
              label="Slug"
              required={mode === 'create'}
              error={errors.slug}
              hint={mode === 'edit' ? 'Slug не меняется после создания' : 'Адрес: /shop/slug'}
            >
              <Input
                value={form.slug}
                maxLength={160}
                spellCheck={false}
                disabled={mode === 'edit'}
                onChange={(e) => set({ slug: e.target.value.toLowerCase() })}
              />
            </Field>
            <Field
              label="Тип товара"
              hint={mode === 'edit' ? 'Тип не меняется после создания' : undefined}
            >
              <select
                className={inputClassName}
                value={form.type}
                disabled={mode === 'edit'}
                onChange={(e) => set({ type: e.target.value as AdminProductType })}
              >
                {types.map((type) => (
                  <option key={type} value={type}>
                    {PRODUCT_TYPE_LABEL[type]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Категория" required error={errors.categoryId}>
              <select
                className={inputClassName}
                value={form.categoryId}
                disabled={readOnly}
                onChange={(e) => set({ categoryId: e.target.value })}
              >
                {form.categoryId === '' ? <option value="">Выберите категорию</option> : null}
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Краткое описание"
              error={errors.description}
              hint="До 500 символов, показывается в карточке"
              className="sm:col-span-2"
            >
              <Textarea
                rows={2}
                maxLength={500}
                value={form.description}
                disabled={readOnly}
                onChange={(e) => set({ description: e.target.value })}
              />
            </Field>
            <Field
              label="Полное описание (Markdown)"
              error={errors.fullDescription}
              hint="До 5000 символов. Предпросмотр ниже; HTML и картинки не поддерживаются"
              className="sm:col-span-2"
            >
              <Textarea
                rows={5}
                maxLength={5000}
                value={form.fullDescription}
                disabled={readOnly}
                onChange={(e) => set({ fullDescription: e.target.value })}
              />
            </Field>
            <Field
              label="Картинка (URL)"
              error={errors.image}
              hint="https-ссылка на cdn-files.twomc.su, mc-heads.net или minotar.net"
              className="sm:col-span-2"
            >
              <Input
                value={form.image}
                maxLength={2000}
                spellCheck={false}
                disabled={readOnly}
                onChange={(e) => set({ image: e.target.value })}
              />
            </Field>

            {form.type === 'CURRENCY' ? (
              <>
                <Field label="Валюта" required error={errors.currencyType}>
                  <select
                    className={inputClassName}
                    value={form.currencyType}
                    disabled={readOnly}
                    onChange={(e) =>
                      set({ currencyType: e.target.value as AdminCurrencyType | '' })
                    }
                  >
                    <option value="">Выберите валюту</option>
                    {Object.entries(CURRENCY_TYPE_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Количество валюты" required error={errors.currencyAmount}>
                  <Input
                    inputMode="numeric"
                    value={form.currencyAmount}
                    disabled={readOnly}
                    onChange={(e) => set({ currencyAmount: e.target.value })}
                  />
                </Field>
              </>
            ) : null}

            <Field
              label="Максимум за покупку"
              error={errors.maxPerPurchase}
              hint="Пусто — без лимита"
            >
              <Input
                inputMode="numeric"
                value={form.maxPerPurchase}
                disabled={readOnly}
                onChange={(e) => set({ maxPerPurchase: e.target.value })}
              />
            </Field>
            <Field label="Порядок на витрине" error={errors.order} hint="Меньше — выше в списке">
              <Input
                inputMode="numeric"
                value={form.order}
                disabled={readOnly}
                onChange={(e) => set({ order: e.target.value })}
              />
            </Field>
            <Field label="Сервер" error={errors.server} hint="Необязательно, до 100 символов">
              <Input
                value={form.server}
                maxLength={100}
                disabled={readOnly}
                onChange={(e) => set({ server: e.target.value })}
              />
            </Field>

            <div className="grid gap-x-4 sm:col-span-2 sm:grid-cols-2">
              <CheckboxField
                label="Можно дарить"
                checked={form.isGiftable}
                disabled={readOnly}
                onCheckedChange={(checked) => set({ isGiftable: checked === true })}
              />
              <CheckboxField
                label="Только для себя"
                description="Подарок этого товара недоступен"
                checked={form.isSelfOnly}
                disabled={readOnly}
                onCheckedChange={(checked) => set({ isSelfOnly: checked === true })}
              />
              <CheckboxField
                label="Уникальный (одна покупка на игрока)"
                checked={form.isUnique}
                disabled={readOnly}
                onCheckedChange={(checked) => set({ isUnique: checked === true })}
              />
              <CheckboxField
                label="Только в сезон"
                checked={form.isSeasonalOnly}
                disabled={readOnly}
                onCheckedChange={(checked) => set({ isSeasonalOnly: checked === true })}
              />
              <CheckboxField
                label="Рекомендуемый"
                checked={form.isFeatured}
                disabled={readOnly}
                onCheckedChange={(checked) => set({ isFeatured: checked === true })}
              />
            </div>

            <div className="flex flex-col gap-1 sm:col-span-2">
              {mode === 'edit' ? (
                <SwitchField
                  label="Товар активен (виден в магазине)"
                  description={
                    sellable
                      ? 'Для покупки нужен хотя бы один активный вариант'
                      : 'Тип этого товара не входит в список продаваемых — сервер не даст его активировать'
                  }
                  checked={form.isActive}
                  aria-invalid={errors.isActive ? true : undefined}
                  aria-describedby={errors.isActive ? 'product-is-active-error' : undefined}
                  disabled={readOnly}
                  onCheckedChange={(checked) => set({ isActive: checked })}
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Новый товар создаётся неактивным. Включить его можно после создания, в правке.
                </p>
              )}
              {errors.isActive ? (
                <p id="product-is-active-error" className="text-xs text-destructive">
                  {errors.isActive}
                </p>
              ) : null}
            </div>

            <div className="sm:col-span-2">
              {product ? (
                <VariantsManager product={product} canManage={permissions.canVariants} />
              ) : (
                <VariantDraftsEditor
                  variants={drafts}
                  errors={draftErrors}
                  onChange={setDrafts}
                  listError={drafts.length === 0 ? 'Нужен хотя бы один вариант' : undefined}
                />
              )}
            </div>

            <div className="sm:col-span-2">
              {product ? (
                <PermissionGate
                  requirement="store.delivery.templates.manage"
                  fallback={deliveryNote}
                >
                  <DeliveryTemplateBlock key={product.id} product={product} />
                </PermissionGate>
              ) : (
                deliveryNote
              )}
            </div>

            <div className="sm:col-span-2">
              <ProductPreview form={form} variants={previewVariants} category={category} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {readOnly ? 'Закрыть' : 'Отмена'}
            </Button>
            {readOnly ? null : (
              <Button type="submit" loading={create.isPending || update.isPending}>
                {product ? 'Сохранить товар' : 'Создать товар'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
