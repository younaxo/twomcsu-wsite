'use client';

import type { DecimalString, IsoDateString, OrderStatus } from '@twomc/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';

/// Админка магазина, слой 0 / подэтап 0.4: заказы.
/// Контракт — orders-admin.controller.ts (ветка feature/l0-04-admin-orders-api):
/// GET /admin/orders, GET /admin/orders/:id (id или номер), PATCH
/// /admin/orders/:id/cancel. Суммы приходят Decimal-строками; на клиенте они
/// только отображаются, расчёт цены не выполняется.

/// Возврат средств скрыт флагом до подэтапа 0.9: деньги — зона владельца.
/// Пока false, кнопка «Вернуть» нигде не рендерится (ни в списке, ни в карточке).
export const ORDER_REFUND_UI_ENABLED = false as boolean;

export const ADMIN_ORDERS_PAGE_SIZE = 25;
/// Лимит строк экспорта на стороне API (export.service.ts, MAX_ROWS).
export const ORDERS_EXPORT_MAX_ROWS = 10_000;
export const CANCEL_REASON_MAX = 1000;

export const ORDER_STATUS_META: Record<
  OrderStatus,
  { label: string; tone: 'neutral' | 'success' | 'warning' | 'destructive' | 'info' }
> = {
  PENDING: { label: 'Ожидает оплаты', tone: 'warning' },
  COMPLETED: { label: 'Оплачен', tone: 'success' },
  FAILED: { label: 'Ошибка', tone: 'destructive' },
  CANCELLED: { label: 'Отменён', tone: 'neutral' },
  REFUNDED: { label: 'Возврат', tone: 'info' },
  REFUND_PENDING: { label: 'Возврат обрабатывается', tone: 'warning' },
  REFUND_FAILED: { label: 'Возврат не удался', tone: 'destructive' },
};

export interface AdminOrderUser {
  id: string;
  username: string;
  email: string;
}

export interface AdminOrderLine {
  id: string;
  orderId: string;
  productId: string | null;
  variantId: string | null;
  bundleId: string | null;
  quantity: number;
  unitPrice: DecimalString;
  totalPrice: DecimalString;
  giftToUserId: string | null;
  giftMessage: string | null;
  isDelivered: boolean;
  deliveredAt: IsoDateString | null;
  product: { id: string; name: string; slug: string; type: string } | null;
  variant: { id: string; duration: string; price: DecimalString } | null;
  bundle: { id: string; name: string; slug: string } | null;
  giftToUser: { id: string; username: string } | null;
}

export interface AdminOrderRow {
  id: string;
  orderNumber: string;
  userId: string | null;
  guestMinecraftNick: string | null;
  status: OrderStatus;
  subtotal: DecimalString;
  discountAmount: DecimalString;
  promoCodeId: string | null;
  total: DecimalString;
  paymentMethod: string | null;
  paymentId: string | null;
  paymentProvider: string | null;
  paymentWebhookVerifiedAt: IsoDateString | null;
  paidAt: IsoDateString | null;
  cancelledAt: IsoDateString | null;
  refundedAt: IsoDateString | null;
  cancelReason: string | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
  items: AdminOrderLine[];
  user: AdminOrderUser | null;
}

/// Сводка оплаты. Журнала событий вебхука в БД нет (API-отчёт 0.4):
/// хранится только итог проверки.
export interface AdminOrderPayment {
  provider: string | null;
  paymentId: string | null;
  isPaid: boolean;
  paidAt: IsoDateString | null;
  webhookVerifiedAt: IsoDateString | null;
}

export interface AdminOrderCard extends AdminOrderRow {
  promoCode: {
    id: string;
    code: string;
    discountType: 'PERCENT' | 'FIXED' | 'BONUS';
    discountValue: DecimalString;
  } | null;
  payment: AdminOrderPayment;
}

export interface AdminOrdersPage {
  items: AdminOrderRow[];
  total: number;
  page: number;
  limit: number;
}

/// Значения фильтров, как их вводит человек (строки; пустая строка = не задано).
export interface OrderFilters {
  status: '' | OrderStatus;
  nickname: string;
  orderNumber: string;
  /// YYYY-MM-DD.
  dateFrom: string;
  dateTo: string;
}

export const EMPTY_ORDER_FILTERS: OrderFilters = {
  status: '',
  nickname: '',
  orderNumber: '',
  dateFrom: '',
  dateTo: '',
};

/// Проверка фильтров до запроса: те же ограничения, что в API (nickname ≤ 32,
/// orderNumber ≤ 40, dateFrom ≤ dateTo). Возвращает ошибки по полям.
export function validateOrderFilters(filters: OrderFilters): Record<string, string> {
  const errors: Record<string, string> = {};
  if (filters.nickname.trim().length > 32) errors.nickname = 'Не длиннее 32 символов';
  if (filters.orderNumber.trim().length > 40) errors.orderNumber = 'Не длиннее 40 символов';
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
    errors.dateTo = 'Конечная дата не может быть раньше начальной';
  }
  return errors;
}

