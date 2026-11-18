'use client';

import { ArrowLeft, CircleCheck, RotateCcw } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import {
  canMarkManualDone,
  canRetryDelivery,
  deliveryTaskTitle,
  executorLabel,
  useDeliveryTask,
  type DeliveryTaskCard,
} from '@/lib/admin/store-delivery';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDateTime } from '@/lib/format';
import { DeliveryStatusBadge } from '../_components/delivery-status-badge';
import { ManualDoneDialog } from '../_components/manual-done-dialog';
import { RetryDialog } from '../_components/retry-dialog';

/// Карточка задания выдачи (слой 0, 0.7). Просмотр — `store.delivery.view`,
/// «Отметить выданным» (причина обязательна) и «Повторить» (с подтверждением) —
/// `store.delivery.manage`. Текст ошибки исполнителя очищен на сервере и виден
/// только персоналу.

function TaskCard({ task }: { task: DeliveryTaskCard }) {
  const { can } = usePermissions();
  const [doneOpen, setDoneOpen] = useState(false);
  const [retryOpen, setRetryOpen] = useState(false);
  const manage = can('store.delivery.manage');
  const showDone = manage && canMarkManualDone(task.status);
  const showRetry = manage && canRetryDelivery(task.status);
  const orderNumber = task.orderItem.order.orderNumber;
  const dialogTitle = `${deliveryTaskTitle(task)}, заказ ${orderNumber}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Выдача по заказу ${orderNumber}`}
        description={deliveryTaskTitle(task)}
        breadcrumbs={[
          { label: 'Магазин' },
          { label: 'Выдача', href: '/admin/store/delivery' },
          { label: orderNumber },
        ]}
        meta={<DeliveryStatusBadge status={task.status} />}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/admin/store/delivery">
                <ArrowLeft />К очереди
              </Link>
            </Button>
            {showRetry ? (
              <Button variant="secondary" onClick={() => setRetryOpen(true)}>
                <RotateCcw />
                Повторить
              </Button>
            ) : null}
            {showDone ? (
              <Button onClick={() => setDoneOpen(true)}>
                <CircleCheck />
                Отметить выданным
              </Button>
            ) : null}
          </>
        }
      />

      <PageSection title="Задание">
        <DescriptionList className="rounded-xl bg-surface p-5 shadow-sm" data-testid="task-summary">
          <DescriptionItem term="Заказ">
            <Link
              href={`/admin/store/orders/${encodeURIComponent(orderNumber)}`}
              className="font-mono text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              {orderNumber}
            </Link>
          </DescriptionItem>
          <DescriptionItem term="Позиция">{deliveryTaskTitle(task)}</DescriptionItem>
          <DescriptionItem term="Ник получателя">{task.nick ?? '—'}</DescriptionItem>
          <DescriptionItem term="Исполнитель">{executorLabel(task.executor)}</DescriptionItem>
          <DescriptionItem term="Шаг">{task.step}</DescriptionItem>
          <DescriptionItem term="Попыток">{task.attempts}</DescriptionItem>
          <DescriptionItem term="Следующая попытка">
            {formatDateTime(task.nextAttemptAt)}
          </DescriptionItem>
          <DescriptionItem term="Выдано">{formatDateTime(task.deliveredAt)}</DescriptionItem>
          <DescriptionItem term="Создано">{formatDateTime(task.createdAt)}</DescriptionItem>
          <DescriptionItem term="Обновлено">{formatDateTime(task.updatedAt)}</DescriptionItem>
          <DescriptionItem term="Команда" className="sm:col-span-2" mono>
            {task.renderedCommand ?? '—'}
          </DescriptionItem>
          <DescriptionItem term="Последняя ошибка" className="sm:col-span-2">
            {task.lastError ?? '—'}
          </DescriptionItem>
        </DescriptionList>
      </PageSection>

      {manage ? null : (
        <p className="text-sm text-muted-foreground" data-testid="delivery-readonly">
          Действия с заданием доступны при праве «store.delivery.manage».
        </p>
      )}

      {doneOpen ? (
        <ManualDoneDialog taskId={task.id} title={dialogTitle} open onOpenChange={setDoneOpen} />
      ) : null}
      {retryOpen ? (
        <RetryDialog taskId={task.id} title={dialogTitle} open onOpenChange={setRetryOpen} />
      ) : null}
    </div>
  );
}

function TaskDetails() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id ?? '');
  const card = useDeliveryTask(id);
  if (card.isPending) return <SkeletonRows rows={6} />;
  if (card.isError) return <ErrorState error={card.error} onRetry={() => card.refetch()} />;
  return <TaskCard task={card.data} />;
}

export default function AdminStoreDeliveryTaskPage() {
  return (
    <PermissionGate requirement="store.delivery.view">
      <TaskDetails />
    </PermissionGate>
  );
}
