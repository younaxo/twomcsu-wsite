'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import {
  FormErrorSummary,
  FormField as Field,
  useFocusFirstInvalid,
} from '@/components/admin/form-field';
import { Button } from '@/components/ui/button';
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
  DISCOUNT_TYPES,
  DISCOUNT_TYPE_LABEL,
  describeDiscountAdminError,
  useBulkDiscountActions,
  useLoyaltyDiscountActions,
  type AdminBulkDiscount,
  type AdminLoyaltyDiscount,
  type DiscountType,
} from '@/lib/admin/store-discounts';
import {
  PRODUCT_TYPE_LABEL,
  useAdminProducts,
  type AdminProductType,
} from '@/lib/admin/store-products';
import { usePermissions } from '@/lib/auth/use-permissions';
import {
  buildBulkCreate,
  buildBulkPatch,
  buildLoyaltyCreate,
  buildLoyaltyPatch,
  initialBulkForm,
  initialLoyaltyForm,
  validateBulkForm,
  validateLoyaltyForm,
  type BulkScope,
} from './discount-form-state';

type FormFailure = { message: string; twoFactor: boolean } | null;

function FailureSummary({ failure, testId }: { failure: FormFailure; testId: string }) {
  if (!failure) return null;
  return (
    <FormErrorSummary data-testid={testId} className="sm:col-span-2">
      {failure.message}{' '}
      {failure.twoFactor ? (
        <Link href="/settings/security" className="font-medium underline">
          Включить 2FA
        </Link>
      ) : null}
    </FormErrorSummary>
  );
}

