/// Единый формат ошибок платёжного провайдера (ADR-0187). Сообщение и поля —
/// без секретов, URL с ключами, тел запросов и ПДн: код + признак повтора.
export type PaymentProviderErrorCode =
  /// сеть недоступна, таймаут, 5xx, 429 — повтор имеет смысл
  | 'unavailable'
  | 'timeout'
  /// провайдер отказал по существу (4xx кроме 404/429): повтор не поможет
  | 'rejected'
  | 'not_found'
  /// возврат больше остатка либо платёж не в оплаченном состоянии
  | 'refund_not_allowed'
  /// ответ провайдера не соответствует контракту
  | 'invalid_response'
  /// провайдер не настроен (нет ключей/секретов) — fail closed
  | 'not_configured';

const RETRYABLE: ReadonlySet<PaymentProviderErrorCode> = new Set([
  'unavailable',
  'timeout',
]);

export class PaymentProviderError extends Error {
  readonly code: PaymentProviderErrorCode;
  readonly retryable: boolean;

  constructor(code: PaymentProviderErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'PaymentProviderError';
    this.code = code;
    this.retryable = RETRYABLE.has(code);
  }
}

export function isPaymentProviderError(
  error: unknown,
): error is PaymentProviderError {
  return error instanceof PaymentProviderError;
}
