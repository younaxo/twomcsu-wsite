'use client';

import { CircleCheck, CircleX, Clock, PackageSearch, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ModuleGate } from '@/components/system/site-availability';
import { Badge } from '@/components/ui/badge';
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
  ORDER_STATUS_TEXT,
  orderHref,
  useOrder,
  type OrderItemView,
  type OrderStatus,
  type OrderView,
} from '@/lib/store/checkout';

const STATUS_VIEW: Record<
  OrderStatus,
  { tone: 'warning' | 'success' | 'destructive' | 'neutral'; Icon: typeof Clock }
> = {
  PENDING: { tone: 'warning', Icon: Clock },
  COMPLETED: { tone: 'success', Icon: CircleCheck },
  FAILED: { tone: 'destructive', Icon: CircleX },
  CANCELLED: { tone: 'neutral', Icon: CircleX },
  REFUNDED: { tone: 'neutral', Icon: CircleCheck },
};

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

function OrderBody({ order }: { order: OrderView }) {
  const { tone, Icon } = STATUS_VIEW[order.status];
  const text = ORDER_STATUS_TEXT[order.status];
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card className="flex flex-col gap-3" data-testid="order-status-card">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={tone} icon={<Icon aria-hidden className="size-3.5" />}>
            {text.label}
          </Badge>
          <span className="text-sm text-muted-foreground tabular">№ {order.orderNumber}</span>
        </div>
        {/* Единственный polite-регион страницы: смена статуса озвучивается сама. */}
        <p role="status" aria-live="polite" data-testid="order-status-live" className="text-sm">
          {text.label}. {text.description}
        </p>
        {order.status === 'PENDING' ? (
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
              </span>
              <span className="tabular">{formatMoney(item.totalPrice)}</span>
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
  const orderNumber = decodeURIComponent(params?.orderNumber ?? '');
  const status = useAuthStore((state) => state.status);
  const query = useOrder(orderNumber);

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
    body = <OrderBody order={query.data} />;
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
