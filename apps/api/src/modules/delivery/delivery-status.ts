import { DeliveryTaskStatus } from '@prisma/client';
import { DONE_STATUSES } from './delivery.constants';

/// Статус выдачи для покупателя: без внутренних деталей (ADR-0184 п. 10).
export type BuyerDeliveryStatus = 'pending' | 'delivered' | 'failed';

/// Агрегат по статусам заданий одной позиции или всего заказа. Отменённые
/// задания (возврат) не учитываются. Нет заданий — «ожидает».
export function buyerDeliveryStatus(
  statuses: readonly DeliveryTaskStatus[],
): BuyerDeliveryStatus {
  const active = statuses.filter((s) => s !== DeliveryTaskStatus.CANCELLED);
  if (active.length === 0) return 'pending';
  if (
    active.some(
      (s) =>
        s === DeliveryTaskStatus.FAILED ||
        s === DeliveryTaskStatus.NEEDS_ATTENTION,
    )
  ) {
    return 'failed';
  }
  if (active.every((s) => DONE_STATUSES.includes(s))) return 'delivered';
  return 'pending';
}

/// Очищенный текст ошибки: без токенов, ключей и длинных непрозрачных строк.
export function sanitizeDeliveryError(raw: unknown): string {
  const text =
    raw instanceof Error
      ? `${raw.name}: ${raw.message}`
      : typeof raw === 'string'
        ? raw
        : 'unknown_error';
  return text
    .replace(
      /(password|passwd|token|secret|key|authorization)\s*[=:]\s*\S+/gi,
      '$1=[скрыто]',
    )
    .replace(/[A-Za-z0-9+/=_-]{24,}/g, '[скрыто]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 300);
}
