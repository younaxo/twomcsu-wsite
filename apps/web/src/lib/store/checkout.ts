import type { DecimalString } from '@twomc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { siteKeys } from '@/lib/site/hooks';
import { useAuthStore } from '@/lib/auth/store';
import { cartErrorMessage } from './cart';

/// Оформление и оплата (слой 0, подэтап 0.5). Формы ответов — как отдаёт API
/// (`GET /store/checkout-config`, `POST /store/orders`, `GET /store/orders/:orderNumber`).
/// Итог заказа — только серверный (ADR-0009): клиент ничего не считает. Платёжного
/// провайдера клиент не знает: есть только `paymentUrl` (у тестового провайдера null).

export interface CheckoutConfig {
  /// Текущая версия оферты: уходит в заказ как принятая покупателем.
  offerVersion: string;
  paymentAvailable: boolean;
  quickBuyEnabled: boolean;
}

export type OrderStatus =
  | 'PENDING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'REFUND_PENDING'
  | 'REFUND_FAILED';

/// Статус выдачи для покупателя (0.7, ADR-0184 п. 10): только три значения, без
/// внутренних деталей. `null`/отсутствует — заказ не завершён (или API старый).
export type DeliveryStatus = 'pending' | 'delivered' | 'failed';

export const DELIVERY_STATUS_TEXT: Record<DeliveryStatus, { label: string; description: string }> =
  {
    pending: {
      label: 'Ожидает выдачи',
      description: 'Покупка ожидает выдачи. Обновите страницу позже, чтобы увидеть результат.',
    },
    delivered: {
      label: 'Выдано',
      description: 'Покупка выдана.',
    },
    failed: {
      label: 'Ошибка выдачи',
      description: 'Выдача не удалась. Обратитесь в поддержку, указав номер заказа.',
    },
  };

/// Безопасное чтение статуса выдачи из ответа API: неизвестное значение — «нет статуса».
export function readDeliveryStatus(value: unknown): DeliveryStatus | null {
  return value === 'pending' || value === 'delivered' || value === 'failed' ? value : null;
}

export interface OrderItemView {
  id: string;
  deliveryStatus?: DeliveryStatus | null;
  quantity: number;
  unitPrice: DecimalString;
  totalPrice: DecimalString;
  product?: { name: string } | null;
  variant?: { name?: string | null } | null;
  bundle?: { name: string } | null;
  giftToUser?: { username: string } | null;
}

export interface OrderView {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  deliveryStatus?: DeliveryStatus | null;
  subtotal: DecimalString;
  discountAmount: DecimalString;
  total: DecimalString;
  createdAt?: string;
  paidAt?: string | null;
  items: OrderItemView[];
}

export interface CreateOrderResult {
  order: OrderView;
  /// Адрес оплаты у провайдера; null — оплата без перехода (тестовый провайдер).
  paymentUrl: string | null;
}

/// Документ, на который ссылается чекбокс согласия. Отдельной страницы «Оферта»
/// пока нет: используется пользовательское соглашение (см. отчёт 0.5).
export const OFFER_DOC_HREF = '/legal/terms';
export const REFUNDS_DOC_HREF = '/legal/refunds';

export const ORDER_POLL_INTERVAL_MS = 3000;
/// Потолок автоопроса PENDING: после него статус обновляется кнопкой.
export const ORDER_POLL_MAX_MS = 10 * 60_000;
export const ORDER_POLL_MAX_BACKOFF_MS = 30_000;

export function orderHref(orderNumber: string): string {
  return `/shop/orders/${encodeURIComponent(orderNumber)}`;
}

/// Переходить можно только на https-адрес оплаты (http допустим лишь для localhost,
/// тестовый провайдер в разработке): любую другую схему (javascript:, data:) и
/// небезопасный http отбрасываем, остаёмся на странице заказа.
export function safePaymentUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') return parsed.toString();
    const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    return parsed.protocol === 'http:' && local ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export const checkoutKeys = {
  config: ['store', 'checkout-config'] as const,
  order: (orderNumber: string) => ['store', 'order', orderNumber] as const,
  list: (page: number, limit: number) => ['store', 'orders', page, limit] as const,
};

export function useCheckoutConfig(enabled = true) {
  return useQuery({
    queryKey: checkoutKeys.config,
    queryFn: () => api.get<CheckoutConfig>('/store/checkout-config', { auth: false }),
    enabled,
    retry: false,
    staleTime: 30_000,
  });
}

export function useCreateOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { offerVersion: string; targetMinecraftNick?: string }) =>
      api.post<CreateOrderResult>('/store/orders', input),
    onSuccess: (result) => {
      client.setQueryData(checkoutKeys.order(result.order.orderNumber), result.order);
      // Список «Мои заказы» устарел: новый заказ должен появиться без ожидания staleTime.
      void client.invalidateQueries({ queryKey: ['store', 'orders'] });
      // Сервер очистил корзину: перечитываем, а не показываем устаревшую.
      void client.invalidateQueries({ queryKey: siteKeys.cart });
    },
  });
}

/// Статус заказа с опросом, пока он PENDING. Опрос прекращается на финальном
/// статусе, при ответе 4xx (заказ не найден/чужой) и при размонтировании страницы
/// (react-query снимает таймер вместе с подпиской).
///
/// Пауза растёт при подряд идущих сбоях (5xx/сеть): 3 с -> 6 с -> 12 с ... до 30 с.
/// Опрос идёт не дольше ORDER_POLL_MAX_MS, затем `pollExpired`: страница предлагает
/// обновить статус вручную (`resumePolling` запускает опрос заново).
export function orderPollDelay(failures: number): number {
  return Math.min(ORDER_POLL_INTERVAL_MS * 2 ** Math.max(failures, 0), ORDER_POLL_MAX_BACKOFF_MS);
}

