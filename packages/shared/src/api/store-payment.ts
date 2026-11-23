/// Способы оплаты магазина (0.8b, ADR-0193). Только типы и константы:
/// маршрутизацию способа к провайдеру выполняет API, клиент видит лишь код,
/// название и валюту. Тело 4xx: `{ code: StorePaymentErrorCode, message }`.

export const PAYMENT_METHOD_CODES = [
  'SBP',
  'CARD_RU',
  'SBERPAY',
  'CRYPTO',
  'CARD_FOREIGN',
] as const;

export type PaymentMethodCode = (typeof PAYMENT_METHOD_CODES)[number];

/// Публичное описание включённого способа (GET /store/payment-methods).
export interface PublicPaymentMethod {
  code: PaymentMethodCode;
  title: string;
  currency: string;
}

export interface PaymentMethodsResponse {
  methods: PublicPaymentMethod[];
}

export const STORE_PAYMENT_ERROR_CODES = {
  /// Способ включён, но не выбран в запросе.
  PAYMENT_METHOD_REQUIRED: 'payment_method_required',
  /// Код способа не из списка.
  PAYMENT_METHOD_INVALID: 'payment_method_invalid',
  /// Способ выключен или у него нет рабочего провайдера (причина не раскрывается).
  PAYMENT_METHOD_UNAVAILABLE: 'payment_method_unavailable',
} as const;

export type StorePaymentErrorCode =
  (typeof STORE_PAYMENT_ERROR_CODES)[keyof typeof STORE_PAYMENT_ERROR_CODES];
