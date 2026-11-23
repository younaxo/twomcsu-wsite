'use client';

import { PackageSearch, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { DeliveryStatusBadge } from '@/components/store/delivery-status-badge';
import { OrderStatusBadge } from '@/components/store/order-status-badge';
import { ModuleGate } from '@/components/system/site-availability';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api/errors';
import { formatMoney, formatNumber } from '@/lib/format';
import { isPositive } from '@/lib/store/cart';
import { DELIVERY_STATUS_TEXT, orderStatusText, readDeliveryStatus } from '@/lib/store/checkout';
import {
  GUEST_NOT_FOUND_TEXT,
  extractGuestToken,
  lookupGuestOrder,
  type GuestOrderView,
} from '@/lib/store/quick-buy';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; order: GuestOrderView };

function GuestOrderBody({ order }: { order: GuestOrderView }) {
  const text = orderStatusText(order.status);
  const delivery = readDeliveryStatus(order.deliveryStatus);
  return (
    <div className="flex max-w-3xl flex-col gap-4" data-testid="guest-order">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg font-bold">Заказ № {order.orderNumber}</h2>
          <OrderStatusBadge status={order.status} />
          {delivery ? <DeliveryStatusBadge status={delivery} /> : null}
        </div>
        <p className="text-sm text-muted-foreground">{text.description}</p>
        {delivery ? (
          <p className="text-sm text-muted-foreground">
            {DELIVERY_STATUS_TEXT[delivery].description}
          </p>
        ) : null}
        {order.guestMinecraftNick ? (
          <p className="text-sm">
            Получатель: <span className="font-medium">{order.guestMinecraftNick}</span>
          </p>
        ) : null}
      </Card>
      <Card className="flex flex-col gap-4">
        <ul aria-label="Позиции заказа" className="flex flex-col gap-2">
          {order.items.map((item, index) => {
            const itemDelivery = readDeliveryStatus(item.deliveryStatus);
            return (
              <li
                key={`${item.name}-${index}`}
                data-testid="guest-order-item"
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="min-w-0 break-words">
                  {item.name}
                  <span className="text-muted-foreground tabular">
                    {' '}
                    × {formatNumber(item.quantity)}
                  </span>
                  {itemDelivery ? (
                    <span className="block text-xs text-muted-foreground">
                      {DELIVERY_STATUS_TEXT[itemDelivery].label}
                    </span>
                  ) : null}
                </span>
                <span className="tabular">{formatMoney(item.totalPrice)}</span>
              </li>
            );
          })}
        </ul>
        <dl className="flex flex-col gap-2 border-t border-border-subtle pt-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Товары</dt>
            <dd className="tabular">{formatMoney(order.subtotal)}</dd>
          </div>
          {isPositive(order.discountAmount) ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Скидка</dt>
              <dd className="tabular text-success">−{formatMoney(order.discountAmount)}</dd>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between gap-3 text-base font-semibold">
            <dt>Итого</dt>
            <dd className="font-display text-xl tabular">{formatMoney(order.total)}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}

function GuestOrderContent() {
  const inputId = useId();
  const [manual, setManual] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const lastToken = useRef('');
  const seq = useRef(0);

  const load = useCallback(async (raw: string) => {
    const token = extractGuestToken(raw);
    if (token === '') return;
    lastToken.current = token;
    const mine = ++seq.current;
    setState({ kind: 'loading' });
    try {
      const order = await lookupGuestOrder(token);
      if (mine === seq.current) setState({ kind: 'ok', order });
    } catch (error) {
      if (mine !== seq.current) return;
      // Любой 4xx (404, неверный формат) — одно и то же «не найден»: причина не раскрывается.
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        setState(
          error.status === 429
            ? { kind: 'error', message: 'Слишком много попыток, попробуйте через минуту' }
            : { kind: 'not_found' },
        );
      } else {
        setState({ kind: 'error', message: 'Не удалось загрузить заказ. Попробуйте ещё раз.' });
      }
    }
  }, []);

  // Токен берём из фрагмента адреса и сразу убираем его из строки браузера (история, снимки
  // экрана): дальше он живёт только в памяти страницы.
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.length > 1) {
      window.history.replaceState(null, '', window.location.pathname);
      void load(hash);
    }
  }, [load]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void load(manual);
    setManual('');
  };

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-8 md:px-6">
      <Breadcrumbs items={[{ label: 'Магазин', href: '/shop' }, { label: 'Заказ без входа' }]} />
      <h1 className="font-display text-2xl font-bold md:text-3xl">Заказ без входа</h1>

      {state.kind === 'loading' ? (
        <div role="status" data-testid="guest-order-skeleton" className="flex flex-col gap-4">
          <span className="sr-only">Загрузка заказа…</span>
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      ) : null}

      {state.kind === 'ok' ? (
        <>
          <GuestOrderBody order={state.order} />
          <div>
            <Button type="button" variant="secondary" onClick={() => void load(lastToken.current)}>
              <RefreshCw />
              Обновить статус
            </Button>
          </div>
        </>
      ) : null}

      {state.kind === 'not_found' ? (
        <EmptyState
          icon={<PackageSearch />}
          title={GUEST_NOT_FOUND_TEXT}
          description="Проверьте ссылку: возможно, она неполная или срок её действия истёк."
        />
      ) : null}

      <div aria-live="assertive">
        {state.kind === 'error' ? (
          <p
            role="alert"
            data-testid="guest-order-error"
            className="text-sm font-medium text-destructive"
          >
            {state.message}
          </p>
        ) : null}
      </div>

      {state.kind === 'idle' || state.kind === 'not_found' || state.kind === 'error' ? (
        <form
          onSubmit={submit}
          noValidate
          aria-label="Открыть заказ по ссылке"
          className="flex max-w-xl flex-col gap-2"
        >
          <Label htmlFor={inputId}>Ссылка или код заказа</Label>
          <Input
            id={inputId}
            value={manual}
            autoComplete="off"
            spellCheck={false}
            data-testid="guest-order-input"
            onChange={(event) => setManual(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Вставьте ссылку, которую вы сохранили при оформлении заказа.
          </p>
          <div>
            <Button type="submit" disabled={manual.trim() === ''}>
              Открыть заказ
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

/// Страница заказа без входа: токен из фрагмента (#t=) или ручной вставки, запрос — POST
/// с токеном в теле. Показывает только поля guest-order-view.
export default function GuestOrderPage() {
  return (
    <ModuleGate module="store">
      <GuestOrderContent />
    </ModuleGate>
  );
}
