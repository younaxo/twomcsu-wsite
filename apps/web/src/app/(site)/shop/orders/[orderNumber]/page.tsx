'use client';

import { PackageSearch, RefreshCw, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DeliveryStatusBadge } from '@/components/store/delivery-status-badge';
import { OrderStatusBadge } from '@/components/store/order-status-badge';
import { ModuleGate } from '@/components/system/site-availability';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import { formatMoney, formatNumber } from '@/lib/format';
import { isPositive } from '@/lib/store/cart';
import {
  DELIVERY_STATUS_TEXT,
  orderStatusText,
  orderHref,
  readDeliveryStatus,
  useOrder,
  type OrderItemView,
  type OrderView,
} from '@/lib/store/checkout';

function OrderSkeleton() {
  return (
    <div role="status" data-testid="order-skeleton" className="flex flex-col gap-4">
      <span className="sr-only">Загрузка заказа…</span>
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  );
}

function itemTitle(item: OrderItemView): string {
  const base = item.product?.name ?? item.bundle?.name ?? 'Товар';
  return item.variant?.name ? `${base} · ${item.variant.name}` : base;
}

function OrderBody({ order, autoRefresh }: { order: OrderView; autoRefresh: boolean }) {
  const text = orderStatusText(order.status);
  const delivery = readDeliveryStatus(order.deliveryStatus);
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card className="flex flex-col gap-3" data-testid="order-status-card">
        <div className="flex flex-wrap items-center gap-2">
          <OrderStatusBadge status={order.status} />
          <span className="min-w-0 break-all text-sm text-muted-foreground tabular">
            № {order.orderNumber}
          </span>
        </div>
        {/* Единственный polite-регион страницы: смена статуса озвучивается сама. */}
        <p role="status" aria-live="polite" data-testid="order-status-live" className="text-sm">
          {text.label}. {text.description}
        </p>
        {delivery ? (
          <div
            data-testid="order-delivery"
            className="flex flex-col gap-1 border-t border-border-subtle pt-3"
          >
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
              Выдача
              <DeliveryStatusBadge status={delivery} />
            </p>
            <p className="text-sm text-muted-foreground">
              {DELIVERY_STATUS_TEXT[delivery].description}
            </p>
          </div>
        ) : null}
        {order.status === 'PENDING' && autoRefresh ? (
          <p className="text-xs text-muted-foreground">Статус обновляется автоматически.</p>
        ) : null}
        {order.status === 'FAILED' ? (
          <div>
            <Button asChild variant="secondary">
              <Link href="/shop/cart">Вернуться в корзину</Link>
            </Button>
          </div>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="font-display text-lg font-bold">Состав заказа</h2>
        <ul aria-label="Товары заказа" className="flex flex-col gap-2">
          {order.items.map((item) => (
            <li
              key={item.id}
              data-testid="order-item"
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span className="min-w-0 break-words">
                {itemTitle(item)}
                <span className="text-muted-foreground tabular">
                  {' '}
                  × {formatNumber(item.quantity)}
                </span>
                {item.giftToUser ? (
                  <span className="block text-xs text-muted-foreground">
                    Подарок для {item.giftToUser.username}
                  </span>
                ) : null}
                {readDeliveryStatus(item.deliveryStatus) ? (
                  <span className="mt-1 block">
                    <DeliveryStatusBadge status={item.deliveryStatus} />
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 whitespace-nowrap tabular">
                {formatMoney(item.totalPrice)}
              </span>
            </li>
          ))}
        </ul>
        <dl className="flex flex-col gap-2 border-t border-border-subtle pt-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Товары</dt>
            <dd className="tabular">{formatMoney(order.subtotal)}</dd>
          </div>
          {isPositive(order.discountAmount) ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Скидки</dt>
              <dd className="text-success tabular">−{formatMoney(order.discountAmount)}</dd>
            </div>
          ) : null}
        </dl>
        <div
          data-testid="order-total"
          className="flex items-baseline justify-between gap-3 border-t border-border-subtle pt-4"
        >
          <span className="text-base font-semibold">Итого</span>
          <span className="font-display text-2xl font-bold tabular">
            {formatMoney(order.total)}
          </span>
        </div>
      </Card>
    </div>
  );
}

function OrderContent() {
  const params = useParams<{ orderNumber: string }>();
  // useParams уже отдаёт декодированное значение: повторное декодирование ломает номера с «%».
  const orderNumber = params?.orderNumber ?? '';
  const status = useAuthStore((state) => state.status);
  const { query, pollExpired, resumePolling } = useOrder(orderNumber);

  let body;
  if (status === 'idle' || status === 'loading') {
    body = <OrderSkeleton />;
  } else if (status !== 'authenticated') {
    body = (
      <EmptyState
        icon={<UserRound />}
        title="Войдите, чтобы увидеть заказ"
        description="Заказы доступны только их владельцу."
        action={
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent(orderHref(orderNumber))}`}>Войти</Link>
          </Button>
        }
      />
    );
  } else if (query.isPending) {
    body = <OrderSkeleton />;
  } else if (
    query.data &&
    !(
      query.isError &&
      query.error instanceof ApiError &&
      (query.error.status === 404 || query.error.status === 403)
    )
  ) {
    // Уже показанный заказ не заменяем экраном ошибки из-за разового сбоя опроса (5xx/сеть):
    // опрос продолжается сам, пользователю даём ненавязчивое сообщение.
    body = (
      <>
        {query.isError ? (
          <p data-testid="order-poll-error" className="text-xs text-muted-foreground">
            Не удалось обновить статус, пробуем ещё раз.
          </p>
        ) : null}
        {pollExpired ? (
          <div
            role="status"
            data-testid="order-poll-expired"
            className="flex max-w-3xl flex-wrap items-center gap-3 rounded-lg bg-warning-soft p-3 text-sm"
          >
            <p className="min-w-0 flex-1">
              Автоматическое обновление остановлено: подтверждение оплаты всё ещё не пришло. Если вы
              уже оплатили, нажмите «Обновить» чуть позже.
            </p>
            <Button
              type="button"
              variant="secondary"
              loading={query.isFetching}
              onClick={resumePolling}
            >
              <RefreshCw />
              Обновить
            </Button>
          </div>
        ) : null}
        <OrderBody order={query.data} autoRefresh={!pollExpired} />
      </>
    );
  } else if (query.isError) {
    const error = query.error;
    // Чужой заказ (403) показываем так же, как отсутствующий: номер чужого заказа не раскрываем.
    const missing = error instanceof ApiError && (error.status === 404 || error.status === 403);
    body = missing ? (
      <EmptyState
        icon={<PackageSearch />}
        title="Заказ не найден"
        description="Проверьте номер заказа. Открыть можно только свой заказ."
        action={
          <Button asChild>
            <Link href="/shop">В магазин</Link>
          </Button>
        }
      />
    ) : (
      <ErrorState error={error} onRetry={() => query.refetch()} retrying={query.isFetching} />
    );
  } else {
    body = <OrderSkeleton />;
  }

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-8 md:px-6">
      <Breadcrumbs items={[{ label: 'Магазин', href: '/shop' }, { label: 'Заказ' }]} />
      <h1 className="font-display text-2xl font-bold md:text-3xl">Заказ</h1>
      {body}
    </div>
  );
}

/// Статус заказа: опрос PENDING до финального статуса (`useOrder`), суммы только
/// из ответа сервера. Модуль «store» выключен — ModuleGate.
export default function OrderPage() {
  return (
    <ModuleGate module="store">
      <OrderContent />
    </ModuleGate>
  );
}
