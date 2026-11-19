'use client';

import Link from 'next/link';
import { PageSection } from '@/components/admin/page-header';
import { ErrorState } from '@/components/ui/error-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import {
  deliveryTaskHref,
  deliveryTaskTitle,
  executorLabel,
  tasksOfOrder,
  useOrderDeliveryTasks,
} from '@/lib/admin/store-delivery';
import { DeliveryStatusBadge } from '../../delivery/_components/delivery-status-badge';

/// Статус выдачи позиций в карточке заказа (0.7). Данные — из очереди выдачи
/// (`GET /admin/delivery/tasks?orderNumber=`), поэтому блок показывается только
/// при праве `store.delivery.view` (решает родитель). Позиция может иметь
/// несколько заданий (шагов).
export function OrderDeliveryPanel({ orderNumber }: { orderNumber: string }) {
  const query = useOrderDeliveryTasks(orderNumber, true);
  return (
    <PageSection title="Выдача" description="Статус выдачи купленного по позициям заказа.">
      {query.isPending ? (
        <SkeletonRows rows={2} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <DeliveryList tasks={tasksOfOrder(query.data, orderNumber)} />
      )}
    </PageSection>
  );
}

function DeliveryList({ tasks }: { tasks: ReturnType<typeof tasksOfOrder> }) {
  if (tasks.length === 0) {
    return (
      <p
        className="rounded-xl bg-surface p-5 text-sm text-muted-foreground shadow-sm"
        data-testid="order-delivery-empty"
      >
        Заданий выдачи нет: заказ ещё не оплачен или выдача не создавалась.
      </p>
    );
  }
  return (
    <ul
      aria-label="Задания выдачи заказа"
      className="flex flex-col gap-2 rounded-xl bg-surface p-4 shadow-sm"
      data-testid="order-delivery"
    >
      {tasks.map((task) => (
        <li key={task.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="min-w-0 flex-1">
            {deliveryTaskTitle(task)}
            <span className="text-xs text-muted-foreground">
              {' '}
              · {executorLabel(task.executor)}
              {task.nick ? ` · ${task.nick}` : ''}
            </span>
          </span>
          <DeliveryStatusBadge status={task.status} />
          <Link
            href={deliveryTaskHref(task.id)}
            className="text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            Открыть задание
          </Link>
        </li>
      ))}
    </ul>
  );
}
