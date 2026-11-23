import { DeliveryTaskStatus } from '@prisma/client';
import {
  BuyerDeliveryStatus,
  buyerDeliveryStatus,
} from '../delivery/delivery-status';

/// Страница заказа без входа (0.12a): только то, что нужно показать гостю.
/// Без внутренних id, userId, платёжных полей, paymentUrl, хеша токена, IP и
/// контактов (Q31). Белый список, а не удаление лишнего: новые поля заказа
/// наружу не попадают по умолчанию.
export interface GuestOrderView {
  orderNumber: string;
  status: string;
  guestMinecraftNick: string | null;
  subtotal: unknown;
  discountAmount: unknown;
  total: unknown;
  createdAt: Date;
  paidAt: Date | null;
  deliveryStatus: BuyerDeliveryStatus | null;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: unknown;
    totalPrice: unknown;
    deliveryStatus: BuyerDeliveryStatus | null;
  }>;
}

interface GuestOrderSource {
  orderNumber: string;
  status: string;
  guestMinecraftNick: string | null;
  subtotal: unknown;
  discountAmount: unknown;
  total: unknown;
  createdAt: Date;
  paidAt: Date | null;
  items: Array<{
    quantity: number;
    unitPrice: unknown;
    totalPrice: unknown;
    product?: { name: string } | null;
    bundle?: { name: string } | null;
    deliveryTasks?: Array<{ status: DeliveryTaskStatus }>;
  }>;
}

export function toGuestOrderView(order: GuestOrderSource): GuestOrderView {
  const completed = order.status === 'COMPLETED';
  const all: Array<DeliveryTaskStatus> = [];
  const items = order.items.map((item) => {
    const statuses = (item.deliveryTasks ?? []).map((t) => t.status);
    all.push(...statuses);
    return {
      name: item.product?.name ?? item.bundle?.name ?? 'Товар',
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      deliveryStatus: completed ? buyerDeliveryStatus(statuses) : null,
    };
  });
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    guestMinecraftNick: order.guestMinecraftNick,
    subtotal: order.subtotal,
    discountAmount: order.discountAmount,
    total: order.total,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    deliveryStatus: completed ? buyerDeliveryStatus(all) : null,
    items,
  };
}
