'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { FormErrorSummary, FormField, useFocusFirstInvalid } from '@/components/admin/form-field';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { Button } from '@/components/ui/button';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { Input, inputClassName } from '@/components/ui/input';
import {
  DELIVERY_EXECUTORS,
  DELIVERY_NICK_MAX,
  DELIVERY_ORDER_NUMBER_MAX,
  DELIVERY_PAGE_SIZE,
  DELIVERY_STATUS_META,
  DELIVERY_TASK_STATUSES,
  EMPTY_DELIVERY_FILTERS,
  buildDeliveryQuery,
  deliveryTaskHref,
  deliveryTaskTitle,
  executorLabel,
  useDeliveryTasks,
  validateDeliveryFilters,
  type DeliveryFilters,
  type DeliveryTaskRow,
} from '@/lib/admin/store-delivery';
import { formatDateTime } from '@/lib/format';
import { DeliveryStatusBadge } from './_components/delivery-status-badge';

/// Очередь выдачи купленного (слой 0, 0.7): фильтры по статусу, исполнителю,
/// номеру заказа и нику, пагинация, переход в карточку задания. Право
/// `store.delivery.view`; действия (отметка, повтор) — в карточке, по
/// `store.delivery.manage`.

function DeliveryQueue() {
  const router = useRouter();
  const [draft, setDraft] = useState<DeliveryFilters>(EMPTY_DELIVERY_FILTERS);
  const [applied, setApplied] = useState<DeliveryFilters>(EMPTY_DELIVERY_FILTERS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DELIVERY_PAGE_SIZE);
  const { containerRef, focusFirstInvalid } = useFocusFirstInvalid<HTMLFormElement>();

  const tasks = useDeliveryTasks(buildDeliveryQuery(applied, page, limit));
  const set = (patch: Partial<DeliveryFilters>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const apply = (event: FormEvent) => {
    event.preventDefault();
    const next = validateDeliveryFilters(draft);
    setErrors(next);
    if (Object.keys(next).length > 0) {
      focusFirstInvalid();
      return;
    }
    setApplied(draft);
    setPage(1);
  };

  const reset = () => {
    setDraft(EMPTY_DELIVERY_FILTERS);
    setApplied(EMPTY_DELIVERY_FILTERS);
    setErrors({});
    setPage(1);
  };

  const columns: DataGridColumn<DeliveryTaskRow>[] = [
    {
      key: 'order',
      header: 'Заказ',
      cell: (t) => (
        <Link
          href={deliveryTaskHref(t.id)}
          className="font-mono text-xs font-medium text-primary underline-offset-2 hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {t.orderItem.order.orderNumber}
        </Link>
      ),
    },
    { key: 'item', header: 'Позиция', cell: (t) => deliveryTaskTitle(t) },
    { key: 'nick', header: 'Ник', cell: (t) => t.nick ?? '—' },
    { key: 'executor', header: 'Исполнитель', cell: (t) => executorLabel(t.executor) },
    { key: 'status', header: 'Статус', cell: (t) => <DeliveryStatusBadge status={t.status} /> },
    {
      key: 'attempts',
      header: 'Попыток',
      align: 'right',
      hideOnMobile: true,
      cell: (t) => t.attempts,
    },
    {
      key: 'created',
      header: 'Создано',
      hideOnMobile: true,
      cell: (t) => formatDateTime(t.createdAt),
    },
  ];

  const errorCount = Object.keys(errors).length;

  return (
    <div className="flex flex-col gap-4">
      <form
        ref={containerRef}
        role="search"
        aria-label="Фильтры очереди выдачи"
        onSubmit={apply}
        noValidate
        className="flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-sm"
      >
        {errorCount > 0 ? (
          <FormErrorSummary data-testid="delivery-filter-error">
            Исправьте ошибки в фильтрах ({errorCount}). Первое поле с ошибкой выделено.
          </FormErrorSummary>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FormField label="Статус">
            <select
              className={inputClassName}
              value={draft.status}
              onChange={(e) => set({ status: e.target.value as DeliveryFilters['status'] })}
            >
              <option value="">Все статусы</option>
              {DELIVERY_TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {DELIVERY_STATUS_META[s].label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Исполнитель">
            <select
              className={inputClassName}
              value={draft.executor}
              onChange={(e) => set({ executor: e.target.value })}
            >
              <option value="">Все исполнители</option>
              {DELIVERY_EXECUTORS.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Номер заказа" error={errors.orderNumber}>
            <Input
              leading={<Search />}
              placeholder="O-20261118-…"
              spellCheck={false}
              maxLength={DELIVERY_ORDER_NUMBER_MAX}
              value={draft.orderNumber}
              onChange={(e) => set({ orderNumber: e.target.value })}
            />
          </FormField>
          <FormField label="Ник получателя" error={errors.nick}>
            <Input
              placeholder="Ник в Minecraft"
              spellCheck={false}
              maxLength={DELIVERY_NICK_MAX}
              value={draft.nick}
              onChange={(e) => set({ nick: e.target.value })}
            />
          </FormField>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit">Применить</Button>
          <Button type="button" variant="ghost" onClick={reset}>
            Сбросить
          </Button>
        </div>
      </form>
      <DataGrid
        columns={columns}
        rows={tasks.data?.items ?? []}
        getRowId={(t) => t.id}
        loading={tasks.isPending}
        error={tasks.isError ? tasks.error : undefined}
        onRetry={() => tasks.refetch()}
        onRowClick={(t) => router.push(deliveryTaskHref(t.id))}
        pagination={{
          page,
          limit,
          total: tasks.data?.total ?? 0,
          onPageChange: setPage,
          onLimitChange: (n) => {
            setLimit(n);
            setPage(1);
          },
        }}
        emptyTitle="Заданий выдачи нет"
        emptyDescription="Измените фильтры или сбросьте их."
        caption="Очередь выдачи: заказ, позиция, ник, исполнитель, статус, число попыток, дата создания"
      />
    </div>
  );
}

export default function AdminStoreDeliveryPage() {
  return (
    <PermissionGate requirement="store.delivery.view">
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Выдача купленного"
          description="Очередь заданий выдачи: статусы, ручная отметка и повтор."
          breadcrumbs={[{ label: 'Магазин' }, { label: 'Выдача' }]}
        />
        <DeliveryQueue />
      </div>
    </PermissionGate>
  );
}
