'use client';

import { ArrowLeft, Ban } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import {
  DescriptionItem,
  DescriptionList,
  PageHeader,
  PageSection,
} from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { ErrorState } from '@/components/ui/error-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import {
  ORDER_REFUND_UI_ENABLED,
  ORDER_STATUS_META,
  orderLineName,
  useAdminOrderCard,
  type AdminOrderCard,
  type AdminOrderLine,
} from '@/lib/admin/store-orders';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDateTime, formatMoney } from '@/lib/format';
import { durationLabel } from '@/lib/store/catalog';
import { CancelOrderDialog } from '../_components/cancel-order-dialog';

/// Карточка заказа (слой 0, 0.4): позиции, суммы, сводка оплаты, отмена
/// PENDING. Журнала событий вебхука в БД нет — показывается итог проверки
/// (провайдер, ID платежа, время оплаты и проверки). Права `orders.view`,
/// `orders.cancel`.

const LINE_COLUMNS: DataGridColumn<AdminOrderLine>[] = [
  {
    key: 'item',
    header: 'Позиция',
    cell: (line) => (
      <>
        {orderLineName(line)}
        {line.variant ? (
          <span className="text-xs text-muted-foreground">
            {' '}
            · {durationLabel(line.variant.duration)}
          </span>
        ) : null}
        {line.giftToUser ? (
          <span className="text-xs text-muted-foreground">
            {' '}
            · подарок {line.giftToUser.username}
          </span>
        ) : null}
      </>
    ),
  },
  { key: 'quantity', header: 'Кол-во', align: 'right', cell: (line) => line.quantity },
  { key: 'unit', header: 'Цена', align: 'right', cell: (line) => formatMoney(line.unitPrice) },
  { key: 'total', header: 'Сумма', align: 'right', cell: (line) => formatMoney(line.totalPrice) },
  {
    key: 'delivered',
    header: 'Выдано',
    hideOnMobile: true,
    cell: (line) => (line.isDelivered ? formatDateTime(line.deliveredAt) : 'Нет'),
  },
];

function OrderCard({ order }: { order: AdminOrderCard }) {
  const { can } = usePermissions();
  const [cancelOpen, setCancelOpen] = useState(false);
  const meta = ORDER_STATUS_META[order.status];
  const canCancel = order.status === 'PENDING' && can('orders.cancel');
  const hasDiscount = Number(order.discountAmount) > 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Заказ ${order.orderNumber}`}
        description={`Создан ${formatDateTime(order.createdAt)}`}
        breadcrumbs={[
          { label: 'Магазин' },
          { label: 'Заказы', href: '/admin/store/orders' },
          { label: order.orderNumber },
        ]}
        meta={<Badge tone={meta.tone}>{meta.label}</Badge>}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/admin/store/orders">
                <ArrowLeft />К списку
              </Link>
            </Button>
            {canCancel ? (
              <Button variant="destructive" onClick={() => setCancelOpen(true)}>
                <Ban />
                Отменить заказ
              </Button>
            ) : null}
            {/* Возврат скрыт флагом до 0.9 (деньги — зона владельца). */}
            {ORDER_REFUND_UI_ENABLED && order.status === 'COMPLETED' && can('orders.refund') ? (
              <Button variant="secondary" disabled>
                Вернуть средства
              </Button>
            ) : null}
          </>
        }
      />

      {order.status === 'PENDING' ? null : (
        <p className="text-sm text-muted-foreground" data-testid="order-not-cancellable">
          Отменить можно только заказ в статусе «Ожидает оплаты».
        </p>
      )}

      <PageSection title="Заказ">
        <DescriptionList className="rounded-xl bg-surface p-5 shadow-sm">
          <DescriptionItem term="Покупатель">
            {order.user
              ? `${order.user.username} · ${order.user.email}`
              : (order.guestMinecraftNick ?? '—')}
          </DescriptionItem>
          <DescriptionItem term="Подитог">{formatMoney(order.subtotal)}</DescriptionItem>
          <DescriptionItem term="Скидка">
            {hasDiscount ? formatMoney(order.discountAmount) : '—'}
          </DescriptionItem>
          <DescriptionItem term="Промокод">
            {order.promoCode ? (
              <span className="font-mono text-xs">{order.promoCode.code}</span>
            ) : (
              '—'
            )}
          </DescriptionItem>
          <DescriptionItem term="Итого">
            <strong>{formatMoney(order.total)}</strong>
          </DescriptionItem>
          {order.status === 'CANCELLED' || order.cancelReason ? (
            <>
              <DescriptionItem term="Отменён">{formatDateTime(order.cancelledAt)}</DescriptionItem>
              <DescriptionItem term="Причина" className="sm:col-span-2">
                {order.cancelReason ?? '—'}
              </DescriptionItem>
            </>
          ) : null}
        </DescriptionList>
      </PageSection>

      <PageSection
        title="Оплата"
        description="Сводка по итогам проверки платежа. Журнал событий вебхука не хранится."
      >
        <DescriptionList
          className="rounded-xl bg-surface p-5 shadow-sm"
          data-testid="order-payment"
        >
          <DescriptionItem term="Провайдер">
            {order.payment.provider ?? order.paymentMethod ?? '—'}
          </DescriptionItem>
          <DescriptionItem term="Оплачен">{order.payment.isPaid ? 'Да' : 'Нет'}</DescriptionItem>
          <DescriptionItem term="ID платежа" mono>
            {order.payment.paymentId ?? '—'}
          </DescriptionItem>
          <DescriptionItem term="Время оплаты">
            {formatDateTime(order.payment.paidAt)}
          </DescriptionItem>
          <DescriptionItem term="Вебхук проверен">
            {formatDateTime(order.payment.webhookVerifiedAt)}
          </DescriptionItem>
        </DescriptionList>
      </PageSection>

      <PageSection title="Позиции">
        <DataGrid
          columns={LINE_COLUMNS}
          rows={order.items}
          getRowId={(line) => line.id}
          emptyTitle="Позиций нет"
          caption="Позиции заказа: товар или набор, количество, цена, сумма, выдача"
        />
      </PageSection>

      {cancelOpen ? (
        <CancelOrderDialog
          orderId={order.id}
          orderNumber={order.orderNumber}
          open
          onOpenChange={setCancelOpen}
        />
      ) : null}
    </div>
  );
}

function OrderDetails() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id ?? '');
  const card = useAdminOrderCard(id);
  if (card.isPending) return <SkeletonRows rows={6} />;
  if (card.isError) return <ErrorState error={card.error} onRetry={() => card.refetch()} />;
  return <OrderCard order={card.data} />;
}

export default function AdminStoreOrderPage() {
  return (
    <PermissionGate requirement="orders.view">
      <OrderDetails />
    </PermissionGate>
  );
}
