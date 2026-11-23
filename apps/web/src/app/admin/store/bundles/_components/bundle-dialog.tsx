'use client';

import { Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import {
  FormErrorSummary,
  FormField as Field,
  useFocusFirstInvalid,
} from '@/components/admin/form-field';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea, inputClassName } from '@/components/ui/input';
import { SwitchField } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import {
  BUNDLE_MAX_ITEMS,
  bundleDiscountPercent,
  describeBundleError,
  useBundleActions,
  type AdminBundle,
} from '@/lib/admin/store-bundles';
import { useAdminProducts } from '@/lib/admin/store-products';
import { usePermissions } from '@/lib/auth/use-permissions';
import { durationLabel } from '@/lib/store/catalog';
import {
  buildBundleCreate,
  buildBundlePatch,
  initialBundleForm,
  validateBundleForm,
  type BundleItemRow,
} from './bundle-form-state';

type FormFailure = { message: string; twoFactor: boolean } | null;

/// Добавление позиции: поиск товара, вариант (необязателен), количество.
/// Монтируется только при праве `store.products.view` (список товаров его требует).
function ItemAdder({ onAdd }: { onAdd: (row: BundleItemRow) => void }) {
  const [search, setSearch] = useState('');
  const [productId, setProductId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [error, setError] = useState<string | undefined>();
  const products = useAdminProducts(search, 1);
  const items = products.data?.items ?? [];
  const product = items.find((p) => p.id === productId);

  const add = () => {
    if (!product) {
      setError('Выберите товар');
      return;
    }
    if (!/^\d{1,4}$/.test(quantity.trim()) || Number(quantity) < 1) {
      setError('Количество — целое число не меньше 1');
      return;
    }
    const variant = product.variants.find((v) => v.id === variantId);
    setError(undefined);
    onAdd({
      productId: product.id,
      variantId,
      quantity: quantity.trim(),
      productName: product.name,
      variantLabel: variant ? durationLabel(variant.duration) : '',
    });
    setProductId('');
    setVariantId('');
    setQuantity('1');
  };

  return (
    <div className="grid gap-3 rounded-md border border-border bg-muted p-3 sm:grid-cols-2">
      <Field label="Найти товар" className="sm:col-span-2">
        <Input
          placeholder="Название товара"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Field>
      <Field label="Товар">
        <select
          className={inputClassName}
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value);
            setVariantId('');
          }}
        >
          <option value="">Выберите товар</option>
          {items.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Вариант" hint="Пусто — товар без привязки к варианту">
        <select
          className={inputClassName}
          value={variantId}
          disabled={!product || product.variants.length === 0}
          onChange={(e) => setVariantId(e.target.value)}
        >
          <option value="">Любой вариант</option>
          {(product?.variants ?? []).map((v) => (
            <option key={v.id} value={v.id}>
              {durationLabel(v.duration)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Количество" error={error}>
        <Input
          inputMode="numeric"
          autoComplete="off"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </Field>
      <div className="flex items-end">
        <Button type="button" variant="secondary" onClick={add}>
          Добавить в набор
        </Button>
      </div>
    </div>
  );
}

/// Набор товаров: создание и правка. Новые наборы создаются выключенными.
/// slug после создания не меняется (API). Состав заменяется целиком при изменении.
export function BundleDialog({
  bundle,
  open,
  onOpenChange,
}: {
  bundle: AdminBundle | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { can } = usePermissions();
  const { create, update } = useBundleActions();
  const [form, setForm] = useState(() => initialBundleForm(bundle));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<FormFailure>(null);
  const { containerRef, focusFirstInvalid } = useFocusFirstInvalid<HTMLFormElement>();
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));
  const pending = create.isPending || update.isPending;
  const percent = bundleDiscountPercent(form.totalPrice, form.originalPrice);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setFailure(null);
    const next = validateBundleForm(form, bundle);
    setErrors(next);
    const count = Object.keys(next).length;
    if (count > 0) {
      setFailure({
        message: `Исправьте ошибки в форме (${count}). Первое поле с ошибкой выделено.`,
        twoFactor: false,
      });
      focusFirstInvalid();
      return;
    }
    const onError = (error: unknown) => {
      const info = describeBundleError(error);
      setErrors(info.fields);
      const hasFields = Object.keys(info.fields).length > 0;
      setFailure(
        hasFields
          ? { message: 'Проверьте поля формы: сервер отклонил значения.', twoFactor: false }
          : { message: info.message, twoFactor: info.needsTwoFactor },
      );
      if (hasFields) focusFirstInvalid();
    };
    const onSuccess = () => {
      toast.success(bundle ? 'Набор сохранён' : 'Набор создан');
      onOpenChange(false);
    };
    if (bundle) {
      const body = buildBundlePatch(form, bundle);
      if (Object.keys(body).length === 0) {
        onOpenChange(false);
        return;
      }
      update.mutate({ id: bundle.id, body }, { onSuccess, onError });
    } else {
      create.mutate(buildBundleCreate(form), { onSuccess, onError });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent size="lg">
        <form ref={containerRef} onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{bundle ? `Набор «${bundle.name}»` : 'Новый набор'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-3 sm:grid-cols-2">
            {failure ? (
              <FormErrorSummary data-testid="bundle-form-error" className="sm:col-span-2">
                {failure.message}{' '}
                {failure.twoFactor ? (
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
                onChange={(e) => set({ name: e.target.value })}
              />
            </Field>
            <Field
              label="Slug"
              required={!bundle}
              error={errors.slug}
              hint={
                bundle ? 'Не меняется после создания' : 'Строчные латинские буквы, цифры, дефис'
              }
            >
              <Input
                value={form.slug}
                maxLength={160}
                disabled={bundle !== null}
                autoComplete="off"
                onChange={(e) => set({ slug: e.target.value })}
              />
            </Field>
            <Field label="Описание" error={errors.description} className="sm:col-span-2">
              <Textarea
                rows={2}
                maxLength={1000}
                value={form.description}
                onChange={(e) => set({ description: e.target.value })}
              />
            </Field>
            <Field label="Картинка (https)" error={errors.image} className="sm:col-span-2">
              <Input
                inputMode="url"
                autoComplete="off"
                value={form.image}
                onChange={(e) => set({ image: e.target.value })}
              />
            </Field>
            <Field
              label="Цена набора, ₽"
              required
              error={errors.totalPrice}
              hint={percent !== null ? `Выгода набора: ${percent} %` : 'До 2 знаков после точки'}
            >
              <Input
                inputMode="decimal"
                autoComplete="off"
                value={form.totalPrice}
                onChange={(e) => set({ totalPrice: e.target.value })}
              />
            </Field>
            <Field
              label="Цена без скидки, ₽"
              required
              error={errors.originalPrice}
              hint="Сумма товаров по отдельности"
            >
              <Input
                inputMode="decimal"
                autoComplete="off"
                value={form.originalPrice}
                onChange={(e) => set({ originalPrice: e.target.value })}
              />
            </Field>
            <Field label="Действует с" error={errors.validFrom}>
              <DatePicker
                value={form.validFrom || null}
                onChange={(value) => set({ validFrom: value ?? '' })}
                invalid={Boolean(errors.validFrom)}
                placeholder="Сразу"
              />
            </Field>
            <Field
              label="Действует по (включительно)"
              error={errors.validUntil}
              hint={bundle ? 'Уже заданную дату очистить нельзя (ограничение API)' : undefined}
            >
              <DatePicker
                value={form.validUntil || null}
                onChange={(value) => set({ validUntil: value ?? '' })}
                invalid={Boolean(errors.validUntil)}
                placeholder="Без срока"
              />
            </Field>
            <SwitchField
              label="Набор включён"
              description={
                bundle
                  ? 'Выключенный набор пропадает с витрины и из этого списка'
                  : 'Новый набор создаётся выключенным; включите после проверки'
              }
              checked={form.isActive}
              onCheckedChange={(checked) => set({ isActive: checked })}
            />
            <SwitchField
              label="Рекомендуемый"
              checked={form.isFeatured}
              onCheckedChange={(checked) => set({ isFeatured: checked })}
            />
            <fieldset
              className="flex flex-col gap-2 sm:col-span-2"
              aria-describedby="bundle-items-hint"
            >
              <legend className="text-sm font-medium text-foreground">
                Состав набора ({form.items.length}/{BUNDLE_MAX_ITEMS})
              </legend>
              <p id="bundle-items-hint" className="text-xs text-muted-foreground">
                При изменении состав заменяется целиком.
              </p>
              {errors.items ? (
                <p role="alert" className="text-sm text-destructive">
                  {errors.items}
                </p>
              ) : null}
              <ul className="flex flex-col gap-1" data-testid="bundle-items">
                {form.items.map((item, index) => (
                  <li
                    key={`${item.productId}:${item.variantId}:${index}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 break-words">
                      {item.productName}
                      {item.variantId ? ` · ${item.variantLabel || 'Вариант'}` : ''} ×{' '}
                      {item.quantity}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Убрать из набора: ${item.productName}`}
                      onClick={() => set({ items: form.items.filter((_, i) => i !== index) })}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
              {can('store.products.view') ? (
                <ItemAdder onAdd={(row) => set({ items: [...form.items, row] })} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Для добавления товаров нужно право store.products.view.
                </p>
              )}
            </fieldset>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Отмена
            </Button>
            <Button type="submit" loading={pending}>
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