/// Выбор товара: поиск по названию (первая страница API) и список. Монтируется
/// только при области «Конкретный товар», чтобы без нужды не слать запрос
/// (он требует `store.products.view`).
function ProductPicker({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (productId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const products = useAdminProducts(search, 1);
  return (
    <>
      <Field label="Найти товар">
        <Input
          placeholder="Название товара"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Field>
      <Field label="Товар" required error={error}>
        <select className={inputClassName} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Выберите товар</option>
          {(products.data?.items ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}

/// Скидка за объём или сумму (BulkDiscount). Область действия (все товары /
/// тип / товар) выбирается при создании и потом не меняется (API).
export function BulkDiscountDialog({
  discount,
  open,
  onOpenChange,
}: {
  discount: AdminBulkDiscount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { can } = usePermissions();
  const { create, update } = useBulkDiscountActions();
  const [form, setForm] = useState(() => initialBulkForm(discount));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<FormFailure>(null);
  const { containerRef, focusFirstInvalid } = useFocusFirstInvalid<HTMLFormElement>();
  const canPickProduct = can('store.products.view');
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));
  const pending = create.isPending || update.isPending;
  const isPercent = form.discountType === 'PERCENT';
  const scopeLocked = discount !== null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setFailure(null);
    const next = validateBulkForm(form, discount);
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
      const info = describeDiscountAdminError(error);
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
      toast.success(discount ? 'Скидка сохранена' : 'Скидка создана');
      onOpenChange(false);
    };
    if (discount) {
      const body = buildBulkPatch(form, discount);
      if (Object.keys(body).length === 0) {
        onOpenChange(false);
        return;
      }
      update.mutate({ id: discount.id, body }, { onSuccess, onError });
    } else {
      create.mutate(buildBulkCreate(form), { onSuccess, onError });
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
            <DialogTitle>{discount ? 'Скидка за объём' : 'Новая скидка за объём'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-3 sm:grid-cols-2">
            <FailureSummary failure={failure} testId="bulk-form-error" />
            <Field
              label="Область действия"
              hint={scopeLocked ? 'Не меняется после создания' : undefined}
            >
              <select
                className={inputClassName}
                value={form.scope}
                disabled={scopeLocked}
                onChange={(e) => set({ scope: e.target.value as BulkScope })}
              >
                <option value="all">Все товары</option>
                <option value="type">Тип товара</option>
                {canPickProduct || form.scope === 'product' ? (
                  <option value="product">Конкретный товар</option>
                ) : null}
              </select>
            </Field>
            {form.scope === 'type' ? (
              <Field label="Тип товара" required={!scopeLocked} error={errors.productType}>
                <select
                  className={inputClassName}
                  value={form.productType}
                  disabled={scopeLocked}
                  onChange={(e) => set({ productType: e.target.value as AdminProductType })}
                >
                  <option value="">Выберите тип</option>
                  {(Object.keys(PRODUCT_TYPE_LABEL) as AdminProductType[]).map((type) => (
                    <option key={type} value={type}>
                      {PRODUCT_TYPE_LABEL[type]}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            {form.scope === 'product' ? (
              scopeLocked ? (
                <Field label="Товар" hint="Не меняется после создания">
                  <Input value={form.productId} disabled readOnly />
                </Field>
              ) : (
                <ProductPicker
                  value={form.productId}
                  error={errors.productId}
                  onChange={(productId) => set({ productId })}
                />
              )
            ) : null}
            <Field label="Тип скидки" required>
              <select
                className={inputClassName}
                value={form.discountType}
                onChange={(e) => set({ discountType: e.target.value as DiscountType })}
              >
                {DISCOUNT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {DISCOUNT_TYPE_LABEL[type]}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={isPercent ? 'Размер скидки, %' : 'Размер скидки, ₽'}
              required
              error={errors.discountValue}
              hint={isPercent ? 'От 0.01 до 100' : 'Больше 0, до 2 знаков после точки'}
            >
              <Input
                inputMode="decimal"
                autoComplete="off"
                value={form.discountValue}
                onChange={(e) => set({ discountValue: e.target.value })}
              />
            </Field>
            <Field
              label="От количества, шт."
              error={errors.minQuantity}
              hint="0 — без порога по количеству"
            >
              <Input
                inputMode="numeric"
                autoComplete="off"
                value={form.minQuantity}
                onChange={(e) => set({ minQuantity: e.target.value })}
              />
            </Field>
            <Field label="От суммы, ₽" error={errors.minAmount} hint="Пусто — без порога по сумме">
              <Input
                inputMode="decimal"
                autoComplete="off"
                value={form.minAmount}
                onChange={(e) => set({ minAmount: e.target.value })}
              />
            </Field>
            {discount ? (
              <SwitchField
                wrapperClassName="sm:col-span-2"
                label="Скидка включена"
                checked={form.isActive}
                onCheckedChange={(checked) => set({ isActive: checked })}
              />
            ) : null}
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

/// Скидка за лояльность (LoyaltyDiscount): процент от числа прошлых покупок.
export function LoyaltyDiscountDialog({
  discount,
  open,
  onOpenChange,
}: {
  discount: AdminLoyaltyDiscount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { create, update } = useLoyaltyDiscountActions();
  const [form, setForm] = useState(() => initialLoyaltyForm(discount));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<FormFailure>(null);
  const { containerRef, focusFirstInvalid } = useFocusFirstInvalid<HTMLFormElement>();
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));
  const pending = create.isPending || update.isPending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setFailure(null);
    const next = validateLoyaltyForm(form);
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
      const info = describeDiscountAdminError(error);
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
      toast.success(discount ? 'Скидка сохранена' : 'Скидка создана');
      onOpenChange(false);
    };
    if (discount) {
      const body = buildLoyaltyPatch(form, discount);
      if (Object.keys(body).length === 0) {
        onOpenChange(false);
        return;
      }
      update.mutate({ id: discount.id, body }, { onSuccess, onError });
    } else {
      create.mutate(buildLoyaltyCreate(form), { onSuccess, onError });
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
      <DialogContent size="md">
        <form ref={containerRef} onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>
              {discount ? 'Скидка за лояльность' : 'Новая скидка за лояльность'}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-3 sm:grid-cols-2">
            <FailureSummary failure={failure} testId="loyalty-form-error" />
            <Field label="Название" required error={errors.name} className="sm:col-span-2">
              <Input
                value={form.name}
                maxLength={100}
                onChange={(e) => set({ name: e.target.value })}
              />
            </Field>
            <Field
              label="От числа покупок"
              required
              error={errors.minPurchases}
              hint="Целое число, не меньше 1"
            >
              <Input
                inputMode="numeric"
                autoComplete="off"
                value={form.minPurchases}
                onChange={(e) => set({ minPurchases: e.target.value })}
              />
            </Field>
            <Field label="Скидка, %" required error={errors.discountPercent} hint="От 0.01 до 100">
              <Input
                inputMode="decimal"
                autoComplete="off"
                value={form.discountPercent}
                onChange={(e) => set({ discountPercent: e.target.value })}
              />
            </Field>
            <Field label="Описание" error={errors.description} className="sm:col-span-2">
              <Textarea
                rows={2}
                maxLength={500}
                value={form.description}
                onChange={(e) => set({ description: e.target.value })}
              />
            </Field>
            {discount ? (
              <SwitchField
                wrapperClassName="sm:col-span-2"
                label="Скидка включена"
                checked={form.isActive}
                onCheckedChange={(checked) => set({ isActive: checked })}
              />
            ) : null}
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
