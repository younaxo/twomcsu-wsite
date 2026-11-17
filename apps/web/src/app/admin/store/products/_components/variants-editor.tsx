'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SwitchField } from '@/components/ui/switch';
import { Field } from '@/components/ui/field';
import { Input, inputClassName } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import {
  DURATION_OPTIONS,
  describeStoreAdminError,
  useAdminProductActions,
  type AdminProduct,
  type AdminVariant,
  type VariantPatchInput,
} from '@/lib/admin/store-products';
import { durationLabel, type ProductDuration } from '@/lib/store/catalog';
import {
  newVariantDraft,
  rowFromVariant,
  validatePrices,
  variantInput,
  type FormErrors,
  type VariantDraft,
} from './product-form-state';

/// Максимум вариантов у товара — как ArrayMaxSize(10) в API.
const MAX_VARIANTS = 10;

const sizeInput = 'h-control-sm';

function DurationSelect({
  id,
  value,
  onChange,
  taken,
  disabled,
}: {
  id?: string;
  value: ProductDuration;
  onChange: (value: ProductDuration) => void;
  taken: ProductDuration[];
  disabled?: boolean;
}) {
  return (
    <select
      id={id}
      className={inputClassName}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as ProductDuration)}
    >
      {DURATION_OPTIONS.map((duration) => (
        <option key={duration} value={duration} disabled={taken.includes(duration)}>
          {durationLabel(duration)}
        </option>
      ))}
    </select>
  );
}

function firstFreeDuration(taken: ProductDuration[]): ProductDuration | null {
  return DURATION_OPTIONS.find((duration) => !taken.includes(duration)) ?? null;
}

/// Создание: варианты уходят в теле POST вместе с товаром (1–10 штук).
export function VariantDraftsEditor({
  variants,
  errors,
  onChange,
  listError,
}: {
  variants: VariantDraft[];
  errors: Record<string, FormErrors>;
  onChange: (variants: VariantDraft[]) => void;
  listError?: string;
}) {
  const patch = (key: string, next: Partial<VariantDraft>) =>
    onChange(variants.map((v) => (v.key === key ? { ...v, ...next } : v)));
  const free = firstFreeDuration(variants.map((v) => v.duration));
  return (
    <fieldset className="flex flex-col gap-3" data-testid="variant-drafts">
      <legend className="text-sm font-semibold">Варианты и цена</legend>
      {listError ? (
        <p role="alert" className="text-xs text-destructive">
          {listError}
        </p>
      ) : null}
      {variants.map((draft, index) => {
        const rowErrors = errors[draft.key] ?? {};
        const taken = variants.filter((v) => v.key !== draft.key).map((v) => v.duration);
        return (
          <div
            key={draft.key}
            className="grid gap-3 rounded-lg bg-surface-sunken p-3 sm:grid-cols-[1.2fr_1fr_1fr_6rem_auto]"
            role="group"
            aria-label={`Вариант ${index + 1}`}
          >
            <Field label="Срок" error={rowErrors.duration}>
              <DurationSelect
                value={draft.duration}
                taken={taken}
                onChange={(duration) => patch(draft.key, { duration })}
              />
            </Field>
            <Field label="Цена, ₽" required error={rowErrors.price}>
              <Input
                inputMode="decimal"
                placeholder="199.00"
                value={draft.price}
                onChange={(e) => patch(draft.key, { price: e.target.value })}
              />
            </Field>
            <Field label="Старая цена, ₽" error={rowErrors.oldPrice}>
              <Input
                inputMode="decimal"
                value={draft.oldPrice}
                onChange={(e) => patch(draft.key, { oldPrice: e.target.value })}
              />
            </Field>
            <Field label="Порядок" error={rowErrors.order}>
              <Input
                inputMode="numeric"
                value={draft.order}
                onChange={(e) => patch(draft.key, { order: e.target.value })}
              />
            </Field>
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={variants.length <= 1}
                aria-label={`Убрать вариант ${index + 1}`}
                onClick={() => onChange(variants.filter((v) => v.key !== draft.key))}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        );
      })}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="self-start"
        disabled={variants.length >= MAX_VARIANTS || free === null}
        onClick={() => free && onChange([...variants, newVariantDraft(free)])}
      >
        <Plus />
        Добавить вариант
      </Button>
    </fieldset>
  );
}

