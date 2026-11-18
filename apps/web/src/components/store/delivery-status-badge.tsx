import { CircleCheck, Clock, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DELIVERY_STATUS_TEXT, readDeliveryStatus } from '@/lib/store/checkout';

const VIEW = {
  pending: { tone: 'warning', Icon: Clock },
  delivered: { tone: 'success', Icon: CircleCheck },
  failed: { tone: 'destructive', Icon: TriangleAlert },
} as const;

/// Статус выдачи для покупателя: подпись и иконка (не только цвет). Только
/// три публичных значения; внутренних деталей (ошибки, id заданий) нет.
/// Нет статуса (заказ не завершён) — ничего не рендерится.
export function DeliveryStatusBadge({ status }: { status: unknown }) {
  const value = readDeliveryStatus(status);
  if (!value) return null;
  const { tone, Icon } = VIEW[value];
  return (
    <Badge
      tone={tone}
      icon={<Icon aria-hidden className="size-3.5" />}
      data-testid="delivery-status"
    >
      {DELIVERY_STATUS_TEXT[value].label}
    </Badge>
  );
}