/// Параметры запроса списка: пустые значения не отправляются. Дата без времени
/// (`YYYY-MM-DD`) допустима для обеих границ: API считает dateTo концом суток.
export function buildOrderQuery(filters: OrderFilters, page: number, limit: number) {
  const nickname = filters.nickname.trim();
  const orderNumber = filters.orderNumber.trim();
  return {
    page,
    limit,
    ...(filters.status ? { status: filters.status } : {}),
    ...(nickname ? { nickname } : {}),
    ...(orderNumber ? { orderNumber } : {}),
    ...(filters.dateFrom ? { dateFrom: filters.dateFrom } : {}),
    ...(filters.dateTo ? { dateTo: filters.dateTo } : {}),
  };
}

/// Тело экспорта: API (ExportOrdersDto) знает только status, userId, dateFrom и
/// dateTo — ник и номер в выгрузку не попадают (расхождение, см. отчёт 0.4 web).
export function buildOrderExportBody(filters: OrderFilters) {
  return {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.dateFrom ? { dateFrom: filters.dateFrom } : {}),
    ...(filters.dateTo ? { dateTo: filters.dateTo } : {}),
  };
}

export const adminOrderKeys = {
  all: ['admin', 'store', 'orders'] as const,
  list: (query: object) => ['admin', 'store', 'orders', 'list', query] as const,
  card: (id: string) => ['admin', 'store', 'orders', 'card', id] as const,
};

export function useAdminOrders(query: ReturnType<typeof buildOrderQuery>, enabled = true) {
  return useQuery({
    queryKey: adminOrderKeys.list(query),
    queryFn: () => api.get<AdminOrdersPage>('/admin/orders', { query }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useAdminOrderCard(idOrNumber: string) {
  return useQuery({
    queryKey: adminOrderKeys.card(idOrNumber),
    queryFn: () => api.get<AdminOrderCard>(`/admin/orders/${encodeURIComponent(idOrNumber)}`),
    enabled: idOrNumber.length > 0,
  });
}

export function useCancelOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.patch<AdminOrderRow>(`/admin/orders/${encodeURIComponent(id)}/cancel`, { reason }),
    // Карточка и список перечитываются и после 409: статус мог измениться (вебхук).
    onSettled: () => client.invalidateQueries({ queryKey: adminOrderKeys.all }),
  });
}

/// Причина отмены: обязательна, после trim 1–1000 символов (CancelOrderDto).
export function validateCancelReason(value: string): string | null {
  const reason = value.trim();
  if (!reason) return 'Укажите причину отмены';
  if (reason.length > CANCEL_REASON_MAX) return `Не длиннее ${CANCEL_REASON_MAX} символов`;
  return null;
}

export interface CancelErrorInfo {
  message: string;
  /// Заказ уже не PENDING (409): показывается понятная ошибка, окно закрывать
  /// не нужно — данные перечитываются.
  notCancellable: boolean;
  needsTwoFactor: boolean;
  /// Ошибка относится к полю причины.
  reasonError: string | null;
}

/// Понятные ошибки отмены. Для 409 ORDER_NOT_CANCELLABLE не показываем сырой
/// текст API («текущий статус: COMPLETED»): оплаченный заказ отменить нельзя,
/// возврат — отдельная операция владельца (0.9).
export function describeCancelError(error: unknown): CancelErrorInfo {
  const base: CancelErrorInfo = {
    message: error instanceof Error ? error.message : 'Неизвестная ошибка',
    notCancellable: false,
    needsTwoFactor: false,
    reasonError: null,
  };
  if (!(error instanceof ApiError)) return base;
  if (error.status === 409) {
    return {
      ...base,
      notCancellable: true,
      message:
        'Заказ нельзя отменить: он уже не в статусе «Ожидает оплаты» (например, оплачен или отменён). ' +
        'Отменяются только неоплаченные заказы. Данные заказа обновлены.',
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
    return { ...base, message: 'Недостаточно прав для отмены заказа.' };
  }
  if (error.status === 404) {
    return { ...base, message: 'Заказ не найден: возможно, он удалён.' };
  }
  if (error.status === 400 || error.status === 422) {
    const reason = error.messages.find((m) => /reason|причин/i.test(m)) ?? null;
    return { ...base, reasonError: reason, message: error.messages.join('. ') };
  }
  return { ...base, message: error.messages.join('. ') };
}

/// Название позиции для таблицы: товар, набор или прочерк.
export function orderLineName(line: AdminOrderLine): string {
  return line.product?.name ?? line.bundle?.name ?? '—';
}
