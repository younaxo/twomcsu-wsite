'use client';

import {
  Gift,
  Lock,
  Minus,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Tag,
  Trash2,
  TriangleAlert,
  UserRound,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ModuleGate } from '@/components/system/site-availability';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/lib/auth/store';
import { formatMoney, formatNumber, plural } from '@/lib/format';
import {
  cartErrorMessage,
  isPositive,
  isPromoProblem,
  itemName,
  lineFor,
  promoErrorMessage,
  useCartMutations,
  useCartView,
  type CartItemView,
  type CartLineView,
  type CartView,
} from '@/lib/store/cart';

type Mutations = ReturnType<typeof useCartMutations>;

function CartSkeleton() {
  return (
    <div
      role="status"
      data-testid="cart-skeleton"
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
    >
      <span className="sr-only">Загрузка корзины…</span>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-28 w-full rounded-lg" />
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}

function GiftForm({
  item,
  line,
  mutations,
  recipient,
  onSaved,
}: {
  item: CartItemView;
  line: CartLineView | null;
  mutations: Mutations;
  recipient: string | undefined;
  onSaved: (nick: string) => void;
}) {
  const hasGift = Boolean(item.giftToUserId ?? line?.giftToUserId);
  const [open, setOpen] = useState(hasGift);
  const [nick, setNick] = useState(recipient ?? '');
  const [message, setMessage] = useState(item.giftMessage ?? line?.giftMessage ?? '');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const nickId = useId();

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = nick.trim();
    if (trimmed === '') {
      setFieldError('Введите ник получателя.');
      return;
    }
    setFieldError(null);
    try {
      await mutations.setGift.mutateAsync({
        id: item.id,
        giftToUsername: trimmed,
        giftMessage: message.trim(),
      });
      onSaved(trimmed);
    } catch (error) {
      setFieldError(cartErrorMessage(error));
    }
  };

  const reset = async () => {
    try {
      await mutations.setGift.mutateAsync({ id: item.id, giftToUsername: '', giftMessage: '' });
      setNick('');
      setMessage('');
      setFieldError(null);
      setOpen(false);
      onSaved('');
    } catch (error) {
      setFieldError(cartErrorMessage(error));
    }
  };

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => setOpen(true)}
      >
        <Gift />
        Подарить
      </Button>
    );
  }

  return (
    <form
      onSubmit={save}
      aria-label={`Подарок: ${itemName(item, line)}`}
      className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface-sunken p-3"
    >
      <Field label="Ник получателя" error={fieldError} required>
        <Input
          id={nickId}
          value={nick}
          maxLength={32}
          autoComplete="off"
          onChange={(event) => setNick(event.target.value)}
        />
      </Field>
      <Field label="Сообщение" hint="До 500 символов, необязательно.">
        <Textarea
          value={message}
          maxLength={500}
          rows={2}
          onChange={(event) => setMessage(event.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" loading={mutations.setGift.isPending}>
          {hasGift ? 'Сохранить подарок' : 'Подарить'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={mutations.setGift.isPending}
          onClick={() => (hasGift ? void reset() : setOpen(false))}
        >
          {hasGift ? 'Покупаю себе' : 'Отмена'}
        </Button>
      </div>
    </form>
  );
}

function CartRow({
  item,
  line,
  mutations,
  recipient,
  busy,
  announce,
  onRemoving,
  onRemoveFailed,
  onRecipient,
}: {
  item: CartItemView;
  line: CartLineView | null;
  mutations: Mutations;
  recipient: string | undefined;
  busy: boolean;
  announce: (message: string) => void;
  onRemoving: () => void;
  onRemoveFailed: () => void;
  onRecipient: (id: string, nick: string) => void;
}) {
  const name = itemName(item, line);
  const unique = line?.isUnique === true;
  const giftable =
    item.productId !== null && line?.isGiftable === true && line.isSelfOnly === false;
  const hasGift = Boolean(item.giftToUserId ?? line?.giftToUserId);
  // Ошибка действия показывается в самой карточке, рядом с кнопкой.
  const [rowError, setRowError] = useState<string | null>(null);

  const changeQuantity = async (quantity: number) => {
    setRowError(null);
    try {
      await mutations.setQuantity.mutateAsync({ id: item.id, quantity });
      announce(`${name}: количество ${quantity}.`);
    } catch (error) {
      setRowError(cartErrorMessage(error));
    }
  };

  const remove = async () => {
    setRowError(null);
    onRemoving();
    try {
      await mutations.remove.mutateAsync(item.id);
      announce(`${name} удалён из корзины.`);
    } catch (error) {
      onRemoveFailed();
      setRowError(cartErrorMessage(error));
    }
  };

  return (
    <li data-testid="cart-item" data-context="product" data-context-name={name}>
      <Card className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="flex size-14 shrink-0 items-center justify-center rounded bg-surface-sunken">
            <ShoppingBag aria-hidden className="size-6 text-subtle-foreground" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="break-words font-display text-base font-bold">{name}</h2>
            {line ? (
              <p className="text-sm text-muted-foreground tabular">
                {formatMoney(line.unitPrice)} × {formatNumber(item.quantity)}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-1.5">
              {unique ? <Badge tone="info">Покупается один раз</Badge> : null}
              {hasGift ? (
                <Badge icon={<Gift aria-hidden className="size-3.5" />}>
                  {recipient ? `Подарок для ${recipient}` : 'Подарок'}
                </Badge>
              ) : null}
            </div>
          </div>
          <IconButton
            type="button"
            variant="ghost"
            aria-label={`Удалить: ${name}`}
            disabled={busy}
            onClick={() => void remove()}
          >
            <Trash2 />
          </IconButton>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          {unique ? (
            <p className="text-sm text-muted-foreground">Количество: 1</p>
          ) : (
            <div
              role="group"
              aria-label={`Количество: ${name}`}
              className="flex items-center gap-2"
            >
              <IconButton
                type="button"
                variant="secondary"
                aria-label={`Уменьшить количество: ${name}`}
                disabled={busy || item.quantity <= 1}
                onClick={() => void changeQuantity(item.quantity - 1)}
              >
                <Minus />
              </IconButton>
              <output
                aria-label={`Количество: ${name}`}
                data-testid="cart-quantity"
                className="min-w-8 text-center text-sm font-semibold tabular"
              >
                {formatNumber(item.quantity)}
              </output>
              <IconButton
                type="button"
                variant="secondary"
                aria-label={`Увеличить количество: ${name}`}
                disabled={busy}
                onClick={() => void changeQuantity(item.quantity + 1)}
              >
                <Plus />
              </IconButton>
            </div>
          )}
          {line ? (
            <div className="flex flex-col items-end gap-0.5 text-right">
              {isPositive(line.bulkDiscount) ? (
                <>
                  <span className="text-xs text-muted-foreground tabular">
                    <span className="sr-only">Без скидки: </span>
                    <s>{formatMoney(line.lineSubtotal)}</s>
                  </span>
                  <span className="text-xs text-success tabular">
                    Скидка за объём −{formatMoney(line.bulkDiscount)}
                  </span>
                </>
              ) : null}
              <span className="font-display text-lg font-bold tabular">
                <span className="sr-only">Сумма по позиции: </span>
                {formatMoney(line.lineTotal)}
              </span>
            </div>
          ) : null}
        </div>

        {rowError ? (
          <p
            role="alert"
            data-testid="cart-row-error"
            className="rounded-lg bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive"
          >
            {rowError}
          </p>
        ) : null}

        {giftable ? (
          <GiftForm
            item={item}
            line={line}
            mutations={mutations}
            recipient={recipient}
            onSaved={(nick) => {
              onRecipient(item.id, nick);
              announce(nick ? `Подарок для ${nick} сохранён.` : 'Подарок отменён.');
            }}
          />
        ) : null}
      </Card>
    </li>
  );
}

function PromoBlock({
  cart,
  mutations,
  announce,
}: {
  cart: CartView;
  mutations: Mutations;
  announce: (message: string) => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const applied = cart.promoCode ?? null;
  const promoError = cart.promoError ?? null;

  const apply = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = code.trim();
    if (trimmed === '') {
      setError('Введите промокод.');
      return;
    }
    setError(null);
    try {
      await mutations.applyPromo.mutateAsync(trimmed);
      setCode('');
      announce(`Промокод ${trimmed.toUpperCase()} применён.`);
    } catch (e) {
      setError(cartErrorMessage(e, 'Не удалось применить промокод.'));
    }
  };

  const remove = async () => {
    try {
      await mutations.removePromo.mutateAsync();
      announce('Промокод убран.');
    } catch (e) {
      setError(cartErrorMessage(e));
    }
  };

  if (applied) {
    return (
      <div data-testid="promo-applied" className="flex flex-col gap-2">
        <div
          className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 ${promoError ? 'bg-warning-soft' : 'bg-success-soft'}`}
        >
          <div className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <Tag
                aria-hidden
                className={`size-4 ${promoError ? 'text-muted-foreground' : 'text-success'}`}
              />
              <span className="break-all">{applied.code}</span>
            </span>
            {applied.description ? (
              <span className="text-xs text-muted-foreground">{applied.description}</span>
            ) : null}
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            loading={mutations.removePromo.isPending}
            onClick={() => void remove()}
            aria-label={`Убрать промокод ${applied.code}`}
          >
            <X />
            Убрать
          </Button>
        </div>
        {promoError ? (
          <p
            role="alert"
            data-testid="promo-error"
            className="flex items-start gap-1.5 rounded-lg bg-warning-soft px-3 py-2 text-xs font-medium"
          >
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{promoErrorMessage(promoError)} Скидка по промокоду не применяется.</span>
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={apply} className="flex flex-col gap-2" aria-label="Промокод" noValidate>
      <Field label="Промокод" error={error}>
        <Input
          value={code}
          maxLength={32}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          onChange={(event) => {
            setCode(event.target.value);
            if (error) setError(null);
          }}
        />
      </Field>
      <Button type="submit" variant="secondary" loading={mutations.applyPromo.isPending}>
        Применить
      </Button>
    </form>
  );
}

function SummaryRow({ label, value, tone }: { label: string; value: string; tone?: 'discount' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={tone === 'discount' ? 'text-success tabular' : 'tabular'}>{value}</dd>
    </div>
  );
}

function Summary({
  cart,
  mutations,
  announce,
}: {
  cart: CartView;
  mutations: Mutations;
  announce: (message: string) => void;
}) {
  const hintId = useId();
  const loyalty = Number(cart.loyaltyDiscountPercent);
  return (
    <section id="checkout" aria-labelledby="cart-summary-title" className="lg:sticky lg:top-24">
      <Card className="flex flex-col gap-4">
        <h2 id="cart-summary-title" className="font-display text-lg font-bold">
          Итог заказа
        </h2>
        <PromoBlock cart={cart} mutations={mutations} announce={announce} />
        <dl className="flex flex-col gap-2 border-t border-border-subtle pt-4">
          <SummaryRow label="Товары" value={formatMoney(cart.subtotal)} />
          {isPositive(cart.bulkDiscountTotal) ? (
            <SummaryRow
              label="Скидка за объём"
              value={`−${formatMoney(cart.bulkDiscountTotal)}`}
              tone="discount"
            />
          ) : null}
          {isPositive(cart.loyaltyDiscountTotal) ? (
            <SummaryRow
              label={`Скидка лояльности${loyalty > 0 ? `, ${formatNumber(loyalty)}%` : ''}`}
              value={`−${formatMoney(cart.loyaltyDiscountTotal)}`}
              tone="discount"
            />
          ) : null}
          {cart.promoCode && !cart.promoError ? (
            <SummaryRow
              label={`Промокод ${cart.promoCode.code}`}
              value={
                isPositive(cart.promoDiscountTotal)
                  ? `−${formatMoney(cart.promoDiscountTotal)}`
                  : formatMoney(0)
              }
              tone="discount"
            />
          ) : null}
        </dl>
        <div
          data-testid="cart-total"
          className="flex items-baseline justify-between gap-3 border-t border-border-subtle pt-4"
        >
          <span className="text-base font-semibold">Итого к оплате</span>
          <span className="font-display text-2xl font-bold tabular">{formatMoney(cart.total)}</span>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            size="lg"
            aria-disabled="true"
            aria-describedby={hintId}
            onClick={(event) => event.preventDefault()}
          >
            <Lock />
            Оформить заказ
          </Button>
          <p id={hintId} className="text-xs text-muted-foreground">
            Оплата появится в ближайшем обновлении. Корзина сохраняется в вашем аккаунте.
          </p>
        </div>
      </Card>
    </section>
  );
}

function CartContent() {
  const status = useAuthStore((state) => state.status);
  const query = useCartView();
  const mutations = useCartMutations();
  const [confirmClear, setConfirmClear] = useState(false);
  const [message, setMessage] = useState('');
  const [clearError, setClearError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Метка «после этой мутации нужно вернуть фокус на заголовок, если корзина опустела».
  const refocus = useRef(false);
  // Сервер отдаёт у подарка только id получателя; введённый ник помним на странице.
  const [recipients, setRecipients] = useState<Record<string, string>>({});

  const announce = (text: string) => {
    setClearError(null);
    setMessage(text);
  };
  const busy =
    mutations.setQuantity.isPending || mutations.remove.isPending || mutations.clear.isPending;

  const isEmpty = query.data?.items.length === 0;
  const itemCount = query.data?.items.length;
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    if (!isEmpty) return;
    // Кнопки удаления/очистки исчезли вместе с позицией, а Radix ещё возвращает фокус
    // в снятый с дерева триггер: переносим фокус на заголовок после него.
    const timer = setTimeout(() => headingRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [isEmpty, itemCount]);

  let body;
  if (status === 'idle' || status === 'loading') {
    body = <CartSkeleton />;
  } else if (status !== 'authenticated') {
    body = (
      <EmptyState
        icon={<UserRound />}
        title="Войдите, чтобы собрать корзину"
        description="Корзина хранится в вашем аккаунте, поэтому для покупок нужен вход."
        action={
          <Button asChild>
            <Link href="/login?next=%2Fshop%2Fcart">Войти</Link>
          </Button>
        }
      />
    );
  } else if (query.isPending) {
    body = <CartSkeleton />;
  } else if (query.isError) {
    body = isPromoProblem(query.error) ? (
      <div
        role="alert"
        data-testid="cart-promo-problem"
        className="flex flex-col items-start gap-3 rounded-lg bg-warning-soft p-4"
      >
        <p className="text-sm font-medium">{cartErrorMessage(query.error)}</p>
        <p className="text-sm text-muted-foreground">
          Сохранённый промокод больше не подходит к корзине. Уберите его, и корзина откроется.
        </p>
        <Button
          type="button"
          loading={mutations.removePromo.isPending}
          onClick={() => mutations.removePromo.mutate()}
        >
          Убрать промокод
        </Button>
      </div>
    ) : (
      <ErrorState error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />
    );
  } else if (query.data.items.length === 0) {
    body = (
      <EmptyState
        icon={<ShoppingCart />}
        title="Корзина пуста"
        description="Добавьте товары из магазина — здесь появится итог со скидками."
        action={
          <Button asChild>
            <Link href="/shop">В магазин</Link>
          </Button>
        }
      />
    );
  } else {
    const cart = query.data;
    const count = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    body = (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {formatNumber(count)}{' '}
              {plural(count, { one: 'товар', few: 'товара', many: 'товаров' })}
            </p>
            <Button
              type="button"
              variant="destructive-outline"
              size="sm"
              disabled={busy}
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 />
              Очистить
            </Button>
          </div>
          {clearError ? (
            <p
              role="alert"
              data-testid="cart-clear-error"
              className="rounded-lg bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive"
            >
              {clearError}
            </p>
          ) : null}
          <ul className="flex flex-col gap-3" aria-label="Товары в корзине">
            {cart.items.map((item, index) => (
              <CartRow
                key={item.id}
                item={item}
                line={lineFor(cart, index)}
                mutations={mutations}
                recipient={recipients[item.id]}
                busy={busy}
                announce={announce}
                onRemoving={() => {
                  refocus.current = true;
                }}
                onRemoveFailed={() => {
                  refocus.current = false;
                }}
                onRecipient={(id, nick) => setRecipients((prev) => ({ ...prev, [id]: nick }))}
              />
            ))}
          </ul>
        </div>
        <Summary cart={cart} mutations={mutations} announce={announce} />
        <ConfirmDialog
          open={confirmClear}
          onOpenChange={setConfirmClear}
          title="Очистить корзину?"
          description="Все товары будут удалены из корзины. Промокод и подарки тоже сбросятся."
          confirmLabel="Очистить"
          destructive
          onConfirm={async () => {
            setClearError(null);
            refocus.current = true;
            try {
              await mutations.clear.mutateAsync();
              setRecipients({});
              announce('Корзина очищена.');
            } catch (e) {
              refocus.current = false;
              setClearError(cartErrorMessage(e));
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-8 md:px-6">
      <Breadcrumbs items={[{ label: 'Магазин', href: '/shop' }, { label: 'Корзина' }]} />
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-2xl font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background md:text-3xl"
      >
        Корзина
      </h1>
      {/* Единственный polite-регион страницы: итог суммы сам не озвучивается. */}
      <p role="status" aria-live="polite" data-testid="cart-announce" className="sr-only">
        {message}
      </p>
      {body}
    </div>
  );
}

/// Корзина: реальный API `/store/cart`. Суммы и скидки — только из ответа сервера
/// (клиент ничего не считает). Оформление заказа — подэтап 0.5, пока кнопка
/// неактивна с пояснением. Модуль «store» выключен — ModuleGate.
export default function CartPage() {
  return (
    <ModuleGate module="store">
      <CartContent />
    </ModuleGate>
  );
}
