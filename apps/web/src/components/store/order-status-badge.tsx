import { CircleCheck, CircleX, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { orderStatusText, type OrderStatus } from '@/lib/store/checkout';

type StatusView = {
  tone: 'warning' | 'success' | 'destructive' | 'neutral';
  Icon: typeof Clock;
};

/// Тон и иконка статуса оплаты заказа: один источник для карточки заказа и списка.
export const ORDER_STATUS_VIEW: Record<OrderStatus, StatusView> = {
  PENDING: { tone: 'warning', Icon: Clock },
  COMPLETED: { tone: 'success', Icon: CircleCheck },
  FAILED: { tone: 'destructive', Icon: CircleX },
  CANCELLED: { tone: 'neutral', Icon: CircleX },
  REFUNDED: { tone: 'neutral', Icon: CircleCheck },
  REFUND_PENDING: { tone: 'warning', Icon: Clock },
  REFUND_FAILED: { tone: 'destructive', Icon: CircleX },
};

const UNKNOWN_VIEW: StatusView = { tone: 'neutral', Icon: Clock };

/// Статус не только цветом: подпись и иконка. Неизвестный статус (новая
/// версия сервера) показывается нейтрально и не роняет страницу.
export function OrderStatusBadge({ status }: { status: OrderStatus | (string & {}) }) {
  const { tone, Icon } = Object.hasOwn(ORDER_STATUS_VIEW, status)
    ? ORDER_STATUS_VIEW[status as OrderStatus]
    : UNKNOWN_VIEW;
  return (
    <Badge tone={tone} icon={<Icon aria-hidden className="size-3.5" />}>
      {orderStatusText(status).label}
    </Badge>
  );
}
