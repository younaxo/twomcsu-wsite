import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

/// Зеркало STORE_CART_ERROR_CODES из @twomc/shared (api не импортирует shared).
export const StoreCartError = {
  PROMO_NOT_FOUND: 'PROMO_NOT_FOUND',
  PROMO_NOT_STARTED: 'PROMO_NOT_STARTED',
  PROMO_EXPIRED: 'PROMO_EXPIRED',
  PROMO_EXHAUSTED: 'PROMO_EXHAUSTED',
  PROMO_NOT_APPLICABLE: 'PROMO_NOT_APPLICABLE',
  PROMO_MIN_AMOUNT: 'PROMO_MIN_AMOUNT',
  PROMO_FIRST_PURCHASE_ONLY: 'PROMO_FIRST_PURCHASE_ONLY',
  CART_MAX_PER_PURCHASE: 'CART_MAX_PER_PURCHASE',
  CART_UNIQUE_DUPLICATE: 'CART_UNIQUE_DUPLICATE',
  CART_UNIQUE_ALREADY_OWNED: 'CART_UNIQUE_ALREADY_OWNED',
  CART_GIFT_NOT_ALLOWED: 'CART_GIFT_NOT_ALLOWED',
  CART_GIFT_UNAVAILABLE: 'CART_GIFT_UNAVAILABLE',
  CART_GIFT_RATE_LIMITED: 'CART_GIFT_RATE_LIMITED',
} as const;

export type StoreCartErrorCode =
  (typeof StoreCartError)[keyof typeof StoreCartError];

export interface CartPromoError {
  code: StoreCartErrorCode;
  message: string;
}

export function badRequest(code: StoreCartErrorCode, message: string) {
  return new BadRequestException({ code, message });
}

export function conflict(code: StoreCartErrorCode, message: string) {
  return new ConflictException({ code, message });
}

export function notFound(code: StoreCartErrorCode, message: string) {
  return new NotFoundException({ code, message });
}

/// Если ошибка — отказ промокода (код PROMO_*), вернуть {code, message}.
export function toPromoError(error: unknown): CartPromoError | null {
  if (!(error instanceof HttpException)) {
    return null;
  }
  const body = error.getResponse();
  if (
    typeof body === 'object' &&
    body !== null &&
    'code' in body &&
    typeof (body as { code: unknown }).code === 'string' &&
    (body as { code: string }).code.startsWith('PROMO_')
  ) {
    const { code, message } = body as { code: string; message: unknown };
    return {
      code: code as StoreCartErrorCode,
      message: typeof message === 'string' ? message : error.message,
    };
  }
  return null;
}

/// Коды оформления заказа (0.5). Отдельно от StoreCartError: это не отказы
/// корзины/промокода, и они не должны попадать под `toPromoError`.
export const StoreCheckoutError = {
  OFFER_NOT_ACCEPTED: 'offer_not_accepted',
  OFFER_VERSION_MISMATCH: 'offer_version_mismatch',
  NICK_REQUIRED: 'nick_required',
  /// Единый ответ на «ник неизвестен сайту»: причина не раскрывается (ADR-0186).
  NICK_UNAVAILABLE: 'nick_unavailable',
  PAYMENT_UNAVAILABLE: 'payment_unavailable',
  /// Маршрутизатор способов оплаты (0.8b, ADR-0193).
  PAYMENT_METHOD_REQUIRED: 'payment_method_required',
  PAYMENT_METHOD_INVALID: 'payment_method_invalid',
  PAYMENT_METHOD_UNAVAILABLE: 'payment_method_unavailable',
  QUICK_BUY_DISABLED: 'quick_buy_disabled',
  /// Товар недоступен без входа (личный, уникальный, валюта): причина не раскрывается (ADR-0186 Р6).
  LOGIN_REQUIRED: 'login_required',
  /// Платное снятие наказаний не настроено или выключено (0.12b): не зависит от ника.
  PAID_REMOVAL_UNAVAILABLE: 'paid_removal_unavailable',
  /// Снятие наказания продаётся только по одной штуке на позицию.
  PAID_REMOVAL_SINGLE_ONLY: 'paid_removal_single_only',
} as const;

export type StoreCheckoutErrorCode =
  (typeof StoreCheckoutError)[keyof typeof StoreCheckoutError];

export function checkoutBadRequest(
  code: StoreCheckoutErrorCode,
  message: string,
) {
  return new BadRequestException({ code, message });
}

export function paymentUnavailable() {
  return new ServiceUnavailableException({
    code: StoreCheckoutError.PAYMENT_UNAVAILABLE,
    message: 'Оплата временно недоступна',
  });
}

export function quickBuyDisabled() {
  return new ForbiddenException({
    code: StoreCheckoutError.QUICK_BUY_DISABLED,
    message: 'Покупка без входа сейчас недоступна — войдите в аккаунт',
  });
}

export function loginRequired() {
  return new ForbiddenException({
    code: StoreCheckoutError.LOGIN_REQUIRED,
    message: 'Этот товар можно купить только после входа в аккаунт',
  });
}

export function paidRemovalUnavailable() {
  return new ServiceUnavailableException({
    code: StoreCheckoutError.PAID_REMOVAL_UNAVAILABLE,
    message: 'Снятие наказания за покупку сейчас недоступно',
  });
}

export function paymentMethodRequired() {
  return new BadRequestException({
    code: StoreCheckoutError.PAYMENT_METHOD_REQUIRED,
    message: 'Выберите способ оплаты',
  });
}

export function paymentMethodInvalid() {
  return new BadRequestException({
    code: StoreCheckoutError.PAYMENT_METHOD_INVALID,
    message: 'Неизвестный способ оплаты',
  });
}

/// Способ выключен либо у него нет рабочего провайдера: причина не раскрывается.
export function paymentMethodUnavailable() {
  return new BadRequestException({
    code: StoreCheckoutError.PAYMENT_METHOD_UNAVAILABLE,
    message: 'Этот способ оплаты сейчас недоступен',
  });
}
