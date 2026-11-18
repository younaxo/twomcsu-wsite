'use client';

import { ChevronRight, ShoppingBag, UserRound } from 'lucide-react';
import Link from 'next/link';
import { OrderStatusBadge } from '@/components/store/order-status-badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/lib/auth/store';
import { formatDateTime, formatMoney } from '@/lib/format';
import { orderHref, useMyOrders, type OrderView } from '@/lib/store/checkout';

function OrdersSkeleton({ rows }: { rows: number }) {
  return (
    <div role="status" data-testid="orders-skeleton" className="flex flex-col gap-2">
      <span className="sr-only">Загрузка заказов…</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}

function OrderRow({ order }: { order: OrderView }) {
  return (
    <li>
      <Link
        href={orderHref(order.orderNumber)}
        data-testid="order-row"
        className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-surface px-4 py-3 shadow-sm transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold tabular">Заказ № {order.orderNumber}</span>
          <span className="text-xs text-muted-foreground">
            {order.createdAt ? formatDateTime(order.createdAt) : 'Дата неизвестна'}
          </span>
        </span>
        <span className="text-sm font-semibold tabular">{formatMoney(order.total)}</span>
        <OrderStatusBadge status={order.status} />
        <ChevronRight aria-hidden className="size-4 text-subtle-foreground" />
      </Link>
    </li>
  );
}

/// Список своих заказов: номер, дата, сумма, статус оплаты, ссылка на карточку.
/// Только заказы текущего пользователя (фильтрует сервер). Статус выдачи
/// появится после подэтапа 0.7. `onPageChange` не задан — без пагинации
/// (краткий срез в настройках) и со ссылкой «Все заказы».
export function OrdersList({
  page = 1,
  limit,
  onPageChange,
  skeletonRows = 3,
}: {
  page?: number;
  limit: number;
  onPageChange?: (page: number) => void;
  skeletonRows?: number;
}) {
  const status = useAuthStore((state) => state.status);
  const query = useMyOrders(page, limit);

  if (status === 'idle' || status === 'loading') return <OrdersSkeleton rows={skeletonRows} />;
  if (status !== 'authenticated') {
    return (
      <EmptyState
        icon={<UserRound />}
        title="Войдите, чтобы увидеть заказы"
        description="Заказы доступны только их владельцу."
        action={
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent('/shop/orders')}`}>Войти</Link>
          </Button>
        }
      />
    );
  }
  if (query.isPending) return <OrdersSkeleton rows={skeletonRows} />;
  if (query.isError && !query.data) {
    return (
      <ErrorState error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />
    );
  }
  const data = query.data;
  if (!data || data.items.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag />}
        title="Заказов пока нет"
        description="Здесь появятся ваши покупки и статус их оплаты."
        action={
          <Button asChild>
            <Link href="/shop">В магазин</Link>
          </Button>
        }
      />
    );
  }
  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));
  return (
    <div className="flex flex-col gap-4">
      <ul aria-label="Мои заказы" className="flex flex-col gap-2">
        {data.items.map((order) => (
          <OrderRow key={order.id} order={order} />
        ))}
      </ul>
      {onPageChange ? (
        totalPages > 1 ? (
          <Pagination
            page={data.page}
            totalPages={totalPages}
            onPageChange={onPageChange}
            label="Страницы заказов"
            className="self-center"
          />
        ) : null
      ) : data.total > data.items.length ? (
        <p className="text-sm text-muted-foreground">
          Показаны последние {data.items.length} из {data.total}.{' '}
          <Link
            href="/shop/orders"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Все заказы
          </Link>
        </p>
      ) : null}
    </div>
  );
}
