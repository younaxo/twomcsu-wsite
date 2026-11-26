'use client';

import { CircleAlert, Coins, CreditCard, Globe, QrCode, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { useId } from 'react';
import { ErrorState } from '@/components/ui/error-state';
import { RadioCards, type RadioCardOption } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { paymentCurrencyLabel, type PaymentChoice } from '@/lib/store/payment-methods';

/// Нейтральные иконки по коду способа: без логотипов платёжных брендов.
const METHOD_ICONS: Record<string, ReactNode> = {
  SBP: <QrCode />,
  CARD_RU: <CreditCard />,
  SBERPAY: <Wallet />,
  CRYPTO: <Coins />,
  CARD_FOREIGN: <Globe />,
};

/// Выбор способа оплаты: радиогруппа из серверного списка. Пустой список без ошибки —
/// ничего не рисуем (прежний путь оформления). Ошибку выбора (`error`) показывает
/// родитель: её текст связан с группой через aria-describedby.
export function PaymentMethodPicker({
  choice,
  error,
  testId = 'payment-methods',
}: {
  choice: PaymentChoice;
  error?: string | null;
  testId?: string;
}) {
  const titleId = useId();
  const errorId = useId();
  const hintId = useId();

  if (choice.loading) {
    return (
      <div role="status" data-testid={`${testId}-loading`} className="flex flex-col gap-2">
        <span className="sr-only">Загрузка способов оплаты…</span>
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    );
  }
  if (choice.loadError) {
    return (
      <div data-testid={`${testId}-error`}>
        <ErrorState
          size="sm"
          error={choice.loadError}
          title="Не удалось загрузить способы оплаты"
          description="Без выбора способа оформить заказ нельзя. Повторите попытку."
          onRetry={choice.retry}
          retrying={choice.retrying}
        />
      </div>
    );
  }
  if (!choice.required) return null;

  const options: RadioCardOption[] = choice.methods.map((method) => ({
    value: method.code,
    label: method.title,
    description: method.currency ? `Валюта: ${paymentCurrencyLabel(method.currency)}` : undefined,
    icon: METHOD_ICONS[method.code] ?? <CreditCard />,
  }));

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <p id={titleId} className="text-sm font-medium">
        Способ оплаты
        <span aria-hidden className="ml-0.5 text-destructive">
          *
        </span>
      </p>
      <RadioCards
        aria-labelledby={titleId}
        aria-describedby={error ? errorId : hintId}
        aria-required
        invalid={Boolean(error)}
        value={choice.selected ?? ''}
        onValueChange={choice.select}
        options={options}
        columns={2}
        className="[&_button]:min-h-14"
      />
      <p id={hintId} className="text-xs text-muted-foreground">
        Сумму заказа рассчитает сервер. Вы перейдёте к оплате выбранным способом.
      </p>
      <p
        id={errorId}
        role="alert"
        data-testid={`${testId}-validation`}
        className={error ? 'flex items-start gap-1.5 text-xs text-destructive' : 'sr-only'}
      >
        {error ? (
          <>
            <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
            <span>{error}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
