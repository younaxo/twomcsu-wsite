import type { DecimalString } from '@twomc/shared';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import type { DeliveryStatus, OrderStatus } from './checkout';

/// Покупка без входа (слой 0, подэтап 0.12, ADR-0186, ADR-0190). Клиент не считает
/// суммы и не знает платёжного провайдера: всё приходит от сервера.
/// Токен гостевого заказа секретный: в URL query и в логи не попадает. Ссылка на заказ
/// несёт его во фрагменте (`#t=`), а запрос на сервер — POST с токеном в теле.

/// Как в ТЗ: латиница, цифры, подчёркивание, 3-16 символов.
export const NICK_PATTERN = /^[A-Za-z0-9_]{3,16}$/;

export function validateNick(value: string): string | null {
  const nick = value.trim();
  if (nick === '') return 'Укажите ник получателя в Minecraft.';
  if (!NICK_PATTERN.test(nick)) {
    return 'Ник: от 3 до 16 символов, только латинские буквы, цифры и подчёркивание.';
  }
  return null;
}

export interface QuickBuyInput {
  variantId: string;
  quantity: number;
  guestMinecraftNick: string;
  offerVersion: string;
}

export interface QuickBuyResult {
  order: { orderNumber: string; total: DecimalString; status: OrderStatus };
  paymentUrl: string | null;
  /// Возвращается ОДИН раз при оформлении; сервер хранит только хеш.
  guestAccessToken?: string;
}

export function useQuickBuy() {
  return useMutation({
    mutationFn: (input: QuickBuyInput) =>
      api.post<QuickBuyResult>('/store/quick-buy', input, { auth: false }),
  });
}

export const GUEST_ORDER_PATH = '/shop/order/guest';
export const GUEST_TOKEN_TTL_DAYS = 30;

/// Ссылка на гостевой заказ: токен во фрагменте, поэтому не попадает ни в логи
/// серверов и прокси, ни в заголовок Referer.
export function guestOrderLink(token: string, origin = ''): string {
  return `${origin}${GUEST_ORDER_PATH}#t=${encodeURIComponent(token)}`;
}

/// Токен из `location.hash` (`#t=...` или `#...`) либо из вставленной вручную ссылки/токена.
export function extractGuestToken(input: string): string {
  let text = input.trim();
  const hashAt = text.indexOf('#');
  if (hashAt >= 0) text = text.slice(hashAt + 1);
  if (text.startsWith('t=')) text = text.slice(2);
  try {
    return decodeURIComponent(text).trim();
  } catch {
    return text.trim();
  }
}

export type QuickBuyErrorKind =
  | 'nick'
  | 'login_required'
  | 'paid_removal_unavailable'
  | 'disabled'
  | 'rate_limited'
  | 'offer'
  | 'other';

export interface QuickBuyErrorInfo {
  kind: QuickBuyErrorKind;
  message: string;
}

/// Тексты по кодам quick-buy. Причина `nick_unavailable` не раскрывается (нет оракула ников).
export function describeQuickBuyError(error: unknown): QuickBuyErrorInfo {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return { kind: 'rate_limited', message: 'Слишком много попыток, попробуйте через минуту' };
    }
    switch (error.code) {
      case 'nick_unavailable':
        return { kind: 'nick', message: 'Покупка для этого ника недоступна' };
      case 'login_required':
        return { kind: 'login_required', message: 'Войдите, чтобы купить этот товар' };
      case 'paid_removal_unavailable':
        return {
          kind: 'paid_removal_unavailable',
          message: 'Снятие наказаний временно недоступно',
        };
      case 'quick_buy_disabled':
        return {
          kind: 'disabled',
          message: 'Покупка без входа сейчас недоступна. Войдите в аккаунт.',
        };
      case 'offer_not_accepted':
      case 'offer_version_mismatch':
        return {
          kind: 'offer',
          message: 'Оферта обновилась. Подтвердите согласие с актуальной версией и повторите.',
        };
      case 'payment_unavailable':
        return {
          kind: 'other',
          message: 'Оплата временно недоступна. Заказ не создан, деньги не списаны.',
        };
    }
    if (error.status >= 500) {
      return { kind: 'other', message: 'Сервер временно недоступен. Попробуйте позже.' };
    }
  }
  return { kind: 'other', message: 'Не удалось оформить заказ. Попробуйте ещё раз.' };
}

/// Ответ `POST /store/orders/guest/lookup`: только белый список guest-order-view.
export interface GuestOrderItem {
  name: string;
  quantity: number;
  unitPrice: DecimalString;
  totalPrice: DecimalString;
  deliveryStatus: DeliveryStatus | null;
}

export interface GuestOrderView {
  orderNumber: string;
  status: OrderStatus;
  guestMinecraftNick: string | null;
  subtotal: DecimalString;
  discountAmount: DecimalString;
  total: DecimalString;
  createdAt: string;
  paidAt: string | null;
  deliveryStatus: DeliveryStatus | null;
  items: GuestOrderItem[];
}

/// POST, токен в теле: не попадает в URL, историю и логи.
export function lookupGuestOrder(token: string, signal?: AbortSignal): Promise<GuestOrderView> {
  return api.post<GuestOrderView>(
    '/store/orders/guest/lookup',
    { token },
    { auth: false, retryOn401: false, signal },
  );
}

export const GUEST_NOT_FOUND_TEXT = 'Заказ не найден';
