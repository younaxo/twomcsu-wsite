'use client';

import type { IsoDateString } from '@twomc/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';

/// Админка магазина, слой 0 / подэтап 0.7: очередь выдачи купленного.
/// Контракт — delivery-admin.controller.ts (ветка feature/l0-07-delivery-api):
/// GET /admin/delivery/tasks (?page&limit&status&executor&orderNumber&nick),
/// GET /admin/delivery/tasks/:id, POST /admin/delivery/tasks/:id/manual-done
/// { reason } и POST /admin/delivery/tasks/:id/retry { confirmed, reason? }.
/// Права: `store.delivery.view` (чтение), `store.delivery.manage` (действия).

export const DELIVERY_PAGE_SIZE = 25;
export const DELIVERY_REASON_MAX = 1000;
export const DELIVERY_NICK_MAX = 16;
export const DELIVERY_ORDER_NUMBER_MAX = 40;

export const DELIVERY_TASK_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'RETRY_WAIT',
  'DELIVERED',
  'FAILED',
  'NEEDS_ATTENTION',
  'AWAITING_MANUAL',
  'MANUAL_DONE',
  'CANCELLED',
] as const;
export type DeliveryTaskStatus = (typeof DELIVERY_TASK_STATUSES)[number];

export type DeliveryTone = 'neutral' | 'success' | 'warning' | 'destructive' | 'info';

/// Подписи и тон статусов задания. Статус всегда читается и по тексту (не только цветом).
export const DELIVERY_STATUS_META: Record<
  DeliveryTaskStatus,
  { label: string; tone: DeliveryTone }
> = {
  PENDING: { label: 'В очереди', tone: 'warning' },
  IN_PROGRESS: { label: 'Выполняется', tone: 'info' },
  RETRY_WAIT: { label: 'Ждёт повтора', tone: 'warning' },
  DELIVERED: { label: 'Выдано', tone: 'success' },
  FAILED: { label: 'Ошибка', tone: 'destructive' },
  NEEDS_ATTENTION: { label: 'Нужно внимание', tone: 'destructive' },
  AWAITING_MANUAL: { label: 'Ждёт ручной выдачи', tone: 'warning' },
  MANUAL_DONE: { label: 'Выдано вручную', tone: 'success' },
  CANCELLED: { label: 'Отменено', tone: 'neutral' },
};

/// Исполнители заданий (набор расширяемый: неизвестный показывается как есть).
export const DELIVERY_EXECUTORS: { value: string; label: string }[] = [
  { value: 'manual', label: 'Вручную' },
  { value: 'site', label: 'На сайте' },
  { value: 'command', label: 'Команда на сервер' },
  { value: 'bridge', label: 'Плагин Bridge' },
];

export function executorLabel(executor: string): string {
  return DELIVERY_EXECUTORS.find((e) => e.value === executor)?.label ?? executor;
}

/// Из каких статусов доступна ручная отметка (зеркало MANUAL_DONE_FROM на API;
/// окончательное решение всё равно за сервером, 409 разбирается ниже).
export const MANUAL_DONE_FROM: readonly DeliveryTaskStatus[] = [
  'PENDING',
  'RETRY_WAIT',
  'AWAITING_MANUAL',
  'NEEDS_ATTENTION',
  'FAILED',
];
/// Из каких статусов возможен повтор (зеркало RETRY_FROM).
export const RETRY_FROM: readonly DeliveryTaskStatus[] = ['FAILED', 'NEEDS_ATTENTION'];

export const canMarkManualDone = (status: DeliveryTaskStatus) => MANUAL_DONE_FROM.includes(status);
export const canRetryDelivery = (status: DeliveryTaskStatus) => RETRY_FROM.includes(status);

/// Состояние задания в очереди Bridge (0.13, ADR-0194). Токена захвата и
/// команды в ответе нет: только статус и метки.
export const BRIDGE_JOB_STATUSES = [
  'QUEUED',
  'CLAIMED',
  'DONE',
  'FAILED',
  'UNKNOWN',
  'CANCELLED',
] as const;
export type BridgeJobStatus = (typeof BRIDGE_JOB_STATUSES)[number];

