import { CircleCheck, CircleX, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ORDER_STATUS_TEXT, type OrderStatus } from '@/lib/store/checkout';

/// Тон и иконка статуса оплаты заказа: один источник для карточки заказа и списка.
export const ORDER_STATUS_VIEW: Record<
  OrderStatus,
  { tone: 'warning' | 'success' | 'destructive' | 'neutral'; Icon: typeof Clock }
> = {
  PENDING: { tone: 'warning', Icon: Clock },
  COMPLETED: { tone: 'success', Icon: CircleCheck },
  FAILED: { tone: 'destructive', Icon: CircleX },
  CANCELLED: { tone: 'neutral', Icon: CircleX },
  REFUNDED: { tone: 'neutral', Icon: CircleCheck },
};

/// Статус не только цветом: подпись и иконка.
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { tone, Icon } = ORDER_STATUS_VIEW[status];
  return (
    <Badge tone={tone} icon={<Icon aria-hidden className="size-3.5" />}>
      {ORDER_STATUS_TEXT[status].label}
    </Badge>
  );
}
