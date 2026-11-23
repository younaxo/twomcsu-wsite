'use client';

import { CircleAlert, CreditCard, ShoppingCart, TriangleAlert, UserRound } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { api } from '@/lib/api/client';
import { FormErrorSummary, FormField, useFocusFirstInvalid } from '@/components/admin/form-field';
import { ModuleGate } from '@/components/system/site-availability';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/lib/auth/store';
import { formatMoney, formatNumber } from '@/lib/format';
import { usePublicProfile } from '@/lib/profile/hooks';
import { isPositive, itemName, lineFor, useCartView, type CartView } from '@/lib/store/cart';
import {
  OFFER_DOC_HREF,
  REFUNDS_DOC_HREF,
  checkoutKeys,
  describeCheckoutError,
  orderHref,
  safePaymentUrl,
  useCheckoutConfig,
  useCreateOrder,
  type CheckoutConfig,
  type CheckoutErrorInfo,
} from '@/lib/store/checkout';

function CheckoutSkeleton() {
  return (
    <div
      role="status"
      data-testid="checkout-skeleton"
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
    >
      <span className="sr-only">Загрузка оформления…</span>
      <Skeleton className="h-64 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}

function SummaryRow({ label, value, discount }: { label: string; value: string; discount?: true }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={discount ? 'text-success tabular' : 'tabular'}>{value}</dd>
    </div>
  );
}

/// Сводка корзины: суммы целиком из ответа сервера, клиент их не считает.
function OrderSummary({ cart }: { cart: CartView }) {
  return (
    <section aria-labelledby="checkout-summary-title">
      <Card className="flex flex-col gap-4">
        <h2 id="checkout-summary-title" className="font-display text-lg font-bold">
          Ваш заказ
        </h2>
        <ul aria-label="Товары заказа" className="flex flex-col gap-2">
          {cart.items.map((item, index) => {
            const line = lineFor(cart, index);
            return (
              <li
                key={item.id}
                data-testid="checkout-item"
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="min-w-0 break-words">
                  {itemName(item, line)}
                  <span className="text-muted-foreground tabular">
                    {' '}
                    × {formatNumber(item.quantity)}
                  </span>
                </span>
                {line ? (
                  <span className="shrink-0 whitespace-nowrap tabular">
                    {formatMoney(line.lineTotal)}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        <dl className="flex flex-col gap-2 border-t border-border-subtle pt-4">
          <SummaryRow label="Товары" value={formatMoney(cart.subtotal)} />
          {isPositive(cart.bulkDiscountTotal) ? (
            <SummaryRow
              label="Скидка за объём"
              value={`−${formatMoney(cart.bulkDiscountTotal)}`}
              discount
            />
          ) : null}
          {isPositive(cart.loyaltyDiscountTotal) ? (
            <SummaryRow
              label="Скидка лояльности"
              value={`−${formatMoney(cart.loyaltyDiscountTotal)}`}
              discount
            />
          ) : null}
          {cart.promoCode && !cart.promoError && isPositive(cart.promoDiscountTotal) ? (
            <SummaryRow
              label={`Промокод ${cart.promoCode.code}`}
              value={`−${formatMoney(cart.promoDiscountTotal)}`}
              discount
            />
          ) : null}
        </dl>
        <div
          data-testid="checkout-total"
          className="flex items-baseline justify-between gap-3 border-t border-border-subtle pt-4"
        >
          <span className="text-base font-semibold">Итого к оплате</span>
          <span className="font-display text-2xl font-bold tabular">{formatMoney(cart.total)}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Итог рассчитывает сервер при оформлении заказа.{' '}
          <Link
            href="/shop/cart"
            className="inline-flex min-h-10 items-center text-primary underline-offset-2 hover:underline"
          >
            Изменить корзину
          </Link>
        </p>
      </Card>
    </section>
  );
}

function CheckoutForm({ cart, config }: { cart: CartView; config: CheckoutConfig }) {
  const router = useRouter();
  const client = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const profile = usePublicProfile(user?.username ?? '');
  const createOrder = useCreateOrder();
  const { containerRef, focusFirstInvalid } = useFocusFirstInvalid<HTMLFormElement>();
  const offerId = useId();
  const unavailableId = useId();
  const [nick, setNick] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [nickError, setNickError] = useState<string | null>(null);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [failure, setFailure] = useState<CheckoutErrorInfo | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  const linkedNick =
    profile.data && !('hidden' in profile.data && profile.data.hidden)
      ? (profile.data.minecraftName ?? null)
      : null;
  const paymentOff = !config.paymentAvailable || failure?.paymentUnavailable === true;
  const busy = createOrder.isPending || redirecting;

  // Возврат кнопкой «Назад» (bfcache) или переключением вкладки: страница снова живая,
  // кнопка оплаты не должна оставаться заблокированной.
  useEffect(() => {
    if (!redirecting) return undefined;
    const reset = () => {
      if (document.visibilityState === 'visible') setRedirecting(false);
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setRedirecting(false);
    };
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', reset);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', reset);
    };
  }, [redirecting]);

  // Оплата недоступна: при возврате на вкладку тихо перепроверяем конфигурацию, чтобы
  // кнопка ожила без перезагрузки. Сбой перепроверки состояние не меняет (обычный
  // refetch перевёл бы страницу в экран ошибки), поэтому запрос идёт мимо useQuery-ошибки.
  useEffect(() => {
    if (!paymentOff) return undefined;
    let inflight = false;
    let cancelled = false;
    const recheck = () => {
      if (inflight || document.visibilityState !== 'visible') return;
      inflight = true;
      api
        .get<CheckoutConfig>('/store/checkout-config', { auth: false })
        .then((fresh) => {
          if (cancelled) return;
          client.setQueryData(checkoutKeys.config, fresh);
          if (fresh.paymentAvailable)
            setFailure((prev) => (prev?.paymentUnavailable ? null : prev));
        })
        .catch(() => undefined)
        .finally(() => {
          inflight = false;
        });
    };
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, [paymentOff, client]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy || paymentOff) return;
    setFailure(null);
    setNickError(null);
    const trimmedNick = nick.trim();
    if (!accepted) {
      setOfferError('Подтвердите согласие с офертой, чтобы оформить заказ.');
      focusFirstInvalid();
      return;
    }
    setOfferError(null);
    createOrder.mutate(
      {
        offerVersion: config.offerVersion,
        ...(trimmedNick !== '' ? { targetMinecraftNick: trimmedNick } : {}),
      },
      {
        onSuccess: (result) => {
          const paymentUrl = safePaymentUrl(result.paymentUrl);
          if (paymentUrl) {
            // Оплата у провайдера: уходим целиком, статус заказа покажет страница заказа.
            setRedirecting(true);
            window.location.assign(paymentUrl);
            return;
          }
          // Тестовый провайдер: перехода нет, остаёмся на странице заказа.
          router.push(orderHref(result.order.orderNumber));
        },
        onError: (error) => {
          const info = describeCheckoutError(error);
          setFailure(info);
          if (info.field === 'nick') setNickError(info.message);
          if (info.field === 'offer') {
            setOfferError(info.message);
            if (info.offerOutdated) {
              setAccepted(false);
              // Новая версия оферты придёт в конфигурации: без этого повтор снова уйдёт со старой.
              void client.invalidateQueries({ queryKey: checkoutKeys.config });
            }
          }
          if (info.field) focusFirstInvalid();
        },
      },
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <form
        ref={containerRef}
        onSubmit={submit}
        noValidate
        aria-label="Оформление заказа"
        className="flex min-w-0 flex-col gap-5"
      >
        <Card className="flex flex-col gap-4">
          <h2 className="font-display text-lg font-bold">Получатель</h2>
          <FormField
            label="Ник получателя в Minecraft"
            error={nickError}
            hint={
              linkedNick
                ? `Оставьте поле пустым, и заказ получит ваш привязанный ник: ${linkedNick}. Чтобы купить для другого игрока, введите его ник.`
                : 'Оставьте поле пустым, чтобы использовать ник, привязанный к аккаунту. Если ник не привязан, укажите его здесь.'
            }
          >
            <Input
              value={nick}
              maxLength={16}
              autoComplete="off"
              spellCheck={false}
              placeholder={linkedNick ?? undefined}
              data-testid="checkout-nick"
              onChange={(event) => {
                setNick(event.target.value);
                if (nickError) setNickError(null);
              }}
            />
          </FormField>
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-bold">Согласие</h2>
          <div className="flex items-start gap-3">
            <Checkbox
              id={offerId}
              className="mt-0.5"
              checked={accepted}
              invalid={offerError !== null}
              aria-required
              aria-describedby={offerError ? `${offerId}-error` : undefined}
              data-testid="checkout-offer"
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
              <span aria-hidden className="ml-0.5 text-destructive">
                *
              </span>
            </label>
          </div>
          {offerError ? (
            <p
              id={`${offerId}-error`}
              data-testid="checkout-offer-error"
              className="flex items-start gap-1.5 text-xs text-destructive"
            >
              <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
              <span>{offerError}</span>
            </p>
          ) : null}
        </Card>

        {paymentOff ? (
          <div
            id={unavailableId}
            role="alert"
            data-testid="checkout-payment-unavailable"
            className="flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-sm"
          >
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <div className="flex flex-col gap-1">
              <p className="font-medium">Оплата временно недоступна</p>
              <p className="text-muted-foreground">
                Заказ не создаётся, деньги не списываются. Корзина сохранена: вернитесь позже.
              </p>
            </div>
          </div>
        ) : null}

        {failure && !failure.paymentUnavailable && failure.field === null ? (
          <FormErrorSummary data-testid="checkout-error">{failure.message}</FormErrorSummary>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            size="lg"
            loading={busy}
            disabled={paymentOff}
            aria-describedby={paymentOff ? unavailableId : undefined}
            data-testid="checkout-submit"
          >
            <CreditCard />
            Оплатить {formatMoney(cart.total)}
          </Button>
          <p className="text-xs text-muted-foreground">
            Нажимая «Оплатить», вы создаёте заказ на сумму, которую рассчитает сервер.
          </p>
        </div>
      </form>
      <div className="lg:sticky lg:top-24">
        <OrderSummary cart={cart} />
      </div>
    </div>
  );
}

function CheckoutContent() {
  const status = useAuthStore((state) => state.status);
  const authenticated = status === 'authenticated';
  const cart = useCartView();
  const config = useCheckoutConfig(authenticated);

  let body;
  if (status === 'idle' || status === 'loading') {
    body = <CheckoutSkeleton />;
  } else if (!authenticated) {
    body = (
      <EmptyState
        icon={<UserRound />}
        title="Войдите, чтобы оформить заказ"
        description="Корзина хранится в вашем аккаунте, поэтому для оформления нужен вход."
        action={
          <Button asChild>
            <Link href="/login?next=%2Fshop%2Fcheckout">Войти</Link>
          </Button>
        }
      />
    );
  } else if (cart.isPending || config.isPending) {
    body = <CheckoutSkeleton />;
  } else if (cart.isError) {
    body = (
      <ErrorState error={cart.error} onRetry={() => cart.refetch()} retrying={cart.isFetching} />
    );
  } else if (config.isError) {
    body = (
      <ErrorState
        error={config.error}
        onRetry={() => config.refetch()}
        retrying={config.isFetching}
      />
    );
  } else if (cart.data.items.length === 0) {
    body = (
      <EmptyState
        icon={<ShoppingCart />}
        title="Корзина пуста"
        description="Добавьте товары из магазина, чтобы оформить заказ."
        action={
          <Button asChild>
            <Link href="/shop">В магазин</Link>
          </Button>
        }
      />
    );
  } else {
    body = <CheckoutForm cart={cart.data} config={config.data} />;
  }

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-8 md:px-6">
      <Breadcrumbs
        items={[
          { label: 'Магазин', href: '/shop' },
          { label: 'Корзина', href: '/shop/cart' },
          { label: 'Оформление' },
        ]}
      />
      <h1 className="font-display text-2xl font-bold md:text-3xl">Оформление заказа</h1>
      {body}
    </div>
  );
}

/// Оформление заказа: сводка из серверной корзины, ник получателя, согласие с
/// офертой, оплата через `POST /store/orders` (подэтап 0.5). Платёжного
/// провайдера клиент не знает. Модуль «store» выключен — ModuleGate.
export default function CheckoutPage() {
  return (
    <ModuleGate module="store">
      <CheckoutContent />
    </ModuleGate>
  );
}
