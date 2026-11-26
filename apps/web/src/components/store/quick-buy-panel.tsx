'use client';

import { CircleAlert, Clock, Copy, CreditCard, KeyRound, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/field';
import { PaymentMethodPicker } from '@/components/store/payment-method-picker';
import { usePaymentChoice } from '@/lib/store/payment-methods';
import { formatMoney } from '@/lib/format';
import {
  OFFER_DOC_HREF,
  REFUNDS_DOC_HREF,
  safePaymentUrl,
  useCheckoutConfig,
} from '@/lib/store/checkout';
import {
  GUEST_TOKEN_TTL_DAYS,
  describeQuickBuyError,
  guestOrderLink,
  useQuickBuy,
  validateNick,
  type QuickBuyErrorInfo,
  type QuickBuyResult,
} from '@/lib/store/quick-buy';

/// Покупка без входа на странице товара. Вариант и количество выбирает страница товара,
/// здесь — ник, оферта и оплата. Ссылка на заказ с токеном показывается один раз и нигде
/// не сохраняется (ни в storage, ни в URL): только в состоянии компонента.
export function QuickBuyPanel({
  variantId,
  quantity,
  productName,
}: {
  variantId: string;
  quantity: number;
  productName: string;
}) {
  const config = useCheckoutConfig(true);
  const buy = useQuickBuy();
  const nickId = useId();
  const offerId = useId();
  const nickRef = useRef<HTMLInputElement>(null);
  const [nick, setNick] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [nickError, setNickError] = useState<string | null>(null);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const choice = usePaymentChoice(true);
  const [failure, setFailure] = useState<QuickBuyErrorInfo | null>(null);
  const [result, setResult] = useState<QuickBuyResult | null>(null);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);

  if (result) {
    return (
      <GuestLinkCard
        result={result}
        onDismiss={() => {
          setResult(null);
          setCopied(null);
        }}
        copied={copied}
        onCopied={setCopied}
      />
    );
  }

  // «Скоро»: оформление ответило paid_removal_unavailable. Без обещаний и без кнопок оплаты.
  if (failure?.kind === 'paid_removal_unavailable') {
    return (
      <div
        data-testid="quick-buy-soon"
        aria-disabled="true"
        className="flex cursor-not-allowed items-start gap-2 rounded-lg border border-border-subtle bg-surface-sunken p-3 text-sm"
      >
        <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold">Скоро</p>
          <p role="status" className="text-muted-foreground">
            {failure.message}
          </p>
        </div>
      </div>
    );
  }

  if (config.data && !config.data.quickBuyEnabled) {
    return (
      <p
        role="status"
        data-testid="quick-buy-disabled"
        className="flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-sm"
      >
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        Покупка без входа сейчас недоступна. Войдите в аккаунт, чтобы оформить заказ.
      </p>
    );
  }

  const paymentOff = config.data ? !config.data.paymentAvailable : false;
  const loginRequired = failure?.kind === 'login_required';
  // Без списка способов заказ не отправляем: сервер потребует выбор (payment_method_required).
  const methodsNotReady = choice.loading || choice.loadError !== null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (buy.isPending || paymentOff || methodsNotReady || !config.data) return;
    setFailure(null);
    const nickProblem = validateNick(nick);
    setNickError(nickProblem);
    if (nickProblem) {
      nickRef.current?.focus();
      return;
    }
    if (choice.required && choice.selected === null) {
      setPaymentError('Выберите способ оплаты, чтобы оформить заказ.');
      return;
    }
    setPaymentError(null);
    if (!accepted) {
      setOfferError('Подтвердите согласие с офертой, чтобы оформить заказ.');
      return;
    }
    setOfferError(null);
    buy.mutate(
      {
        variantId,
        quantity,
        guestMinecraftNick: nick.trim(),
        offerVersion: config.data.offerVersion,
        ...(choice.required && choice.selected ? { paymentMethod: choice.selected } : {}),
      },
      {
        onSuccess: (data) => {
          setResult(data);
        },
        onError: (error) => {
          const info = describeQuickBuyError(error);
          setFailure(info);
          if (info.kind === 'nick') {
            setNickError(info.message);
            nickRef.current?.focus();
          }
          if (info.kind === 'payment') {
            setPaymentError(info.message);
            // Список мог измениться: сбрасываем выбор и перечитываем способы.
            choice.reload();
          }
          if (info.kind === 'offer') {
            setAccepted(false);
            setOfferError(info.message);
          }
        },
      },
    );
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="Покупка без входа"
      data-testid="quick-buy-form"
      className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface p-4"
    >
      <h2 className="font-display text-base font-bold">Купить без входа</h2>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nickId} required>
          Ник в Minecraft
        </Label>
        <Input
          ref={nickRef}
          id={nickId}
          value={nick}
          maxLength={16}
          autoComplete="off"
          spellCheck={false}
          invalid={nickError !== null}
          aria-required
          aria-describedby={nickError ? `${nickId}-error` : `${nickId}-hint`}
          data-testid="quick-buy-nick"
          onChange={(event) => {
            setNick(event.target.value);
            if (nickError) setNickError(null);
          }}
        />
        <p id={`${nickId}-hint`} className="text-xs text-muted-foreground">
          «{productName}» получит игрок с этим ником. 3–16 символов: латиница, цифры, «_».
        </p>
        <p
          id={`${nickId}-error`}
          role="alert"
          data-testid="quick-buy-nick-error"
          className={nickError ? 'flex items-start gap-1.5 text-xs text-destructive' : 'sr-only'}
        >
          {nickError ? (
            <>
              <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
              <span>{nickError}</span>
            </>
          ) : null}
        </p>
      </div>

      <PaymentMethodPicker
        choice={{
          ...choice,
          select: (code) => {
            choice.select(code);
            setPaymentError(null);
          },
        }}
        error={paymentError}
        testId="quick-buy-payment-methods"
      />

      <div className="flex items-start gap-3">
        <Checkbox
          id={offerId}
          className="mt-0.5"
          checked={accepted}
          invalid={offerError !== null}
          aria-required
          aria-describedby={offerError ? `${offerId}-error` : undefined}
          data-testid="quick-buy-offer"
          onCheckedChange={(value) => {
            setAccepted(value === true);
            if (value === true) setOfferError(null);
          }}
        />
        <label htmlFor={offerId} className="text-sm leading-snug">
          Я принимаю{' '}
          <Link
            href={OFFER_DOC_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            условия оферты<span className="sr-only"> (откроется в новой вкладке)</span>
          </Link>{' '}
          и{' '}
          <Link
            href={REFUNDS_DOC_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            политику возвратов<span className="sr-only"> (откроется в новой вкладке)</span>
          </Link>
        </label>
      </div>
      <p
        id={`${offerId}-error`}
        role="alert"
        data-testid="quick-buy-offer-error"
        className={offerError ? 'text-xs text-destructive' : 'sr-only'}
      >
        {offerError}
      </p>

      {paymentOff ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-sm">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          Оплата временно недоступна. Заказ не создаётся, деньги не списываются.
        </p>
      ) : null}

      <div data-testid="quick-buy-error">
        {failure &&
        failure.kind !== 'nick' &&
        failure.kind !== 'offer' &&
        failure.kind !== 'payment' ? (
          <p role="alert" className="flex items-start gap-1.5 text-sm font-medium text-destructive">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{failure.message}</span>
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {loginRequired ? (
          <Button asChild size="lg">
            <Link href="/login?next=%2Fshop">Войти</Link>
          </Button>
        ) : (
          <Button
            type="submit"
            size="lg"
            loading={buy.isPending}
            disabled={paymentOff || config.isPending || methodsNotReady}
            data-testid="quick-buy-submit"
          >
            <CreditCard />
            Оплатить
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Итоговую сумму рассчитывает сервер. После оформления вы получите ссылку на заказ.
      </p>
    </form>
  );
}

function GuestLinkCard({
  result,
  onDismiss,
  copied,
  onCopied,
}: {
  result: QuickBuyResult;
  onDismiss: () => void;
  copied: 'ok' | 'fail' | null;
  onCopied: (value: 'ok' | 'fail') => void;
}) {
  const token = result.guestAccessToken;
  const link = token
    ? guestOrderLink(token, typeof window === 'undefined' ? '' : window.location.origin)
    : null;
  const paymentUrl = safePaymentUrl(result.paymentUrl);

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      onCopied('ok');
    } catch {
      onCopied('fail');
    }
  };

  return (
    <section
      aria-labelledby="quick-buy-done"
      data-testid="quick-buy-done"
      className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface p-4"
    >
      <h2 id="quick-buy-done" className="font-display text-base font-bold">
        Заказ № {result.order.orderNumber} оформлен
      </h2>
      <p className="text-sm text-muted-foreground">
        Сумма: <span className="tabular text-foreground">{formatMoney(result.order.total)}</span>
      </p>
      {link ? (
        <>
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-sm font-medium"
          >
            <KeyRound aria-hidden className="mt-0.5 size-4 shrink-0" />
            Сохраните ссылку: по ней можно открыть заказ {GUEST_TOKEN_TTL_DAYS} дней. Мы покажем её
            только один раз.
          </p>
          <label htmlFor="quick-buy-link" className="text-[13px] font-medium">
            Ссылка на заказ
          </label>
          <Input
            id="quick-buy-link"
            readOnly
            value={link}
            data-testid="quick-buy-link"
            onFocus={(event) => event.currentTarget.select()}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" onClick={() => void copy()}>
              <Copy />
              Скопировать
            </Button>
            <span role="status" data-testid="quick-buy-copied" className="text-sm">
              {copied === 'ok' ? 'Ссылка скопирована' : null}
              {copied === 'fail'
                ? 'Не удалось скопировать: выделите ссылку и скопируйте вручную'
                : null}
            </span>
          </div>
        </>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          Ссылка на заказ недоступна. Сохраните номер заказа и обратитесь в поддержку.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-3">
        {paymentUrl ? (
          <Button asChild>
            <a href={paymentUrl}>Перейти к оплате</a>
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={onDismiss} data-testid="quick-buy-dismiss">
          Я сохранил ссылку
        </Button>
      </div>
    </section>
  );
}