export const BRIDGE_JOB_META: Record<BridgeJobStatus, { label: string; hint: string }> = {
  QUEUED: { label: 'Ждёт сервер', hint: 'Сервер ещё не забрал команду.' },
  CLAIMED: { label: 'Передано серверу', hint: 'Сервер забрал команду, подтверждения пока нет.' },
  DONE: { label: 'Сервер выполнил', hint: 'Сервер подтвердил выполнение.' },
  FAILED: { label: 'Сервер отклонил', hint: 'Сервер сообщил, что выполнить нельзя.' },
  UNKNOWN: {
    label: 'Исход неизвестен',
    hint: 'Подтверждения нет или сервер не уверен. Команда могла выполниться.',
  },
  CANCELLED: { label: 'Не выполнялось', hint: 'Команда точно не выполнялась.' },
};

export function bridgeJobLabel(status: string): string {
  return BRIDGE_JOB_META[status as BridgeJobStatus]?.label ?? status;
}

export interface BridgeJobInfo {
  status: BridgeJobStatus;
  serverSlug: string;
  ackCode: string | null;
  claimCount: number;
  claimedAt: IsoDateString | null;
  ackedAt: IsoDateString | null;
  attempt: number;
}

/// Повтор способен выдать товар дважды, если задание Bridge уже передавалось
/// серверу (захвачено, исход неизвестен или не подтверждён).
export function bridgeRetryMayDuplicate(task: {
  executor: string;
  bridgeJob?: { status: string; claimCount: number } | null;
}): boolean {
  if (task.executor !== 'bridge') return false;
  const job = task.bridgeJob;
  if (!job) return false;
  return job.claimCount > 0 || job.status === 'UNKNOWN' || job.status === 'CLAIMED';
}

export interface DeliveryTaskOrderItem {
  id: string;
  quantity: number;
  order: { id: string; orderNumber: string; status: string };
  product: { id: string; name: string; type: string } | null;
}

export interface DeliveryTaskRow {
  id: string;
  orderItemId: string;
  step: number;
  executor: string;
  status: DeliveryTaskStatus;
  attempts: number;
  nextAttemptAt: IsoDateString | null;
  nick: string | null;
  /// Очищенный на сервере текст ошибки; показывается только персоналу.
  lastError: string | null;
  deliveredAt: IsoDateString | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
  /// Только у исполнителя `bridge`, когда задание уже ставилось в очередь.
  bridgeJob?: BridgeJobInfo | null;
  orderItem: DeliveryTaskOrderItem;
}

export interface DeliveryTaskCard extends DeliveryTaskRow {
  leaseUntil: IsoDateString | null;
  recipientUserId: string | null;
  renderedCommand: string | null;
  templateVersion: number | null;
}

export interface DeliveryTasksPage {
  items: DeliveryTaskRow[];
  total: number;
  page: number;
  limit: number;
}

/// Значения фильтров, как их вводит человек (пустая строка = не задано).
export interface DeliveryFilters {
  status: '' | DeliveryTaskStatus;
  executor: string;
  orderNumber: string;
  nick: string;
}

export const EMPTY_DELIVERY_FILTERS: DeliveryFilters = {
  status: '',
  executor: '',
  orderNumber: '',
  nick: '',
};

export function validateDeliveryFilters(filters: DeliveryFilters): Record<string, string> {
  const errors: Record<string, string> = {};
  if (filters.orderNumber.trim().length > DELIVERY_ORDER_NUMBER_MAX) {
    errors.orderNumber = `Не длиннее ${DELIVERY_ORDER_NUMBER_MAX} символов`;
  }
  if (filters.nick.trim().length > DELIVERY_NICK_MAX) {
    errors.nick = `Не длиннее ${DELIVERY_NICK_MAX} символов`;
  }
  return errors;
}

/// Параметры запроса: пустые значения не отправляются.
export function buildDeliveryQuery(filters: DeliveryFilters, page: number, limit: number) {
  const orderNumber = filters.orderNumber.trim();
  const nick = filters.nick.trim();
  return {
    page,
    limit,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.executor ? { executor: filters.executor } : {}),
    ...(orderNumber ? { orderNumber } : {}),
    ...(nick ? { nick } : {}),
  };
}

export const deliveryKeys = {
  all: ['admin', 'store', 'delivery'] as const,
  list: (query: object) => ['admin', 'store', 'delivery', 'list', query] as const,
  card: (id: string) => ['admin', 'store', 'delivery', 'card', id] as const,
  order: (orderNumber: string) => ['admin', 'store', 'delivery', 'order', orderNumber] as const,
};

export function useDeliveryTasks(query: ReturnType<typeof buildDeliveryQuery>) {
  return useQuery({
    queryKey: deliveryKeys.list(query),
    queryFn: () => api.get<DeliveryTasksPage>('/admin/delivery/tasks', { query }),
    placeholderData: keepPreviousData,
  });
}

