import { CircleCheck, CircleX, Clock, Hand, Loader, TriangleAlert } from 'lucide-react';
import type { ReactElement } from 'react';
import { Badge } from '@/components/ui/badge';
import { DELIVERY_STATUS_META, type DeliveryTaskStatus } from '@/lib/admin/store-delivery';

const ICONS: Record<DeliveryTaskStatus, ReactElement> = {
  PENDING: <Clock aria-hidden />,
  IN_PROGRESS: <Loader aria-hidden />,
  RETRY_WAIT: <Clock aria-hidden />,
  DELIVERED: <CircleCheck aria-hidden />,
  FAILED: <CircleX aria-hidden />,
  NEEDS_ATTENTION: <TriangleAlert aria-hidden />,
  AWAITING_MANUAL: <Hand aria-hidden />,
  MANUAL_DONE: <CircleCheck aria-hidden />,
  CANCELLED: <CircleX aria-hidden />,
};

/// Статус задания выдачи: подпись + иконка + тон (не только цвет).
export function DeliveryStatusBadge({ status }: { status: DeliveryTaskStatus }) {
  const meta = DELIVERY_STATUS_META[status];
  return (
    <Badge tone={meta.tone} icon={ICONS[status]}>
      {meta.label}
    </Badge>
  );
}
