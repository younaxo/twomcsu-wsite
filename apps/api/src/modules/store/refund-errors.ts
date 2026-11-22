import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
  UnprocessableEntityException,
} from '@nestjs/common';

/// Машинные коды ошибок возвратов (0.9, ADR-0188).
export const RefundError = {
  DISABLED: 'refunds_disabled',
  REASON_REQUIRED: 'refund_reason_required',
  TWO_FACTOR_REQUIRED: 'refund_two_factor_required',
  TWO_FACTOR_INVALID: 'refund_two_factor_invalid',
  AMOUNT_INVALID: 'refund_amount_invalid',
  EXCEEDS_PAID: 'refund_exceeds_paid',
  ORDER_NOT_REFUNDABLE: 'order_not_refundable',
  ALREADY_REFUNDED: 'order_already_refunded',
  IN_PROGRESS: 'refund_in_progress',
  AFTER_DELIVERY: 'refund_after_delivery',
  OVERRIDE_NOT_NEEDED: 'refund_override_not_needed',
  RUBIES_UNSUPPORTED: 'refund_rubies_unsupported',
  PAYMENT_UNAVAILABLE: 'payment_unavailable',
  USE_REFUNDS_API: 'refund_use_refunds_api',
  TWO_FACTOR_LOCKED: 'refund_two_factor_locked',
  NOT_PENDING: 'refund_not_pending',
} as const;

export type RefundErrorCode = (typeof RefundError)[keyof typeof RefundError];

export const refundDisabled = () =>
  new ServiceUnavailableException({
    code: RefundError.DISABLED,
    message: 'Возвраты отключены',
  });

export const refundBadRequest = (code: RefundErrorCode, message: string) =>
  new BadRequestException({ code, message });

export const refundForbidden = (code: RefundErrorCode, message: string) =>
  new ForbiddenException({ code, message });

export const refundConflict = (code: RefundErrorCode, message: string) =>
  new ConflictException({ code, message });

export const refundUnprocessable = (code: RefundErrorCode, message: string) =>
  new UnprocessableEntityException({ code, message });

export const refundPaymentUnavailable = () =>
  new ServiceUnavailableException({
    code: RefundError.PAYMENT_UNAVAILABLE,
    message: 'Платёжный провайдер недоступен',
  });

/// Слишком много неверных кодов 2FA подряд (защита от перебора).
export const refundTwoFactorLocked = () =>
  new HttpException(
    {
      code: RefundError.TWO_FACTOR_LOCKED,
      message: 'Слишком много неверных кодов. Повторите позже',
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