function VariantRow({ productId, variant }: { productId: string; variant: AdminVariant }) {
  const { updateVariant, removeVariant } = useAdminProductActions();
  const [row, setRow] = useState(() => rowFromVariant(variant));
  const [errors, setErrors] = useState<FormErrors>({});
  const [confirm, setConfirm] = useState(false);
  const original = rowFromVariant(variant);
  const changed =
    row.price.trim() !== original.price ||
    row.oldPrice.trim() !== original.oldPrice ||
    row.order.trim() !== original.order ||
    row.isActive !== original.isActive;

  const save = () => {
    const next: FormErrors = validatePrices(row.price, row.oldPrice);
    // Известный долг API: oldPrice нельзя сбросить в null.
    if (!row.oldPrice.trim() && original.oldPrice) {
      next.oldPrice =
        'Очистить старую цену пока нельзя (ограничение API): укажите значение или верните прежнее';
    }
    if (!/^\d+$/.test(row.order.trim())) next.order = 'Целое число от 0';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const body: VariantPatchInput = {};
    if (row.price.trim() !== original.price) body.price = row.price.trim();
    if (row.oldPrice.trim() !== original.oldPrice) body.oldPrice = row.oldPrice.trim();
    if (row.order.trim() !== original.order) body.order = Number(row.order.trim());
    if (row.isActive !== original.isActive) body.isActive = row.isActive;
    updateVariant.mutate(
      { productId, variantId: variant.id, body },
      {
        onSuccess: () => toast.success('Вариант сохранён'),
        onError: (error) => {
          const info = describeStoreAdminError(error);
          setErrors(info.fields);
          toast.error(info.message);
        },
      },
    );
  };

  return (
    <div
      className="flex flex-col gap-3 rounded-lg bg-surface-sunken p-3"
      role="group"
      aria-label={`Вариант: ${durationLabel(variant.duration)}`}
      data-testid="variant-row"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{durationLabel(variant.duration)}</span>
        {row.isActive ? null : <Badge tone="warning">Выключен</Badge>}
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem]">
        <Field label="Цена, ₽" required error={errors.price}>
          <Input
            inputMode="decimal"
            className={sizeInput}
            value={row.price}
            onChange={(e) => setRow({ ...row, price: e.target.value })}
          />
        </Field>
        <Field label="Старая цена, ₽" error={errors.oldPrice}>
          <Input
            inputMode="decimal"
            className={sizeInput}
            value={row.oldPrice}
            onChange={(e) => setRow({ ...row, oldPrice: e.target.value })}
          />
        </Field>
        <Field label="Порядок" error={errors.order}>
          <Input
            inputMode="numeric"
            className={sizeInput}
            value={row.order}
            onChange={(e) => setRow({ ...row, order: e.target.value })}
          />
        </Field>
      </div>
      <SwitchField
        label="Вариант активен"
        checked={row.isActive}
        onCheckedChange={(checked) => setRow({ ...row, isActive: checked })}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!changed}
          loading={updateVariant.isPending}
          onClick={save}
        >
          Сохранить вариант
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(true)}>
          <Trash2 />
          Удалить
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Удалить вариант «${durationLabel(variant.duration)}»?`}
        description="Если по варианту были заказы, он будет выключен, а не удалён. Вариант из набора удалить нельзя."
        confirmLabel="Удалить"
        destructive
        loading={removeVariant.isPending}
        onConfirm={() =>
          removeVariant.mutate(
            { productId, variantId: variant.id },
            {
              onSuccess: (result) => {
                toast.success(
                  result.mode === 'deactivated'
                    ? 'Вариант есть в заказах — выключен вместо удаления'
                    : 'Вариант удалён',
                );
                setConfirm(false);
              },
              onError: (error) => {
                toast.error(describeStoreAdminError(error).message);
                setConfirm(false);
              },
            },
          )
        }
      />
    </div>
  );
}

/// Правка: каждый вариант сохраняется отдельным запросом (права
/// `store.products.variants`, аудит цены пишет API).
export function VariantsManager({
  product,
  canManage,
}: {
  product: AdminProduct;
  canManage: boolean;
}) {
  const { createVariant } = useAdminProductActions();
  const taken = product.variants.map((v) => v.duration);
  const free = firstFreeDuration(taken);
  const [adding, setAdding] = useState<VariantDraft | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});

  const submitNew = () => {
    if (!adding) return;
    const next: FormErrors = validatePrices(adding.price, adding.oldPrice);
    if (!/^\d+$/.test(adding.order.trim())) next.order = 'Целое число от 0';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    createVariant.mutate(
      { productId: product.id, body: variantInput(adding) },
      {
        onSuccess: () => {
          toast.success('Вариант добавлен');
          setAdding(null);
        },
        onError: (error) => {
          const info = describeStoreAdminError(error);
          setErrors(info.fields);
          toast.error(info.message);
        },
      },
    );
  };

  if (!canManage) {
    return (
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">Варианты и цена</legend>
        <ul className="text-sm text-muted-foreground">
          {product.variants.map((v) => (
            <li key={v.id}>
              {durationLabel(v.duration)} — {v.price} ₽{v.isActive ? '' : ' (выключен)'}
            </li>
          ))}
        </ul>
        <p className="text-xs text-subtle-foreground">
          Править варианты можно с правом «store.products.variants».
        </p>
      </fieldset>
    );
  }

  return (
    <fieldset className="flex flex-col gap-3" data-testid="variants-manager">
      <legend className="text-sm font-semibold">Варианты и цена</legend>
      {product.variants.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Вариантов нет — товар нельзя купить. Добавьте хотя бы один.
        </p>
      ) : null}
      {product.variants.map((variant) => (
        <VariantRow key={variant.id} productId={product.id} variant={variant} />
      ))}
      {adding ? (
        <div
          className="grid gap-3 rounded-lg bg-surface-sunken p-3 sm:grid-cols-[1.2fr_1fr_1fr_6rem]"
          role="group"
          aria-label="Новый вариант"
        >
          <Field label="Срок" error={errors.duration}>
            <DurationSelect
              value={adding.duration}
              taken={taken}
              onChange={(duration) => setAdding({ ...adding, duration })}
            />
          </Field>
          <Field label="Цена, ₽" required error={errors.price}>
            <Input
              inputMode="decimal"
              placeholder="199.00"
              value={adding.price}
              onChange={(e) => setAdding({ ...adding, price: e.target.value })}
            />
          </Field>
          <Field label="Старая цена, ₽" error={errors.oldPrice}>
            <Input
              inputMode="decimal"
              value={adding.oldPrice}
              onChange={(e) => setAdding({ ...adding, oldPrice: e.target.value })}
            />
          </Field>
          <Field label="Порядок" error={errors.order}>
            <Input
              inputMode="numeric"
              value={adding.order}
              onChange={(e) => setAdding({ ...adding, order: e.target.value })}
            />
          </Field>
          <div className="flex gap-2 sm:col-span-4">
            <Button type="button" size="sm" loading={createVariant.isPending} onClick={submitNew}>
              Добавить
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(null)}>
              Отмена
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="self-start"
          disabled={free === null || product.variants.length >= MAX_VARIANTS}
          onClick={() => {
            setErrors({});
            if (free) setAdding(newVariantDraft(free));
          }}
        >
          <Plus />
          Добавить вариант
        </Button>
      )}
    </fieldset>
  );
}
