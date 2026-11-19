'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import {
  FormErrorSummary,
  FormField as Field,
  useFocusFirstInvalid,
} from '@/components/admin/form-field';
import { Button } from '@/components/ui/button';
import { CheckboxField } from '@/components/ui/checkbox';
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
  DISCOUNT_TYPES,
  DISCOUNT_TYPE_LABEL,
  describeDiscountAdminError,
  type DiscountType,
} from '@/lib/admin/store-discounts';
import { usePromoCodeActions, type AdminPromoCode } from '@/lib/admin/store-promocodes';
import { PRODUCT_TYPE_LABEL, type AdminProductType } from '@/lib/admin/store-products';
import {
  buildPromoCreate,
  buildPromoPatch,
  initialPromoForm,
  validatePromoForm,
} from './promo-form-state';

/// Создание и правка промокода (0.4). Код создаётся заглавными и потом не
/// меняется. Деньги — Decimal-строки; проценты 0–100; даты — день целиком.
export function PromoDialog({
  promo,
  open,
  onOpenChange,
}: {
  promo: AdminPromoCode | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { create, update } = usePromoCodeActions();
  const [form, setForm] = useState(() => initialPromoForm(promo));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ message: string; twoFactor: boolean } | null>(null);
  const { containerRef, focusFirstInvalid } = useFocusFirstInvalid<HTMLFormElement>();
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));
  const pending = create.isPending || update.isPending;
  const isPercent = form.discountType === 'PERCENT';

  const toggleType = (type: AdminProductType, checked: boolean) =>
    set({
      applicableToTypes: checked
        ? [...form.applicableToTypes, type]
        : form.applicableToTypes.filter((t) => t !== type),
    });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    const next = validatePromoForm(form, promo);
    setErrors(next);
    const count = Object.keys(next).length;
    if (count > 0) {
      setFormError({
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
      setFormError(
        hasFields
          ? { message: 'Проверьте поля формы: сервер отклонил значения.', twoFactor: false }
          : { message: info.message, twoFactor: info.needsTwoFactor },
      );
      if (hasFields) focusFirstInvalid();
    };
    const onSuccess = () => {
      toast.success(promo ? 'Промокод сохранён' : 'Промокод создан');
      onOpenChange(false);
    };
    if (promo) {
      const body = buildPromoPatch(form, promo);
      if (Object.keys(body).length === 0) {
        onOpenChange(false);
        return;
      }
      update.mutate({ id: promo.id, body }, { onSuccess, onError });
    } else {
      create.mutate(buildPromoCreate(form), { onSuccess, onError });
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
            <DialogTitle>{promo ? `Промокод ${promo.code}` : 'Новый промокод'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-3 sm:grid-cols-2">
            {formError ? (
              <FormErrorSummary data-testid="promo-form-error" className="sm:col-span-2">
                {formError.message}{' '}
                {formError.twoFactor ? (
                  <Link href="/settings/security" className="font-medium underline">
                    Включить 2FA
                  </Link>
                ) : null}
              </FormErrorSummary>
            ) : null}
            <Field
              label="Код"
              required={!promo}
              error={errors.code}
              hint={promo ? 'Код не меняется после создания' : 'A–Z, 0–9 и дефис, 3–32 символа'}
            >
              <Input
                value={form.code}
                maxLength={32}
                spellCheck={false}
                autoCapitalize="characters"
                disabled={promo !== null}
                onChange={(e) => set({ code: e.target.value.toUpperCase() })}
              />
            </Field>
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
              label="Лимит использований"
              error={errors.maxUses}
              hint={promo ? `Уже использован: ${promo.usedCount}` : 'Пусто — без ограничения'}
            >
              <Input
                inputMode="numeric"
                autoComplete="off"
                value={form.maxUses}
                onChange={(e) => set({ maxUses: e.target.value })}
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
            <Field label="Действует по (включительно)" error={errors.validUntil}>
              <DatePicker
                value={form.validUntil || null}
                onChange={(value) => set({ validUntil: value ?? '' })}
                invalid={Boolean(errors.validUntil)}
                placeholder="Без срока"
              />
            </Field>
            <Field
              label="Минимальная сумма заказа, ₽"
              error={errors.minOrderAmount}
              hint="Пусто — без минимума"
            >
              <Input
                inputMode="decimal"
                autoComplete="off"
                value={form.minOrderAmount}
                onChange={(e) => set({ minOrderAmount: e.target.value })}
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
            <fieldset className="flex flex-col gap-1 sm:col-span-2">
              <legend className="text-sm font-medium">Типы товаров</legend>
              <p className="text-xs text-subtle-foreground">
                Ничего не выбрано — промокод действует на все типы.
              </p>
              <div className="grid gap-x-4 sm:grid-cols-2">
                {(Object.keys(PRODUCT_TYPE_LABEL) as AdminProductType[]).map((type) => (
                  <CheckboxField
                    key={type}
                    label={PRODUCT_TYPE_LABEL[type]}
                    checked={form.applicableToTypes.includes(type)}
                    onCheckedChange={(checked) => toggleType(type, checked === true)}
                  />
                ))}
              </div>
            </fieldset>
            <SwitchField
              wrapperClassName="sm:col-span-2"
              label="Только для первой покупки"
              checked={form.firstPurchaseOnly}
              onCheckedChange={(checked) => set({ firstPurchaseOnly: checked })}
            />
            {promo ? (
              <SwitchField
                wrapperClassName="sm:col-span-2"
                label="Промокод включён"
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