export function useOrder(orderNumber: string) {
  const authenticated = useAuthStore((state) => state.status === 'authenticated');
  const [pollExpired, setPollExpired] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const query = useQuery({
    queryKey: checkoutKeys.order(orderNumber),
    queryFn: () => api.get<OrderView>(`/store/orders/${encodeURIComponent(orderNumber)}`),
    enabled: authenticated && orderNumber !== '',
    retry: false,
    refetchInterval: (q) => {
      const error = q.state.error;
      if (error instanceof ApiError && error.status < 500) return false;
      if (pollExpired || q.state.data?.status !== 'PENDING') return false;
      return orderPollDelay(error ? q.state.fetchFailureCount : 0);
    },
  });

  const pending = query.data?.status === 'PENDING';
  useEffect(() => {
    if (!pending) return undefined;
    const timer = setTimeout(() => setPollExpired(true), ORDER_POLL_MAX_MS);
    return () => clearTimeout(timer);
  }, [pending, epoch]);

  const resumePolling = () => {
    setPollExpired(false);
    setEpoch((value) => value + 1);
    void query.refetch();
  };
  return { query, pollExpired: pollExpired && pending, resumePolling };
}

/// Список своих заказов (`GET /store/orders?page&limit`): новые сверху, только заказы
/// текущего пользователя (фильтрует сервер).
export interface OrdersPageView {
  items: OrderView[];
  total: number;
  page: number;
  limit: number;
}

export const ORDERS_PAGE_SIZE = 20;

export function useMyOrders(page: number, limit = ORDERS_PAGE_SIZE, enabled = true) {
  const authenticated = useAuthStore((state) => state.status === 'authenticated');
  return useQuery({
    queryKey: checkoutKeys.list(page, limit),
    queryFn: () => api.get<OrdersPageView>(`/store/orders?page=${page}&limit=${limit}`),
    enabled: authenticated && enabled,
    retry: false,
    placeholderData: (previous) => previous,
  });
}

export const ORDER_STATUS_TEXT: Record<OrderStatus, { label: string; description: string }> = {
  PENDING: {
    label: 'Ожидает оплаты',
    description: 'Ждём подтверждение оплаты. Страница обновится сама, перезагружать её не нужно.',
  },
  COMPLETED: {
    label: 'Оплачен',
    description: 'Оплата подтверждена, заказ завершён.',
  },
  FAILED: {
    label: 'Оплата не прошла',
    description:
      'Если средства были списаны, обратитесь в поддержку. Заказ можно оформить заново из корзины.',
  },
  CANCELLED: {
    label: 'Отменён',
    description: 'Заказ отменён.',
  },
  REFUNDED: {
    label: 'Возвращён',
    description: 'Средства по заказу возвращены.',
  },
  REFUND_PENDING: {
    label: 'Возврат обрабатывается',
    description: 'Возврат средств запущен, обычно он занимает немного времени.',
  },
  REFUND_FAILED: {
    label: 'Возврат не удался',
    description: 'Возврат не прошёл. Напишите в поддержку, мы разберёмся.',
  },
};

const UNKNOWN_ORDER_STATUS_TEXT = {
  label: 'Статус уточняется',
  description: 'Если статус не меняется, обратитесь в поддержку.',
};

/// Текст статуса с запасным вариантом: новый статус сервера не ломает страницу.
export function orderStatusText(status: string): { label: string; description: string } {
  return Object.hasOwn(ORDER_STATUS_TEXT, status)
    ? ORDER_STATUS_TEXT[status as OrderStatus]
    : UNKNOWN_ORDER_STATUS_TEXT;
}

export type CheckoutField = 'nick' | 'offer' | null;

export interface CheckoutErrorInfo {
  message: string;
  /// Поле, к которому относится ошибка (фокус и aria-invalid).
  field: CheckoutField;
  /// Оплата недоступна на стороне сервера (503): блокирует кнопку.
  paymentUnavailable: boolean;
  /// Версия оферты устарела: нужно перечитать конфигурацию и принять заново.
  offerOutdated: boolean;
}

/// Тексты по кодам оформления (nick_unavailable единый: причина не раскрывается).
export function describeCheckoutError(error: unknown): CheckoutErrorInfo {
  const base: CheckoutErrorInfo = {
    message: '',
    field: null,
    paymentUnavailable: false,
    offerOutdated: false,
  };
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'offer_not_accepted':
        return { ...base, field: 'offer', message: 'Подтвердите согласие с офертой.' };
      case 'offer_version_mismatch':
        return {
          ...base,
          field: 'offer',
          offerOutdated: true,
          message:
            'Оферта обновилась. Ознакомьтесь с новой версией и подтвердите согласие ещё раз.',
        };
      case 'nick_required':
        return {
          ...base,
          field: 'nick',
          message: 'Укажите ник получателя: к вашему аккаунту не привязан ник Minecraft.',
        };
      case 'nick_unavailable':
        return {
          ...base,
          field: 'nick',
          message: 'Заказ на этот ник оформить нельзя. Проверьте написание или укажите другой ник.',
        };
      case 'payment_unavailable':
        return {
          ...base,
          paymentUnavailable: true,
          message:
            'Оплата временно недоступна. Заказ не создан, деньги не списаны. Попробуйте позже.',
        };
      case 'quick_buy_disabled':
        return {
          ...base,
          message: 'Покупка без входа сейчас недоступна. Войдите в аккаунт.',
        };
    }
    if (error.status === 503) {
      return {
        ...base,
        paymentUnavailable: true,
        message:
          'Оплата временно недоступна. Заказ не создан, деньги не списаны. Попробуйте позже.',
      };
    }
  }
  return { ...base, message: cartErrorMessage(error, 'Не удалось оформить заказ.') };
}
