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
import { Input } from '@/components/ui/input';
import { SwitchField } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import {
  describeCurrencyError,
  useCurrencyActions,
  validateCurrencyCode,
  validateCurrencyFlag,
  validateCurrencyRate,
  validateCurrencySymbol,
  type AdminCurrencyRate,
  type CurrencyPatchInput,
} from '@/lib/admin/store-currencies';

export interface CurrencyFormState {
  currency: string;
  rate: string;
  symbol: string;
  flag: string;
  isActive: boolean;
}

export function initialCurrencyForm(rate: AdminCurrencyRate | null): CurrencyFormState {
  return {
    currency: rate?.currency ?? '',
    rate: rate?.rate ?? '',
    symbol: rate?.symbol ?? '',
    flag: rate?.flag ?? '',
    isActive: rate?.isActive ?? true,
  };
}

export function validateCurrencyForm(
  form: CurrencyFormState,
  existing: AdminCurrencyRate | null,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const set = (key: string, message: string | null) => {
    if (message) errors[key] = message;
  };
  if (!existing) set('currency', validateCurrencyCode(form.currency));
  set('rate', validateCurrencyRate(form.rate));
  set('symbol', validateCurrencySymbol(form.symbol));
  set('flag', validateCurrencyFlag(form.flag));
  return errors;
}

export function buildCurrencyPatch(
  form: CurrencyFormState,
  existing: AdminCurrencyRate,
): CurrencyPatchInput {
  const patch: CurrencyPatchInput = {};
  if (Number(form.rate.trim()) !== Number(existing.rate)) patch.rate = Number(form.rate.trim());
  if (form.symbol.trim() !== existing.symbol) patch.symbol = form.symbol.trim();
  if (form.flag.trim() !== existing.flag) patch.flag = form.flag.trim();
  if (form.isActive !== existing.isActive) patch.isActive = form.isActive;
  return patch;
}

/// Курс валюты отображения: создание и правка. Код после создания не меняется.
export function CurrencyDialog({
  rate,
  open,
  onOpenChange,
}: {
  rate: AdminCurrencyRate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { create, update } = useCurrencyActions();
  const [form, setForm] = useState(() => initialCurrencyForm(rate));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<{ message: string; twoFactor: boolean } | null>(null);
  const { containerRef, focusFirstInvalid } = useFocusFirstInvalid<HTMLFormElement>();
  const set = (patch: Partial<CurrencyFormState>) => setForm((c) => ({ ...c, ...patch }));
  const pending = create.isPending || update.isPending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setFailure(null);
    const next = validateCurrencyForm(form, rate);
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
      const info = describeCurrencyError(error);
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
      toast.success(rate ? 'Курс сохранён' : 'Валюта добавлена');
      onOpenChange(false);
    };
    if (rate) {
      const body = buildCurrencyPatch(form, rate);
      if (Object.keys(body).length === 0) {
        onOpenChange(false);
        return;
      }
      update.mutate({ currency: rate.currency, body }, { onSuccess, onError });
    } else {
      create.mutate(
        {
          currency: form.currency.trim(),
          rate: Number(form.rate.trim()),
          symbol: form.symbol.trim(),
          flag: form.flag.trim(),
        },
        { onSuccess, onError },
      );
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
            <DialogTitle>{rate ? `Валюта ${rate.currency}` : 'Новая валюта'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-3 sm:grid-cols-2">
            {failure ? (
              <FormErrorSummary data-testid="currency-form-error" className="sm:col-span-2">
                {failure.message}{' '}
                {failure.twoFactor ? (
                  <Link href="/settings/security" className="font-medium underline">
                    Включить 2FA
                  </Link>
                ) : null}
              </FormErrorSummary>
            ) : null}
            <Field
              label="Код валюты"
              required={!rate}
              error={errors.currency}
              hint={rate ? 'Не меняется после создания' : 'Например, RUBY'}
            >
              <Input
                value={form.currency}
                maxLength={10}
                disabled={rate !== null}
                autoComplete="off"
                onChange={(e) => set({ currency: e.target.value })}
              />
            </Field>
            <Field
              label="Курс"
              required
              error={errors.rate}
              hint="К условной базовой единице, до 4 знаков после точки"
            >
              <Input
                inputMode="decimal"
                autoComplete="off"
                value={form.rate}
                onChange={(e) => set({ rate: e.target.value })}
              />
            </Field>
            <Field label="Символ" required error={errors.symbol} hint="До 5 символов">
              <Input
                value={form.symbol}
                maxLength={5}
                autoComplete="off"
                onChange={(e) => set({ symbol: e.target.value })}
              />
            </Field>
            <Field label="Флаг или значок" required error={errors.flag} hint="До 10 символов">
              <Input
                value={form.flag}
                maxLength={10}
                autoComplete="off"
                onChange={(e) => set({ flag: e.target.value })}
              />
            </Field>
            {rate ? (
              <SwitchField
                wrapperClassName="sm:col-span-2"
                label="Валюта активна"
                description="Неактивная валюта недоступна в калькуляторе обмена"
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