export function useDeliveryTask(id: string) {
  return useQuery({
    queryKey: deliveryKeys.card(id),
    queryFn: () => api.get<DeliveryTaskCard>(`/admin/delivery/tasks/${encodeURIComponent(id)}`),
    enabled: id.length > 0,
  });
}

/// Задания одного заказа для карточки заказа. API ищет номер подстрокой, поэтому
/// результат дополнительно сужается до точного номера (`tasksOfOrder`).
export function useOrderDeliveryTasks(orderNumber: string, enabled: boolean) {
  return useQuery({
    queryKey: deliveryKeys.order(orderNumber),
    queryFn: () =>
      api.get<DeliveryTasksPage>('/admin/delivery/tasks', {
        query: { orderNumber, limit: 100, page: 1 },
      }),
    enabled: enabled && orderNumber.length > 0,
  });
}

export function tasksOfOrder(page: DeliveryTasksPage, orderNumber: string): DeliveryTaskRow[] {
  return page.items.filter((task) => task.orderItem.order.orderNumber === orderNumber);
}

export function deliveryTaskTitle(task: DeliveryTaskRow): string {
  const name = task.orderItem.product?.name ?? 'Товар';
  return `${name} × ${task.orderItem.quantity}`;
}

export function deliveryTaskHref(id: string): string {
  return `/admin/store/delivery/${encodeURIComponent(id)}`;
}

export function useMarkManualDone() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<DeliveryTaskCard>(`/admin/delivery/tasks/${encodeURIComponent(id)}/manual-done`, {
        reason,
      }),
    // Очередь перечитывается и после 409: статус мог измениться воркером.
    onSettled: () => client.invalidateQueries({ queryKey: deliveryKeys.all }),
  });
}

export function useRetryDelivery() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<DeliveryTaskCard>(`/admin/delivery/tasks/${encodeURIComponent(id)}/retry`, {
        confirmed: true,
        ...(reason ? { reason } : {}),
      }),
    onSettled: () => client.invalidateQueries({ queryKey: deliveryKeys.all }),
  });
}

/// Причина ручной отметки: обязательна, после trim 1–1000 символов (MarkManualDoneDto).
export function validateManualDoneReason(value: string): string | null {
  const reason = value.trim();
  if (!reason) return 'Укажите причину отметки';
  if (reason.length > DELIVERY_REASON_MAX) return `Не длиннее ${DELIVERY_REASON_MAX} символов`;
  return null;
}

/// Причина повтора необязательна, но не длиннее лимита.
export function validateRetryReason(value: string): string | null {
  return value.trim().length > DELIVERY_REASON_MAX
    ? `Не длиннее ${DELIVERY_REASON_MAX} символов`
    : null;
}

export interface DeliveryActionError {
  message: string;
  needsTwoFactor: boolean;
  reasonError: string | null;
  /// Статус задания изменился (409): окно можно закрыть, данные перечитаны.
  conflict: boolean;
}

/// Понятные ошибки действий: сырые коды и статусы API не показываются.
export function describeDeliveryError(error: unknown): DeliveryActionError {
  const base: DeliveryActionError = {
    message: error instanceof Error ? error.message : 'Неизвестная ошибка',
    needsTwoFactor: false,
    reasonError: null,
    conflict: false,
  };
  if (!(error instanceof ApiError)) return base;
  if (error.status === 409) {
    const running = error.code === 'delivery_in_progress';
    const notCompleted = error.code === 'delivery_order_not_completed';
    return {
      ...base,
      conflict: true,
      message: notCompleted
        ? 'Заказ не завершён — выдача недоступна.'
        : running
          ? 'Задание выполняется прямо сейчас. Дождитесь результата и повторите действие.'
          : 'Задание уже в другом статусе, это действие недоступно. Данные обновлены.',
    };
  }
  if (error.status === 403) {
    if (error.code === 'admin_2fa_required') {
      return {
        ...base,
        needsTwoFactor: true,
        message:
          'Для действий в админке нужна двухфакторная аутентификация. Включите её в настройках аккаунта.',
      };
    }
    return { ...base, message: 'Недостаточно прав для этого действия.' };
  }
  if (error.status === 404) {
    return { ...base, message: 'Задание не найдено: возможно, оно удалено.' };
  }
  if (error.status === 400 || error.status === 422) {
    const reason = error.messages.find((m) => /reason|причин/i.test(m)) ?? null;
    return { ...base, reasonError: reason, message: error.messages.join('. ') };
  }
  return { ...base, message: error.messages.join('. ') };
}
